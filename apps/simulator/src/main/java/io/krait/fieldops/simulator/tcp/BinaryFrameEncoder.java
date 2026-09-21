package io.krait.fieldops.simulator.tcp;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.zip.CRC32;

public final class BinaryFrameEncoder {
    public static final int TELEMETRY = 0x01;
    public static final int HEARTBEAT = 0x02;
    public static final int ACK = 0x81;
    private static final int HEADER_BYTES = 26;

    public byte[] telemetry(long sequence, long sessionStartedAtMillis, long observedAtMillis,
            double moisture, double temperature) {
        if (moisture < 0 || moisture > 100 || temperature < -20 || temperature > 80) {
            throw new IllegalArgumentException("sample outside B07 bounds");
        }
        ByteBuffer payload = ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN);
        payload.putShort((short) Math.round(moisture * 10));
        payload.putShort((short) Math.round(temperature * 10));
        return encode(TELEMETRY, payload.array(), sequence, sessionStartedAtMillis, observedAtMillis);
    }

    public byte[] heartbeat(long sequence, long sessionStartedAtMillis, long observedAtMillis) {
        return encode(HEARTBEAT, new byte[0], sequence, sessionStartedAtMillis, observedAtMillis);
    }

    private byte[] encode(int type, byte[] payload, long sequence, long sessionStartedAt, long observedAt) {
        ByteBuffer frame = ByteBuffer.allocate(30 + payload.length).order(ByteOrder.BIG_ENDIAN);
        frame.put((byte) 0x46).put((byte) 0x4f).put((byte) 1).put((byte) type);
        frame.putShort((short) payload.length).putInt((int) sequence);
        frame.putLong(sessionStartedAt).putLong(observedAt).put(payload);
        CRC32 crc = new CRC32();
        crc.update(frame.array(), 2, HEADER_BYTES - 2 + payload.length);
        frame.putInt((int) crc.getValue());
        return frame.array();
    }
}
