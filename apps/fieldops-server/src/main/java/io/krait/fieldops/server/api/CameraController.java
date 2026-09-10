package io.krait.fieldops.server.api;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import io.krait.fieldops.camera.control.ControlLease;
import io.krait.fieldops.camera.control.PtzCommand;
import io.krait.fieldops.server.auth.ScopeService;
import io.krait.fieldops.server.camera.CameraGatewayClient;
import io.krait.fieldops.server.camera.CameraQueryService;
import io.krait.fieldops.server.camera.CameraQueryService.CameraRow;
import io.krait.fieldops.server.camera.RedisCameraLeaseService;
import io.krait.fieldops.server.camera.MediaPreviewClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("b04-camera")
@RequestMapping("/api/v1/cameras")
public class CameraController {
    private final ScopeService scopes;
    private final CameraQueryService cameras;
    private final RedisCameraLeaseService leases;
    private final CameraGatewayClient gateway;
    private final MediaPreviewClient media;
    private final String previewUrl;
    private final String websocketBaseUrl;
    private final Duration ttl;
    private final Duration heartbeatInterval;

    public CameraController(ScopeService scopes, CameraQueryService cameras,
            RedisCameraLeaseService leases, CameraGatewayClient gateway, MediaPreviewClient media,
            @Value("${fieldops.b04.preview-url}") String previewUrl,
            @Value("${fieldops.b04.websocket-base-url}") String websocketBaseUrl,
            @Value("${fieldops.b04.lease.ttl:5s}") Duration ttl,
            @Value("${fieldops.b04.lease.heartbeat-interval:1s}") Duration heartbeatInterval) {
        this.scopes = scopes;
        this.cameras = cameras;
        this.leases = leases;
        this.gateway = gateway;
        this.media = media;
        this.previewUrl = previewUrl;
        this.websocketBaseUrl = websocketBaseUrl;
        this.ttl = ttl;
        this.heartbeatInterval = heartbeatInterval;
    }

    @GetMapping
    CameraList list(@AuthenticationPrincipal OidcUser user,
            @RequestParam String tenantId, @RequestParam String siteId) {
        scopes.requireSite(user, tenantId, siteId, "CAMERA_READ");
        List<CameraSummary> items = cameras.list(tenantId, siteId).stream()
                .map(row -> summary(row, previewState(row.id())))
                .toList();
        return new CameraList(items);
    }

    @GetMapping("/{cameraId}")
    CameraDetail detail(@AuthenticationPrincipal OidcUser user, @PathVariable String cameraId,
            @RequestParam String tenantId) {
        scopes.requireCamera(user, tenantId, cameraId, "CAMERA_READ");
        CameraRow row = cameras.get(tenantId, cameraId);
        return new CameraDetail(row.id(), row.tenantId(), row.siteId(), row.name(), row.zoneName(),
                previewState(cameraId), controlState(cameraId),
                new PreviewDescriptor("WEBRTC", previewUrl, "16:9"));
    }

    @GetMapping("/{cameraId}/status")
    CameraStatus status(@AuthenticationPrincipal OidcUser user, @PathVariable String cameraId,
            @RequestParam String tenantId) {
        scopes.requireCamera(user, tenantId, cameraId, "CAMERA_READ");
        CameraGatewayClient.GatewayStatus status = gateway.status(cameraId);
        return new CameraStatus(cameraId, status.connected() ? "READY" : "UNAVAILABLE",
                status.pose(), status.observedAt());
    }

    @PostMapping("/{cameraId}/control-sessions")
    ResponseEntity<ControlSession> acquire(@AuthenticationPrincipal OidcUser user,
            @PathVariable String cameraId, @RequestParam String tenantId) {
        scopes.requireCamera(user, tenantId, cameraId, "CAMERA_CONTROL");
        ControlLease lease = leases.acquire(cameraId, scopes.subject(user));
        String websocketUrl = "%s/api/v1/cameras/%s/ptz?tenantId=%s&sessionId=%s&generation=%d"
                .formatted(websocketBaseUrl, cameraId, tenantId, lease.sessionId(), lease.generation());
        ControlSession response = new ControlSession(lease.sessionId(), cameraId, lease.generation(),
                ttl.toMillis(), heartbeatInterval.toMillis(), lease.expiresAt(), websocketUrl);
        return ResponseEntity.created(URI.create("/api/v1/cameras/%s/control-sessions/%s"
                .formatted(cameraId, lease.sessionId()))).body(response);
    }

    @DeleteMapping("/{cameraId}/control-sessions/{sessionId}")
    ResponseEntity<Void> release(@AuthenticationPrincipal OidcUser user,
            @PathVariable String cameraId, @PathVariable String sessionId,
            @RequestParam String tenantId, @RequestParam long generation) {
        scopes.requireCamera(user, tenantId, cameraId, "CAMERA_CONTROL");
        String ownerId = scopes.subject(user);
        gateway.send(cameraId, PtzCommand.stop(ownerId, sessionId, generation,
                Long.MAX_VALUE, "USER_REQUEST"));
        leases.release(cameraId, ownerId, sessionId, generation);
        return ResponseEntity.noContent().build();
    }

    private CameraSummary summary(CameraRow row, String previewState) {
        return new CameraSummary(row.id(), row.tenantId(), row.siteId(), row.name(), row.zoneName(),
                previewState, controlState(row.id()));
    }

    private String previewState(String cameraId) {
        return media.ready(cameraId) ? "READY" : "UNAVAILABLE";
    }

    private String controlState(String cameraId) {
        try {
            if (!gateway.status(cameraId).connected()) return "UNAVAILABLE";
            return leases.held(cameraId) ? "HELD" : "AVAILABLE";
        } catch (RuntimeException error) {
            return "UNAVAILABLE";
        }
    }

    public record CameraList(List<CameraSummary> items) {}
    public record CameraSummary(String id, String tenantId, String siteId, String name,
            String zoneName, String previewState, String controlState) {}
    public record CameraDetail(String id, String tenantId, String siteId, String name,
            String zoneName, String previewState, String controlState, PreviewDescriptor preview) {}
    public record PreviewDescriptor(String transport, String url, String aspectRatio) {}
    public record CameraStatus(String cameraId, String previewState,
            CameraGatewayClient.Pose pose, Instant observedAt) {}
    public record ControlSession(String sessionId, String cameraId, long generation,
            long leaseTtlMs, long heartbeatIntervalMs, Instant expiresAt, String websocketUrl) {}
}
