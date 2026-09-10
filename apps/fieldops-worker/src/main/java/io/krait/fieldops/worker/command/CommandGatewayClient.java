package io.krait.fieldops.worker.command;

import java.time.Instant;
import java.util.UUID;

import io.krait.fieldops.command.domain.CommandScenario;
import io.krait.fieldops.command.domain.CommandType;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
@Profile("b05-command")
public class CommandGatewayClient {
    private final RestClient client;
    private final String token;

    public CommandGatewayClient(@Value("${fieldops.b05.gateway-base-url}") String baseUrl,
            @Value("${fieldops.b05.internal-token}") String token) {
        this.client = RestClient.builder().baseUrl(baseUrl).build();
        this.token = token;
    }

    public Result deliver(CommandLedger.ClaimedCommand command) {
        return client.post().uri("/internal/v1/commands/{commandId}", command.commandId())
                .header("X-FieldOps-Internal-Token", token)
                .body(new Request(command.tenantId(), command.deviceId(), command.type(),
                        command.scenario(), command.payloadHash()))
                .retrieve().body(Result.class);
    }

    public Result status(UUID commandId) {
        return client.get().uri("/internal/v1/commands/{commandId}", commandId)
                .header("X-FieldOps-Internal-Token", token).retrieve().body(Result.class);
    }

    record Request(String tenantId, String deviceId, CommandType type,
            CommandScenario scenario, String payloadHash) {}
    public record Result(UUID commandId, String payloadHash, String status,
            String observedState, int actuationCount, Instant observedAt) {}
}
