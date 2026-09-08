package io.krait.fieldops.telemetry.application;

import java.time.Instant;
import java.util.List;

import io.krait.fieldops.telemetry.domain.RawMetric;
import io.krait.fieldops.telemetry.domain.RawTelemetry;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TelemetryNormalizerTests {
    private final TelemetryNormalizer normalizer = new TelemetryNormalizer();

    @Test
    void convertsTheCompleteTwoMetricSample() {
        var normalized = normalizer.normalize(sample(List.of(
                new RawMetric(TelemetryNormalizer.MOISTURE, 37.5, "%"),
                new RawMetric(TelemetryNormalizer.TEMPERATURE, 21.4, "Cel"))));

        assertThat(normalized.eventId()).isEqualTo("event-1");
        assertThat(normalized.metrics()).extracting(metric -> metric.code())
                .containsExactly(TelemetryNormalizer.MOISTURE, TelemetryNormalizer.TEMPERATURE);
        assertThat(normalized.metrics()).allMatch(metric -> "GOOD".equals(metric.quality()));
    }

    @Test
    void rejectsSparseDuplicateAndOutOfRangeSamples() {
        assertThatThrownBy(() -> normalizer.normalize(sample(List.of(
                new RawMetric(TelemetryNormalizer.MOISTURE, 37.5, "%")))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> normalizer.normalize(sample(List.of(
                new RawMetric(TelemetryNormalizer.MOISTURE, 37.5, "%"),
                new RawMetric(TelemetryNormalizer.MOISTURE, 38.0, "%")))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> normalizer.normalize(sample(List.of(
                new RawMetric(TelemetryNormalizer.MOISTURE, 101, "%"),
                new RawMetric(TelemetryNormalizer.TEMPERATURE, 21.4, "Cel")))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static RawTelemetry sample(List<RawMetric> metrics) {
        Instant now = Instant.parse("2026-09-07T00:00:00Z");
        return new RawTelemetry("event-1", "2.0.0", "tenant-a", "site-a", "device-a-soil-01",
                "session-1", now, 1, now, now.plusMillis(20), metrics,
                "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", null, null);
    }
}
