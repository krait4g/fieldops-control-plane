package io.krait.fieldops.gateway.tcp;

import java.util.Arrays;

public record BinaryFrame(int version, int type, int payloadLength, long sequence,
        long sessionStartedAtMillis, long observedAtMillis, byte[] payload, byte[] encoded) {
    public static final int TELEMETRY = 0x01;
    public static final int HEARTBEAT = 0x02;
    public static final int ACK = 0x81;

    public BinaryFrame {
        payload = Arrays.copyOf(payload, payload.length);
        encoded = Arrays.copyOf(encoded, encoded.length);
    }

    @Override public byte[] payload() { return Arrays.copyOf(payload, payload.length); }
    @Override public byte[] encoded() { return Arrays.copyOf(encoded, encoded.length); }
}
