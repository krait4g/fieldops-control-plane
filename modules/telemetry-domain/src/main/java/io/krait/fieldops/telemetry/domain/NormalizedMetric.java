package io.krait.fieldops.telemetry.domain;

import java.time.Instant;
import java.util.Objects;

public record NormalizedMetric(String code, String displayName, double value, String unit,
        String quality, Instant observedAt) {
    public NormalizedMetric {
        Objects.requireNonNull(code, "code");
        Objects.requireNonNull(displayName, "displayName");
        Objects.requireNonNull(unit, "unit");
        Objects.requireNonNull(quality, "quality");
        Objects.requireNonNull(observedAt, "observedAt");
        if (!Double.isFinite(value)) {
            throw new IllegalArgumentException("metric value must be finite");
        }
    }
}
