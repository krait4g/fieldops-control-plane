package io.krait.fieldops.gateway.tcp;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.zip.CRC32;

public final class BinaryFrameDecoder {
    static final int HEADER_BYTES = 26;
    static final int FIXED_OVERHEAD = 30;
    private final int maxPayloadBytes;
    private final int maxBufferBytes;
    private byte[] buffered = new byte[0];

    public BinaryFrameDecoder(int maxPayloadBytes) {
        if (maxPayloadBytes < 4 || maxPayloadBytes > 4096) {
            throw new IllegalArgumentException("max payload must be between 4 and 4096 bytes");
        }
        this.maxPayloadBytes = maxPayloadBytes;
        this.maxBufferBytes = (FIXED_OVERHEAD + maxPayloadBytes) * 4;
    }

    public List<BinaryFrame> feed(byte[] chunk) {
        if (chunk == null || chunk.length == 0) return List.of();
        if (buffered.length + chunk.length > maxBufferBytes) {
            reset();
            throw error("buffer_overflow", "bounded decoder buffer exceeded");
        }
        byte[] combined = Arrays.copyOf(buffered, buffered.length + chunk.length);
        System.arraycopy(chunk, 0, combined, buffered.length, chunk.length);
        buffered = combined;
        List<BinaryFrame> frames = new ArrayList<>();
        int offset = 0;
        try {
            while (buffered.length - offset >= HEADER_BYTES) {
                if ((buffered[offset] & 0xff) != 0x46 || (buffered[offset + 1] & 0xff) != 0x4f) {
                    throw error("magic", "invalid frame magic");
                }
                int version = buffered[offset + 2] & 0xff;
                int type = buffered[offset + 3] & 0xff;
                int payloadLength = Short.toUnsignedInt(ByteBuffer.wrap(buffered, offset + 4, 2)
                        .order(ByteOrder.BIG_ENDIAN).getShort());
                if (version != 1) throw error("version", "unsupported protocol version");
                if (type != BinaryFrame.TELEMETRY && type != BinaryFrame.HEARTBEAT) {
                    throw error(type == BinaryFrame.ACK ? "direction" : "type", "invalid device-to-gateway type");
                }
                if (payloadLength > maxPayloadBytes) throw error("length", "payload exceeds configured bound");
                if (type == BinaryFrame.TELEMETRY && payloadLength != 4) {
                    throw error("length", "telemetry payload must be four bytes");
                }
                if (type == BinaryFrame.HEARTBEAT && payloadLength != 0) {
                    throw error("length", "heartbeat payload must be empty");
                }
                int frameLength = FIXED_OVERHEAD + payloadLength;
                if (buffered.length - offset < frameLength) break;
                byte[] encoded = Arrays.copyOfRange(buffered, offset, offset + frameLength);
                ByteBuffer fields = ByteBuffer.wrap(encoded).order(ByteOrder.BIG_ENDIAN);
                fields.position(6);
                long sequence = Integer.toUnsignedLong(fields.getInt());
                long sessionStartedAt = fields.getLong();
                long observedAt = fields.getLong();
                if (sessionStartedAt <= 0 || observedAt <= 0 || observedAt < sessionStartedAt) {
                    throw error("timestamp", "invalid logical session or observation timestamp");
                }
                CRC32 crc = new CRC32();
                crc.update(encoded, 2, HEADER_BYTES - 2 + payloadLength);
                long expected = Integer.toUnsignedLong(ByteBuffer.wrap(encoded, frameLength - 4, 4)
                        .order(ByteOrder.BIG_ENDIAN).getInt());
                if (crc.getValue() != expected) throw error("crc", "CRC32 mismatch");
                byte[] payload = Arrays.copyOfRange(encoded, HEADER_BYTES, HEADER_BYTES + payloadLength);
                frames.add(new BinaryFrame(version, type, payloadLength, sequence,
                        sessionStartedAt, observedAt, payload, encoded));
                offset += frameLength;
            }
            buffered = Arrays.copyOfRange(buffered, offset, buffered.length);
            return List.copyOf(frames);
        } catch (BinaryProtocolException error) {
            reset();
            throw error;
        }
    }

    public int bufferedBytes() { return buffered.length; }
    public void reset() { buffered = new byte[0]; }

    private static BinaryProtocolException error(String reason, String message) {
        return new BinaryProtocolException(reason, message);
    }
}
