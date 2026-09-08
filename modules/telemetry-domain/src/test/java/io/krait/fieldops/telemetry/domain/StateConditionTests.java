package io.krait.fieldops.telemetry.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.Test;

class StateConditionTests {
    private static final Instant RECEIVED = Instant.parse("2026-09-08T00:00:00Z");

    @Test
    void usesOneBoundaryRuleForRealtimeBacklogAndOfflineState() {
        assertThat(derived(RECEIVED.plusSeconds(14), false).freshness()).isEqualTo("FRESH");
        assertThat(derived(RECEIVED.plusSeconds(15), false).freshness()).isEqualTo("STALE");
        assertThat(derived(RECEIVED.plusSeconds(30), false).connectivity()).isEqualTo("OFFLINE");
        assertThat(derived(RECEIVED.plusSeconds(30), false).readiness()).isEqualTo("UNKNOWN");
    }

    @Test
    void forcesPostgresFallbackStaleEvenForARecentSnapshot() {
        assertThat(derived(RECEIVED.plusSeconds(1), true).freshness()).isEqualTo("STALE");
    }

    private static StateCondition.Derived derived(Instant now, boolean forceStale) {
        return StateCondition.derive(RECEIVED, now, Duration.ofSeconds(15), Duration.ofSeconds(30), forceStale);
    }
}
