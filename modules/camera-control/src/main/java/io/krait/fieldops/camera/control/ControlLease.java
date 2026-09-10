package io.krait.fieldops.camera.control;

import java.time.Instant;

public record ControlLease(
        String cameraId,
        String ownerId,
        String sessionId,
        long generation,
        Instant expiresAt) {
    public ControlLease {
        if (cameraId == null || cameraId.isBlank()) throw new IllegalArgumentException("cameraId is required");
        if (ownerId == null || ownerId.isBlank()) throw new IllegalArgumentException("ownerId is required");
        if (sessionId == null || sessionId.isBlank()) throw new IllegalArgumentException("sessionId is required");
        if (generation < 1) throw new IllegalArgumentException("generation must be positive");
        if (expiresAt == null) throw new IllegalArgumentException("expiresAt is required");
    }

    public String fenceValue() {
        return ownerId + "|" + sessionId + "|" + generation;
    }
}
