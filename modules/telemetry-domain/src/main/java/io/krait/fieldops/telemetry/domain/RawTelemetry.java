package io.krait.fieldops.telemetry.domain;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public record RawTelemetry(
        String eventId,
        String schemaVersion,
        String tenantId,
        String siteId,
        String deviceId,
        String sessionId,
        Instant sessionStartedAt,
        long sequence,
        Instant observedAt,
        Instant receivedAt,
        List<RawMetric> metrics,
        String payloadDigest,
        String traceId,
        String correlationId) {
    public RawTelemetry {
        Objects.requireNonNull(eventId, "eventId");
        Objects.requireNonNull(schemaVersion, "schemaVersion");
        Objects.requireNonNull(tenantId, "tenantId");
        Objects.requireNonNull(siteId, "siteId");
        Objects.requireNonNull(deviceId, "deviceId");
        Objects.requireNonNull(sessionId, "sessionId");
        Objects.requireNonNull(sessionStartedAt, "sessionStartedAt");
        Objects.requireNonNull(observedAt, "observedAt");
        Objects.requireNonNull(receivedAt, "receivedAt");
        Objects.requireNonNull(metrics, "metrics");
        Objects.requireNonNull(payloadDigest, "payloadDigest");
        metrics = List.copyOf(metrics);
        if (!"2.0.0".equals(schemaVersion) || sequence < 0 || metrics.isEmpty()) {
            throw new IllegalArgumentException("invalid raw telemetry envelope");
        }
    }
}
