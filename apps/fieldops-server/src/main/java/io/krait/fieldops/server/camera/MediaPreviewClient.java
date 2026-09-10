package io.krait.fieldops.server.camera;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
@Profile("b04-camera")
public class MediaPreviewClient {
    private final RestClient client;

    public MediaPreviewClient(@Value("${fieldops.b04.media.base-url}") String baseUrl) {
        this.client = RestClient.builder().baseUrl(baseUrl).build();
    }

    public boolean ready(String cameraId) {
        try {
            PathStatus status = client.get().uri("/v3/paths/get/{cameraId}", cameraId)
                    .retrieve().body(PathStatus.class);
            return status != null && status.ready();
        } catch (RuntimeException error) {
            return false;
        }
    }

    private record PathStatus(boolean ready) {}
}
