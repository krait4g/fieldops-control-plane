package io.krait.fieldops.telemetry.domain;

import java.time.Duration;
import java.time.Instant;
import java.util.Objects;

public final class StateCondition {
    private StateCondition() {}

    public static Derived derive(Instant receivedAt, Instant now, Duration freshAfter,
            Duration offlineAfter, boolean forceStale) {
        Objects.requireNonNull(receivedAt, "receivedAt");
        Objects.requireNonNull(now, "now");
        if (freshAfter.isNegative() || freshAfter.isZero()
                || offlineAfter.compareTo(freshAfter) < 0) {
            throw new IllegalArgumentException("invalid state freshness thresholds");
        }
        Instant staleAt = receivedAt.plus(freshAfter);
        Instant offlineAt = receivedAt.plus(offlineAfter);
        boolean offline = !now.isBefore(offlineAt);
        boolean stale = forceStale || !now.isBefore(staleAt);
        return new Derived(offline ? "OFFLINE" : "ONLINE", offline ? "UNKNOWN" : "READY",
                stale ? "STALE" : "FRESH", staleAt);
    }

    public record Derived(String connectivity, String readiness, String freshness, Instant staleAt) {}
}
