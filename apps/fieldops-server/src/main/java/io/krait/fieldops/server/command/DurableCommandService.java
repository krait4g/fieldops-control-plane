package io.krait.fieldops.server.command;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import io.krait.fieldops.command.domain.CommandLifecycle;
import io.krait.fieldops.command.domain.CommandPayload;
import io.krait.fieldops.command.domain.CommandScenario;
import io.krait.fieldops.command.domain.CommandStatus;
import io.krait.fieldops.command.domain.CommandType;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@Profile("b05-command")
public class DurableCommandService {
    private final JdbcClient jdbc;
    private final Clock clock;
    private final Duration deadline;
    private final TransactionTemplate nestedTransactions;

    @Autowired
    public DurableCommandService(JdbcClient jdbc, PlatformTransactionManager transactionManager,
            @Value("${fieldops.b05.deadline:4s}") Duration deadline) {
        this(jdbc, Clock.systemUTC(), deadline, nestedTemplate(transactionManager));
    }

    DurableCommandService(JdbcClient jdbc, Clock clock, Duration deadline,
            TransactionTemplate nestedTransactions) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.deadline = deadline;
        this.nestedTransactions = nestedTransactions;
    }

    @Transactional
    public CreateResult request(String tenantId, String siteId, String deviceId, CommandType type,
            CommandScenario scenario, String requester, String idempotencyKey) {
        validateKey(idempotencyKey);
        CommandPayload payload = new CommandPayload(tenantId, deviceId, type, scenario);
        String hash = payload.canonicalHash();
        CommandView existing = findByKey(tenantId, requester, idempotencyKey);
        if (existing != null) return existing.payloadHash().equals(hash)
                ? new CreateResult(existing, false) : mismatch();

        Instant now = clock.instant();
        UUID id = UUID.randomUUID();
        try {
            nestedTransactions.executeWithoutResult(ignored -> jdbc.sql("""
                    INSERT INTO b05_command(command_id, tenant_id, site_id, device_id, command_type,
                        scenario, status, requested_by_subject, idempotency_key, payload_hash,
                        deadline_at, created_at, updated_at, version)
                    VALUES (:id,:tenant,:site,:device,:type,:scenario,'PENDING_APPROVAL',:requester,
                        :key,:hash,:deadline,:now,:now,1)
                    """).param("id", id).param("tenant", tenantId).param("site", siteId)
                    .param("device", deviceId).param("type", type.name()).param("scenario", scenario.name())
                    .param("requester", requester).param("key", idempotencyKey).param("hash", hash)
                    .param("deadline", dbTime(now.plus(deadline))).param("now", dbTime(now)).update());
        } catch (DuplicateKeyException race) {
            CommandView raced = findByKey(tenantId, requester, idempotencyKey);
            if (raced == null || !raced.payloadHash().equals(hash)) return mismatch();
            return new CreateResult(raced, false);
        }
        append(id, null, CommandStatus.PENDING_APPROVAL, requester, "REQUESTED", now);
        return new CreateResult(get(tenantId, id), true);
    }

    @Transactional
    public CommandView decide(String tenantId, UUID commandId, String actor, boolean approve) {
        CommandView current = locked(tenantId, commandId);
        if (current.requester().equals(actor)) {
            throw new CommandException("SELF_APPROVAL_DENIED", "A requester cannot decide their own command");
        }
        CommandStatus target = approve ? CommandStatus.APPROVED : CommandStatus.REJECTED;
        CommandLifecycle.requireTransition(current.status(), target);
        Instant now = clock.instant();
        String reason = approve ? "APPROVED" : "REJECTED_BY_APPROVER";
        jdbc.sql("""
                UPDATE b05_command SET status=:status, decided_by_subject=:actor,
                    outcome_reason=:reason, deadline_at=:deadline, updated_at=:now, version=version+1
                WHERE tenant_id=:tenant AND command_id=:id AND status='PENDING_APPROVAL'
                """).param("status", target.name()).param("actor", actor).param("reason", reason)
                .param("deadline", dbTime(now.plus(deadline)))
                .param("now", dbTime(now)).param("tenant", tenantId).param("id", commandId).update();
        append(commandId, current.status(), target, actor, reason, now);
        return get(tenantId, commandId);
    }

    public List<CommandView> list(String tenantId, String siteId) {
        return jdbc.sql("""
                SELECT * FROM b05_command WHERE tenant_id=:tenant AND site_id=:site
                ORDER BY created_at DESC
                """).param("tenant", tenantId).param("site", siteId)
                .query((row, ignored) -> row(row)).list().stream().map(this::withTimeline).toList();
    }

    public CommandView get(String tenantId, UUID commandId) {
        return withTimeline(jdbc.sql("SELECT * FROM b05_command WHERE tenant_id=:tenant AND command_id=:id")
                .param("tenant", tenantId).param("id", commandId)
                .query((row, ignored) -> row(row)).optional()
                .orElseThrow(() -> new CommandException("COMMAND_NOT_FOUND", "Command was not found")));
    }

    private CommandView locked(String tenantId, UUID commandId) {
        return jdbc.sql("SELECT * FROM b05_command WHERE tenant_id=:tenant AND command_id=:id FOR UPDATE")
                .param("tenant", tenantId).param("id", commandId)
                .query((row, ignored) -> row(row)).optional()
                .orElseThrow(() -> new CommandException("COMMAND_NOT_FOUND", "Command was not found"));
    }

    private CommandView findByKey(String tenantId, String requester, String key) {
        return jdbc.sql("""
                SELECT * FROM b05_command WHERE tenant_id=:tenant
                  AND requested_by_subject=:requester AND idempotency_key=:key
                """).param("tenant", tenantId).param("requester", requester).param("key", key)
                .query((row, ignored) -> row(row)).optional().map(this::withTimeline).orElse(null);
    }

    private CommandView withTimeline(CommandView command) {
        List<TransitionView> transitions = jdbc.sql("""
                SELECT sequence_no, from_status, to_status, actor_subject, reason_code, occurred_at
                FROM b05_command_transition WHERE command_id=:id ORDER BY sequence_no
                """).param("id", command.commandId()).query((row, ignored) -> new TransitionView(
                        row.getInt("sequence_no"), nullableStatus(row.getString("from_status")),
                        CommandStatus.valueOf(row.getString("to_status")), row.getString("actor_subject"),
                        row.getString("reason_code"), time(row.getObject("occurred_at")))).list();
        return command.withTransitions(transitions);
    }

    private void append(UUID id, CommandStatus from, CommandStatus to, String actor,
            String reason, Instant now) {
        Integer sequence = jdbc.sql("SELECT COALESCE(MAX(sequence_no),0)+1 FROM b05_command_transition WHERE command_id=:id")
                .param("id", id).query(Integer.class).single();
        jdbc.sql("""
                INSERT INTO b05_command_transition(command_id, sequence_no, from_status, to_status,
                    actor_subject, reason_code, occurred_at)
                VALUES (:id,:sequence,:fromStatus,:toStatus,:actor,:reason,:now)
                """).param("id", id).param("sequence", sequence).param("fromStatus", from == null ? null : from.name())
                .param("toStatus", to.name()).param("actor", actor).param("reason", reason)
                .param("now", dbTime(now)).update();
    }

    private CommandView row(java.sql.ResultSet row) throws java.sql.SQLException {
        return new CommandView(row.getObject("command_id", UUID.class), row.getString("tenant_id"),
                row.getString("site_id"), row.getString("device_id"),
                CommandType.valueOf(row.getString("command_type")),
                CommandScenario.valueOf(row.getString("scenario")),
                CommandStatus.valueOf(row.getString("status")), row.getString("requested_by_subject"),
                row.getString("decided_by_subject"), row.getString("outcome_reason"),
                row.getString("payload_hash"), time(row.getObject("created_at")),
                time(row.getObject("updated_at")), time(row.getObject("deadline_at")), List.of());
    }

    private static CommandStatus nullableStatus(String value) {
        return value == null ? null : CommandStatus.valueOf(value);
    }

    private static Instant time(Object value) {
        if (value instanceof OffsetDateTime offset) return offset.toInstant();
        if (value instanceof java.sql.Timestamp timestamp) return timestamp.toInstant();
        return Instant.parse(value.toString());
    }

    private static OffsetDateTime dbTime(Instant value) {
        return OffsetDateTime.ofInstant(value, ZoneOffset.UTC);
    }

    private static TransactionTemplate nestedTemplate(PlatformTransactionManager transactionManager) {
        TransactionTemplate template = new TransactionTemplate(transactionManager);
        template.setPropagationBehavior(TransactionDefinition.PROPAGATION_NESTED);
        return template;
    }

    private static void validateKey(String key) {
        if (key == null || !key.matches("[A-Za-z0-9._:-]{8,128}")) {
            throw new CommandException("INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must be 8 to 128 safe characters");
        }
    }

    private static CreateResult mismatch() {
        throw new CommandException("IDEMPOTENCY_PAYLOAD_MISMATCH",
                "Idempotency-Key was already used with a different command payload");
    }

    public record CreateResult(CommandView command, boolean created) {}
    public record TransitionView(int sequence, CommandStatus fromStatus, CommandStatus toStatus,
            String actor, String reason, Instant occurredAt) {}
    public record CommandView(UUID commandId, String tenantId, String siteId, String deviceId,
            CommandType type, CommandScenario scenario, CommandStatus status, String requester,
            String approver, String outcomeReason, String payloadHash, Instant createdAt,
            Instant updatedAt, Instant deadlineAt, List<TransitionView> transitions) {
        CommandView withTransitions(List<TransitionView> value) {
            return new CommandView(commandId, tenantId, siteId, deviceId, type, scenario, status,
                    requester, approver, outcomeReason, payloadHash, createdAt, updatedAt, deadlineAt, value);
        }
    }
}
