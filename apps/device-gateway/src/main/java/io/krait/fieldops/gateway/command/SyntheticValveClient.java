package io.krait.fieldops.gateway.command;

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
public class SyntheticValveClient {
    private final RestClient client;

    public SyntheticValveClient(@Value("${fieldops.b05.simulator-base-url}") String baseUrl) {
        this.client = RestClient.builder().baseUrl(baseUrl).build();
    }

    public ValveResult deliver(String deviceId, UUID commandId, CommandType type, CommandScenario scenario) {
        return client.post().uri("/synthetic/v1/valves/{deviceId}/commands", deviceId)
                .body(new ValveRequest(commandId, type, scenario)).retrieve().body(ValveResult.class);
    }

    public ValveResult status(String deviceId, UUID commandId) {
        return client.get().uri("/synthetic/v1/valves/{deviceId}/commands/{commandId}", deviceId, commandId)
                .retrieve().body(ValveResult.class);
    }

    record ValveRequest(UUID commandId, CommandType type, CommandScenario scenario) {}
    public record ValveResult(UUID commandId, String status, String observedState,
            int actuationCount, Instant observedAt) {}
}
