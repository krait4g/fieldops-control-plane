package io.krait.fieldops.telemetry.domain;

import java.time.Instant;
import java.util.Comparator;

public record SourceOrder(Instant sessionStartedAt, long sequence) implements Comparable<SourceOrder> {
    public static final long MAX_SAFE_INTEGER = 9_007_199_254_740_991L;
    private static final Comparator<SourceOrder> ORDER = Comparator
            .comparing(SourceOrder::sessionStartedAt)
            .thenComparingLong(SourceOrder::sequence);

    public SourceOrder {
        if (sessionStartedAt == null) throw new NullPointerException("sessionStartedAt");
        long epochMillis = sessionStartedAt.toEpochMilli();
        if (epochMillis < -MAX_SAFE_INTEGER || epochMillis > MAX_SAFE_INTEGER
                || sequence < 0 || sequence > MAX_SAFE_INTEGER) {
            throw new IllegalArgumentException("source order is outside the exact numeric comparison range");
        }
    }

    public long sessionStartedAtMillis() {
        return sessionStartedAt.toEpochMilli();
    }

    @Override
    public int compareTo(SourceOrder other) {
        return ORDER.compare(this, other);
    }
}
