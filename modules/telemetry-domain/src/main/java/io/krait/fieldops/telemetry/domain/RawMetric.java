package io.krait.fieldops.telemetry.domain;

import java.util.Objects;

public record RawMetric(String code, double value, String unit) {
    public RawMetric {
        Objects.requireNonNull(code, "code");
        Objects.requireNonNull(unit, "unit");
        if (code.isBlank() || unit.isBlank() || !Double.isFinite(value)) {
            throw new IllegalArgumentException("metric code, finite value, and unit are required");
        }
    }
}
