package io.krait.fieldops.simulator.tcp;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.zip.CRC32;

final class AckFrameDecoder {
    Ack decode(byte[] frame) {
        if (frame.length != 30) throw new IllegalArgumentException("ACK must be 30 bytes");
        ByteBuffer data = ByteBuffer.wrap(frame).order(ByteOrder.BIG_ENDIAN);
        if ((data.get() & 0xff) != 0x46 || (data.get() & 0xff) != 0x4f) {
            throw new IllegalArgumentException("invalid ACK magic");
        }
        int version = data.get() & 0xff;
        int type = data.get() & 0xff;
        int length = Short.toUnsignedInt(data.getShort());
        long sequence = Integer.toUnsignedLong(data.getInt());
        long session = data.getLong();
        long observed = data.getLong();
        long expected = Integer.toUnsignedLong(data.getInt());
        CRC32 crc = new CRC32();
        crc.update(frame, 2, 24);
        if (version != 1 || type != BinaryFrameEncoder.ACK || length != 0 || crc.getValue() != expected) {
            throw new IllegalArgumentException("invalid ACK fields or CRC");
        }
        return new Ack(session, sequence, observed);
    }

    record Ack(long sessionStartedAtMillis, long sequence, long observedAtMillis) {}
}
