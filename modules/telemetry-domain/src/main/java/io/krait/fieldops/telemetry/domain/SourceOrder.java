package io.krait.fieldops.telemetry.domain;

import java.time.Instant;

public record SourceOrder(Instant sessionStartedAt, long sequence) implements Comparable<SourceOrder> {
    public static final long MAX_SAFE_INTEGER = 9_007_199_254_740_991L;
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
        int sessionOrder = Long.compare(sessionStartedAtMillis(), other.sessionStartedAtMillis());
        return sessionOrder != 0 ? sessionOrder : Long.compare(sequence, other.sequence);
    }
}
