package io.krait.fieldops.server.camera;

import java.time.Instant;

import io.krait.fieldops.camera.control.PtzCommand;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
@Profile("b04-camera")
public class CameraGatewayClient {
    private final RestClient client;
    private final String internalToken;

    public CameraGatewayClient(@Value("${fieldops.b04.gateway.base-url}") String baseUrl,
            @Value("${fieldops.b04.gateway.internal-token}") String internalToken) {
        this.client = RestClient.builder().baseUrl(baseUrl).build();
        this.internalToken = internalToken;
    }

    public GatewayStatus status(String cameraId) {
        try {
            GatewayStatus status = client.get()
                    .uri("/internal/v1/cameras/{cameraId}/status", cameraId)
                    .header("X-FieldOps-Internal-Token", internalToken)
                    .retrieve()
                    .body(GatewayStatus.class);
            if (status == null) throw new IllegalStateException("Empty gateway status");
            return status;
        } catch (RestClientException | IllegalStateException error) {
            throw new CameraUnavailableException("Camera gateway status is unavailable.", error);
        }
    }

    public GatewayCommandResult send(String cameraId, PtzCommand command) {
        try {
            GatewayCommandResult result = client.post()
                    .uri("/internal/v1/cameras/{cameraId}/ptz", cameraId)
                    .header("X-FieldOps-Internal-Token", internalToken)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(command)
                    .retrieve()
                    .body(GatewayCommandResult.class);
            if (result == null) throw new IllegalStateException("Empty gateway command result");
            return result;
        } catch (RestClientException | IllegalStateException error) {
            throw new CameraUnavailableException("Camera gateway command is unavailable.", error);
        }
    }

    public record GatewayStatus(boolean connected, String streamUri, Pose pose, Instant observedAt) {}
    public record GatewayCommandResult(boolean accepted, String reason, Pose pose, Instant acceptedAt) {}
    public record Pose(double pan, double tilt, double zoom, boolean moving) {}
}
