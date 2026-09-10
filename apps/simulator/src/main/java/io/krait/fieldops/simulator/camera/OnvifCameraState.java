package io.krait.fieldops.simulator.camera;

import java.time.Instant;
import java.util.function.LongSupplier;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("b04-camera")
public class OnvifCameraState {
    private static final double POSITION_RATE_PER_SECOND = 0.7;
    private static final long MAX_TIMEOUT_NANOS = 500_000_000L;

    private final LongSupplier nanoTime;
    private double pan;
    private double tilt;
    private double zoom;
    private double panVelocity;
    private double tiltVelocity;
    private double zoomVelocity;
    private long lastUpdateNanos;
    private long deadlineNanos;

    public OnvifCameraState() {
        this(System::nanoTime);
    }

    OnvifCameraState(LongSupplier nanoTime) {
        this.nanoTime = nanoTime;
        this.lastUpdateNanos = nanoTime.getAsLong();
    }

    public synchronized Pose continuousMove(double panVelocity, double tiltVelocity,
            double zoomVelocity, long timeoutMillis) {
        integrate();
        this.panVelocity = clamp(panVelocity, -1, 1);
        this.tiltVelocity = clamp(tiltVelocity, -1, 1);
        this.zoomVelocity = clamp(zoomVelocity, -1, 1);
        long boundedTimeoutNanos = Math.min(MAX_TIMEOUT_NANOS,
                Math.max(1, timeoutMillis) * 1_000_000L);
        deadlineNanos = nanoTime.getAsLong() + boundedTimeoutNanos;
        return current();
    }

    public synchronized Pose stop() {
        integrate();
        panVelocity = 0;
        tiltVelocity = 0;
        zoomVelocity = 0;
        deadlineNanos = 0;
        return current();
    }

    public synchronized Pose status() {
        integrate();
        return current();
    }

    private void integrate() {
        long now = nanoTime.getAsLong();
        long effectiveEnd = deadlineNanos > 0 ? Math.min(now, deadlineNanos) : now;
        double elapsedSeconds = Math.max(0, effectiveEnd - lastUpdateNanos) / 1_000_000_000d;
        pan = clamp(pan + panVelocity * POSITION_RATE_PER_SECOND * elapsedSeconds, -1, 1);
        tilt = clamp(tilt + tiltVelocity * POSITION_RATE_PER_SECOND * elapsedSeconds, -1, 1);
        zoom = clamp(zoom + zoomVelocity * POSITION_RATE_PER_SECOND * elapsedSeconds, 0, 1);
        lastUpdateNanos = now;
        if (deadlineNanos > 0 && now >= deadlineNanos) {
            panVelocity = 0;
            tiltVelocity = 0;
            zoomVelocity = 0;
            deadlineNanos = 0;
        }
    }

    private Pose current() {
        boolean moving = panVelocity != 0 || tiltVelocity != 0 || zoomVelocity != 0;
        return new Pose(pan, tilt, zoom, moving, Instant.now());
    }

    private static double clamp(double value, double minimum, double maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }

    public record Pose(double pan, double tilt, double zoom, boolean moving, Instant observedAt) {}
}
