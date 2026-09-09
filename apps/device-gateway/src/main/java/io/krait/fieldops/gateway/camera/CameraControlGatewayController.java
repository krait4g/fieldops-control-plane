package io.krait.fieldops.gateway.camera;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;

import io.krait.fieldops.camera.control.PtzCommand;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("b04-camera")
@RequestMapping("/internal/v1/cameras")
public class CameraControlGatewayController {
    private final StringRedisTemplate redis;
    private final OnvifPtzClient onvif;
    private final byte[] expectedToken;
    private final String configuredCameraId;
    private final ConcurrentHashMap<String, ReentrantLock> cameraLocks = new ConcurrentHashMap<>();

    public CameraControlGatewayController(StringRedisTemplate redis, OnvifPtzClient onvif,
            @Value("${fieldops.b04.internal-token}") String internalToken,
            @Value("${fieldops.b04.camera.id}") String configuredCameraId) {
        this.redis = redis;
        this.onvif = onvif;
        this.expectedToken = internalToken.getBytes(StandardCharsets.UTF_8);
        this.configuredCameraId = configuredCameraId;
    }

    @GetMapping("/{cameraId}/status")
    GatewayStatus status(@PathVariable String cameraId,
            @RequestHeader("X-FieldOps-Internal-Token") String internalToken) {
        authorize(cameraId, internalToken);
        OnvifPtzClient.CameraPose pose = onvif.status();
        return new GatewayStatus(true, onvif.streamUri(), pose, Instant.now());
    }

    @PostMapping("/{cameraId}/ptz")
    GatewayCommandResult command(@PathVariable String cameraId,
            @RequestHeader("X-FieldOps-Internal-Token") String internalToken,
            @RequestBody PtzCommand command) {
        authorize(cameraId, internalToken);
        ReentrantLock lock = cameraLocks.computeIfAbsent(cameraId, ignored -> new ReentrantLock());
        lock.lock();
        try {
            String currentFence = redis.opsForValue().get(leaseKey(cameraId));
            if (!command.fenceValue().equals(currentFence)) {
                return new GatewayCommandResult(false, "STALE_FENCE", null, Instant.now());
            }
            OnvifPtzClient.CameraPose pose = command.type() == PtzCommand.Type.STOP
                    ? onvif.stop()
                    : onvif.continuousMove(command.pan(), command.tilt(), command.zoom(), command.timeoutMs());
            return new GatewayCommandResult(true, "ACCEPTED", pose, Instant.now());
        } finally {
            lock.unlock();
        }
    }

    private void authorize(String cameraId, String suppliedToken) {
        if (!configuredCameraId.equals(cameraId)) throw new CameraGatewayNotFoundException();
        if (!MessageDigest.isEqual(expectedToken, suppliedToken.getBytes(StandardCharsets.UTF_8))) {
            throw new CameraGatewayForbiddenException();
        }
    }

    private static String leaseKey(String cameraId) {
        return "b04:camera:" + cameraId + ":lease";
    }

    public record GatewayStatus(boolean connected, String streamUri,
            OnvifPtzClient.CameraPose pose, Instant observedAt) {}
    public record GatewayCommandResult(boolean accepted, String reason,
            OnvifPtzClient.CameraPose pose, Instant acceptedAt) {}

    @ResponseStatus(HttpStatus.FORBIDDEN)
    private static final class CameraGatewayForbiddenException extends RuntimeException {
        private static final long serialVersionUID = 1L;
    }

    @ResponseStatus(HttpStatus.NOT_FOUND)
    private static final class CameraGatewayNotFoundException extends RuntimeException {
        private static final long serialVersionUID = 1L;
    }
}
