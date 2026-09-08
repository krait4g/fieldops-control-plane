package io.krait.fieldops.telemetry.domain;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public record DeviceSample(
        String eventId,
        String schemaVersion,
        String tenantId,
        String siteId,
        String deviceId,
        String sessionId,
        Instant sessionStartedAt,
        long sequence,
        Instant observedAt,
        List<RawMetric> metrics) {
    public DeviceSample {
        Objects.requireNonNull(eventId, "eventId");
        Objects.requireNonNull(schemaVersion, "schemaVersion");
        Objects.requireNonNull(tenantId, "tenantId");
        Objects.requireNonNull(siteId, "siteId");
        Objects.requireNonNull(deviceId, "deviceId");
        Objects.requireNonNull(sessionId, "sessionId");
        Objects.requireNonNull(sessionStartedAt, "sessionStartedAt");
        Objects.requireNonNull(observedAt, "observedAt");
        Objects.requireNonNull(metrics, "metrics");
        metrics = List.copyOf(metrics);
    }
}
