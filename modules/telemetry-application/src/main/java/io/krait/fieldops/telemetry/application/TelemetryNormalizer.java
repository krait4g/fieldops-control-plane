package io.krait.fieldops.telemetry.application;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import io.krait.fieldops.telemetry.domain.NormalizedMetric;
import io.krait.fieldops.telemetry.domain.NormalizedTelemetry;
import io.krait.fieldops.telemetry.domain.RawMetric;
import io.krait.fieldops.telemetry.domain.RawTelemetry;

public final class TelemetryNormalizer {
    public static final String MOISTURE = "soil.moisture.pct";
    public static final String TEMPERATURE = "soil.temperature.c";
    private static final Set<String> COMPLETE_SAMPLE = Set.of(MOISTURE, TEMPERATURE);
    private static final Map<String, Definition> DEFINITIONS = definitions();

    public NormalizedTelemetry normalize(RawTelemetry raw) {
        Set<String> codes = raw.metrics().stream().map(RawMetric::code).collect(Collectors.toSet());
        if (raw.metrics().size() != COMPLETE_SAMPLE.size() || !codes.equals(COMPLETE_SAMPLE)) {
            throw new IllegalArgumentException("B02 sample must contain each soil metric exactly once");
        }
        List<NormalizedMetric> metrics = raw.metrics().stream().map(metric -> {
            Definition definition = DEFINITIONS.get(metric.code());
            if (!definition.unit().equals(metric.unit())) {
                throw new IllegalArgumentException("metric unit mismatch: " + metric.code());
            }
            if (metric.value() < definition.minimum() || metric.value() > definition.maximum()) {
                throw new IllegalArgumentException("metric value outside the synthetic profile: " + metric.code());
            }
            return new NormalizedMetric(metric.code(), definition.displayName(), metric.value(),
                    metric.unit(), "GOOD", raw.observedAt());
        }).toList();
        return new NormalizedTelemetry(raw.eventId(), raw.schemaVersion(), raw.tenantId(), raw.siteId(),
                raw.deviceId(), raw.sessionId(), raw.sessionStartedAt(), raw.sequence(), raw.observedAt(),
                raw.receivedAt(), metrics, raw.payloadDigest(), raw.traceId(), raw.correlationId());
    }

    private static Map<String, Definition> definitions() {
        Map<String, Definition> definitions = new LinkedHashMap<>();
        definitions.put(MOISTURE, new Definition("Soil moisture", "%", 0, 100));
        definitions.put(TEMPERATURE, new Definition("Soil temperature", "Cel", -20, 80));
        return Map.copyOf(definitions);
    }

    private record Definition(String displayName, String unit, double minimum, double maximum) {}
}
