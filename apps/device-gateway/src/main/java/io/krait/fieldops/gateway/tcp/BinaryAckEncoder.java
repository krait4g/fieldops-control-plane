package io.krait.fieldops.gateway.tcp;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.zip.CRC32;

final class BinaryAckEncoder {
    private BinaryAckEncoder() {}

    static byte[] encode(BinaryFrame source, long observedAtMillis) {
        ByteBuffer frame = ByteBuffer.allocate(BinaryFrameDecoder.FIXED_OVERHEAD).order(ByteOrder.BIG_ENDIAN);
        frame.put((byte) 0x46).put((byte) 0x4f).put((byte) 1).put((byte) BinaryFrame.ACK);
        frame.putShort((short) 0).putInt((int) source.sequence());
        frame.putLong(source.sessionStartedAtMillis()).putLong(observedAtMillis);
        CRC32 crc = new CRC32();
        crc.update(frame.array(), 2, BinaryFrameDecoder.HEADER_BYTES - 2);
        frame.putInt((int) crc.getValue());
        return frame.array();
    }
}
