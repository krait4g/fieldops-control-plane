package io.krait.fieldops.worker.command;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import io.krait.fieldops.command.domain.CommandScenario;
import io.krait.fieldops.command.domain.CommandStatus;
import io.krait.fieldops.command.domain.CommandType;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component
@Profile("b05-command")
public class CommandLedger {
    static final String CLAIM_SQL = """
            SELECT command_id, tenant_id, device_id, command_type, scenario, payload_hash, deadline_at
            FROM b05_command WHERE status='APPROVED' ORDER BY created_at
            FOR UPDATE SKIP LOCKED LIMIT 1
            """;

    private final JdbcClient jdbc;
    private final TransactionTemplate transactions;

    public CommandLedger(JdbcClient jdbc, TransactionTemplate transactions) {
        this.jdbc = jdbc;
        this.transactions = transactions;
    }

    public ClaimedCommand claimNext(String workerId) {
        return transactions.execute(ignored -> jdbc.sql(CLAIM_SQL)
                .query((row, index) -> new ClaimedCommand(row.getObject("command_id", UUID.class),
                        row.getString("tenant_id"), row.getString("device_id"),
                        CommandType.valueOf(row.getString("command_type")),
                        CommandScenario.valueOf(row.getString("scenario")), row.getString("payload_hash"),
                        time(row.getObject("deadline_at"))))
                .optional().map(command -> {
                    Instant now = Instant.now();
                    int updated = jdbc.sql("""
                            UPDATE b05_command SET status='DISPATCHING', claimed_by=:worker,
                                claimed_at=:now, updated_at=:now, version=version+1
                            WHERE command_id=:id AND status='APPROVED'
                            """).param("worker", workerId).param("now", dbTime(now))
                            .param("id", command.commandId()).update();
                    if (updated != 1) throw new IllegalStateException("exclusive command claim was lost");
                    append(command.commandId(), CommandStatus.APPROVED, CommandStatus.DISPATCHING,
                            workerId, "CLAIMED", now);
                    return command;
                }).orElse(null));
    }

    public List<ClaimedCommand> awaitingOutcome() {
        return jdbc.sql("""
                SELECT command_id, tenant_id, device_id, command_type, scenario, payload_hash, deadline_at
                FROM b05_command WHERE status='ACKNOWLEDGED' ORDER BY updated_at
                """).query((row, index) -> new ClaimedCommand(row.getObject("command_id", UUID.class),
                        row.getString("tenant_id"), row.getString("device_id"),
                        CommandType.valueOf(row.getString("command_type")),
                        CommandScenario.valueOf(row.getString("scenario")), row.getString("payload_hash"),
                        time(row.getObject("deadline_at")))).list();
    }

    public void transition(UUID id, CommandStatus expected, CommandStatus target,
            String actor, String reason) {
        transactions.executeWithoutResult(ignored -> {
            Instant now = Instant.now();
            int updated = jdbc.sql("""
                    UPDATE b05_command SET status=:target, outcome_reason=:reason,
                        updated_at=:now, version=version+1 WHERE command_id=:id AND status=:expected
                    """).param("target", target.name()).param("reason", reason)
                    .param("now", dbTime(now)).param("id", id).param("expected", expected.name()).update();
            if (updated == 1) append(id, expected, target, actor, reason, now);
        });
    }

    private void append(UUID id, CommandStatus from, CommandStatus to, String actor,
            String reason, Instant now) {
        Integer sequence = jdbc.sql("SELECT COALESCE(MAX(sequence_no),0)+1 FROM b05_command_transition WHERE command_id=:id")
                .param("id", id).query(Integer.class).single();
        jdbc.sql("""
                INSERT INTO b05_command_transition(command_id, sequence_no, from_status, to_status,
                    actor_subject, reason_code, occurred_at)
                VALUES (:id,:sequence,:fromStatus,:toStatus,:actor,:reason,:now)
                """).param("id", id).param("sequence", sequence).param("fromStatus", from.name())
                .param("toStatus", to.name()).param("actor", actor).param("reason", reason)
                .param("now", dbTime(now)).update();
    }

    private static Instant time(Object value) {
        if (value instanceof OffsetDateTime offset) return offset.toInstant();
        if (value instanceof java.sql.Timestamp timestamp) return timestamp.toInstant();
        return Instant.parse(value.toString());
    }

    private static OffsetDateTime dbTime(Instant value) {
        return OffsetDateTime.ofInstant(value, ZoneOffset.UTC);
    }

    public record ClaimedCommand(UUID commandId, String tenantId, String deviceId, CommandType type,
            CommandScenario scenario, String payloadHash, Instant deadlineAt) {}
}
