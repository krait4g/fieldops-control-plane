package io.krait.fieldops.simulator.telemetry;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.assertj.core.data.Offset;

class SyntheticTelemetryRunnerTests {
    @Test
    void normalModeOptionsRemainUnchanged() {
        SyntheticTelemetryRunner.Options defaults = SyntheticTelemetryRunner.Options.parse(new String[] {});
        assertThat(defaults.device()).isEqualTo("all");
        assertThat(defaults.count()).isEqualTo(3);
        assertThat(defaults.seed()).isEqualTo(42L);
        assertThat(defaults.intervalMillis()).isEqualTo(2_000L);
        assertThat(defaults.scenario()).isEqualTo("random");

        SyntheticTelemetryRunner.Options faults = SyntheticTelemetryRunner.Options.parse(new String[] {
                "--seed=7", "--duplicate=true", "--reorder=true"
        });
        assertThat(faults.seed()).isEqualTo(7L);
        assertThat(faults.duplicate()).isTrue();
        assertThat(faults.reorder()).isTrue();
    }

    @Test
    void portfolioScenarioIsDeterministicAndNeverUsesFutureObservationTime() {
        Instant startedAt = Instant.parse("2026-09-08T12:00:00Z");
        List<PortfolioScenario.Point> first = PortfolioScenario.pointsFor("device-a-soil-01", startedAt);
        List<PortfolioScenario.Point> second = PortfolioScenario.pointsFor("device-a-soil-01", startedAt);

        assertThat(first).isEqualTo(second).hasSize(8);
        assertThat(first.getFirst().observedAt()).isEqualTo(startedAt.minus(Duration.ofMinutes(35)));
        assertThat(first.getLast().observedAt()).isEqualTo(startedAt);
        assertThat(first).allSatisfy(point -> assertThat(point.observedAt()).isBeforeOrEqualTo(startedAt));
        assertThat(first).extracting(PortfolioScenario.Point::sequence)
                .containsExactly(1L, 2L, 3L, 4L, 5L, 6L, 7L, 8L);
        assertThat(first.get(3).metrics().getFirst().value()).isNotEqualTo(
                first.get(4).metrics().getFirst().value());
    }

    @Test
    void portfolioScenarioAppliesStablePerDeviceOffsets() {
        Instant startedAt = Instant.parse("2026-09-08T12:00:00Z");
        double first = PortfolioScenario.pointsFor("device-a-soil-01", startedAt)
                .getFirst().metrics().getFirst().value();
        double third = PortfolioScenario.pointsFor("device-a-soil-03", startedAt)
                .getFirst().metrics().getFirst().value();
        assertThat(third - first).isCloseTo(1.2, Offset.offset(0.000_001));
    }

    @Test
    void unknownScenarioIsRejected() {
        assertThatThrownBy(() -> SyntheticTelemetryRunner.Options.parse(
                new String[] { "--scenario=production" }))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unknown simulator scenario");
    }
}
