package io.krait.fieldops.gateway.command;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import io.krait.fieldops.command.domain.CommandPayload;
import io.krait.fieldops.command.domain.CommandScenario;
import io.krait.fieldops.command.domain.CommandType;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("b05-command")
@RequestMapping("/internal/v1/commands")
public class DurableCommandGatewayController {
    private final JdbcClient jdbc;
    private final SyntheticValveClient valve;
    private final byte[] expectedToken;
    private final String configuredDeviceId;

    public DurableCommandGatewayController(JdbcClient jdbc, SyntheticValveClient valve,
            @Value("${fieldops.b05.internal-token}") String token,
            @Value("${fieldops.b05.device-id}") String deviceId) {
        this.jdbc = jdbc;
        this.valve = valve;
        this.expectedToken = token.getBytes(StandardCharsets.UTF_8);
        this.configuredDeviceId = deviceId;
    }

    @PostMapping("/{commandId}")
    public synchronized DeliveryResult deliver(@PathVariable UUID commandId,
            @RequestHeader("X-FieldOps-Internal-Token") String token,
            @RequestBody DeliveryRequest request) {
        authorize(token, request.deviceId());
        String actualHash = new CommandPayload(request.tenantId(), request.deviceId(),
                request.type(), request.scenario()).canonicalHash();
        if (!actualHash.equals(request.payloadHash())) throw new GatewayConflictException();
        Instant now = Instant.now();
        try {
            jdbc.sql("""
                    INSERT INTO b05_gateway_delivery(command_id, payload_hash, command_type, scenario,
                        delivery_status, observed_state, actuation_count, received_at, updated_at)
                    VALUES (:id, :hash, :type, :scenario, 'RECEIVED', NULL, 0, :now, :now)
                    """).param("id", commandId).param("hash", actualHash)
                    .param("type", request.type().name()).param("scenario", request.scenario().name())
                    .param("now", dbTime(now)).update();
        } catch (DuplicateKeyException duplicate) {
            DeliveryResult existing = receipt(commandId);
            if (!existing.payloadHash().equals(actualHash)) throw new GatewayConflictException();
            return existing;
        }
        SyntheticValveClient.ValveResult result = valve.deliver(request.deviceId(), commandId,
                request.type(), request.scenario());
        update(commandId, result);
        return receipt(commandId);
    }

    @GetMapping("/{commandId}")
    DeliveryResult status(@PathVariable UUID commandId,
            @RequestHeader("X-FieldOps-Internal-Token") String token) {
        authorizeToken(token);
        DeliveryResult current = receipt(commandId);
        if (current.status().equals("ACKNOWLEDGED") || current.status().equals("HANGING")) {
            SyntheticValveClient.ValveResult observed = valve.status(configuredDeviceId, commandId);
            update(commandId, observed);
            return receipt(commandId);
        }
        return current;
    }

    private void update(UUID commandId, SyntheticValveClient.ValveResult result) {
        jdbc.sql("""
                UPDATE b05_gateway_delivery SET delivery_status=:status, observed_state=:state,
                    actuation_count=:count, updated_at=:now WHERE command_id=:id
                """).param("status", result.status()).param("state", result.observedState())
                .param("count", result.actuationCount()).param("now", dbTime(Instant.now()))
                .param("id", commandId).update();
    }

    private DeliveryResult receipt(UUID commandId) {
        return jdbc.sql("""
                SELECT command_id, payload_hash, delivery_status, observed_state, actuation_count, updated_at
                FROM b05_gateway_delivery WHERE command_id=:id
                """).param("id", commandId).query((row, ignored) -> new DeliveryResult(
                        row.getObject("command_id", UUID.class), row.getString("payload_hash"),
                        row.getString("delivery_status"), row.getString("observed_state"),
                        row.getInt("actuation_count"), time(row.getObject("updated_at")))).single();
    }

    private void authorize(String token, String deviceId) {
        authorizeToken(token);
        if (!configuredDeviceId.equals(deviceId)) throw new GatewayNotFoundException();
    }

    private void authorizeToken(String token) {
        if (!MessageDigest.isEqual(expectedToken, token.getBytes(StandardCharsets.UTF_8))) {
            throw new GatewayForbiddenException();
        }
    }

    private static Instant time(Object value) {
        if (value instanceof OffsetDateTime offset) return offset.toInstant();
        if (value instanceof java.sql.Timestamp timestamp) return timestamp.toInstant();
        return Instant.parse(value.toString());
    }

    private static OffsetDateTime dbTime(Instant value) {
        return OffsetDateTime.ofInstant(value, ZoneOffset.UTC);
    }

    public record DeliveryRequest(String tenantId, String deviceId, CommandType type,
            CommandScenario scenario, String payloadHash) {}
    public record DeliveryResult(UUID commandId, String payloadHash, String status,
            String observedState, int actuationCount, Instant observedAt) {}

    @ResponseStatus(HttpStatus.CONFLICT)
    static final class GatewayConflictException extends RuntimeException { private static final long serialVersionUID = 1L; }
    @ResponseStatus(HttpStatus.FORBIDDEN)
    static final class GatewayForbiddenException extends RuntimeException { private static final long serialVersionUID = 1L; }
    @ResponseStatus(HttpStatus.NOT_FOUND)
    static final class GatewayNotFoundException extends RuntimeException { private static final long serialVersionUID = 1L; }
}
