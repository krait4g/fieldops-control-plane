package io.krait.fieldops.simulator.telemetry;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import io.krait.fieldops.telemetry.domain.RawMetric;

/**
 * Deterministic synthetic history for screenshots and demos only.
 * Samples still enter through MQTT and the complete production-shaped ingest path.
 */
final class PortfolioScenario {
    private static final List<Double> MOISTURE = List.of(34.0, 32.8, 31.5, 30.2, 38.4, 37.1, 36.0, 35.2);
    private static final List<Double> TEMPERATURE = List.of(20.8, 21.5, 22.4, 23.3, 24.1, 23.7, 23.0, 22.4);

    private PortfolioScenario() {}

    static List<Point> pointsFor(String deviceId, Instant sessionStartedAt) {
        int deviceOffset = deviceOffset(deviceId);
        Instant firstObservedAt = sessionStartedAt.minus(Duration.ofMinutes(35));
        List<Point> points = new ArrayList<>();
        for (int index = 0; index < MOISTURE.size(); index++) {
            points.add(new Point(
                    index + 1L,
                    firstObservedAt.plus(Duration.ofMinutes(index * 5L)),
                    List.of(
                            new RawMetric("soil.moisture.pct", MOISTURE.get(index) + deviceOffset * 0.6, "%"),
                            new RawMetric("soil.temperature.c", TEMPERATURE.get(index) + deviceOffset * 0.3, "Cel"))));
        }
        return List.copyOf(points);
    }

    private static int deviceOffset(String deviceId) {
        int separator = deviceId.lastIndexOf('-');
        if (separator < 0 || separator == deviceId.length() - 1) return 0;
        try {
            return Math.max(0, Integer.parseInt(deviceId.substring(separator + 1)) - 1);
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    record Point(long sequence, Instant observedAt, List<RawMetric> metrics) {}
}
