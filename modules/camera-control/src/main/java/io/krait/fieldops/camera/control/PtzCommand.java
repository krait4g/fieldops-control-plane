package io.krait.fieldops.camera.control;

public record PtzCommand(
        Type type,
        String ownerId,
        String sessionId,
        long generation,
        long sequence,
        double pan,
        double tilt,
        double zoom,
        int timeoutMs,
        String reason) {
    public PtzCommand {
        if (type == null) throw new IllegalArgumentException("type is required");
        if (ownerId == null || ownerId.isBlank()) throw new IllegalArgumentException("ownerId is required");
        if (sessionId == null || sessionId.isBlank()) throw new IllegalArgumentException("sessionId is required");
        if (generation < 1 || sequence < 1) throw new IllegalArgumentException("generation and sequence must be positive");
        if (type == Type.MOVE) {
            requireUnit(pan, "pan");
            requireUnit(tilt, "tilt");
            requireUnit(zoom, "zoom");
            if (timeoutMs < 1 || timeoutMs > 500) {
                throw new IllegalArgumentException("MOVE timeout must be between 1 and 500ms");
            }
        }
    }

    public static PtzCommand move(String ownerId, String sessionId, long generation, long sequence,
            double pan, double tilt, double zoom, int timeoutMs) {
        return new PtzCommand(Type.MOVE, ownerId, sessionId, generation, sequence,
                pan, tilt, zoom, timeoutMs, null);
    }

    public static PtzCommand stop(String ownerId, String sessionId, long generation, long sequence,
            String reason) {
        return new PtzCommand(Type.STOP, ownerId, sessionId, generation, sequence,
                0, 0, 0, 0, reason);
    }

    public String fenceValue() {
        return ownerId + "|" + sessionId + "|" + generation;
    }

    private static void requireUnit(double value, String name) {
        if (!Double.isFinite(value) || value < -1 || value > 1) {
            throw new IllegalArgumentException(name + " must be between -1 and 1");
        }
    }

    public enum Type { MOVE, STOP }
}
