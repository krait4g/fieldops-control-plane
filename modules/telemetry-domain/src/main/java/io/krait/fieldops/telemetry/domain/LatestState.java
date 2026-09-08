package io.krait.fieldops.telemetry.domain;

import java.time.Instant;
import java.util.List;

public record LatestState(String tenantId, String siteId, String deviceId, String eventId,
        String sessionId, Instant sessionStartedAt, long sequence, Instant observedAt, Instant receivedAt,
        String payloadDigest, List<NormalizedMetric> metrics, String stateEpoch, long revision) {
    public LatestState {
        metrics = List.copyOf(metrics);
    }
}
