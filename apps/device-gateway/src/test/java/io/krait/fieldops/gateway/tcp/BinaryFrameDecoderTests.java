package io.krait.fieldops.gateway.tcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;

class BinaryFrameDecoderTests {
    private static final String TELEMETRY = fixture("telemetry-frame-v1.json");
    private static final String HEARTBEAT = fixture("heartbeat-frame-v1.json");
    private static final String ACK = fixture("ack-frame-v1.json");

    @Test void decodesGoldenTelemetryAcrossArbitraryHeaderAndPayloadChunks() {
        byte[] bytes = HexFormat.of().parseHex(TELEMETRY);
        BinaryFrameDecoder decoder = new BinaryFrameDecoder(64);
        assertThat(decoder.feed(Arrays.copyOfRange(bytes, 0, 1))).isEmpty();
        assertThat(decoder.feed(Arrays.copyOfRange(bytes, 1, 9))).isEmpty();
        assertThat(decoder.feed(Arrays.copyOfRange(bytes, 9, 28))).isEmpty();
        List<BinaryFrame> frames = decoder.feed(Arrays.copyOfRange(bytes, 28, bytes.length));
        assertThat(frames).hasSize(1);
        BinaryFrame frame = frames.getFirst();
        assertThat(frame.type()).isEqualTo(BinaryFrame.TELEMETRY);
        assertThat(frame.sequence()).isEqualTo(42);
        assertThat(frame.sessionStartedAtMillis()).isEqualTo(1_750_000_000_000L);
        ByteBuffer payload = ByteBuffer.wrap(frame.payload()).order(ByteOrder.BIG_ENDIAN);
        assertThat(Short.toUnsignedInt(payload.getShort()) / 10.0).isEqualTo(18.7);
        assertThat(payload.getShort() / 10.0).isEqualTo(24.6);
    }

    @Test void decodesCoalescedFramesAndRetainsTrailingPartial() {
        byte[] one = HexFormat.of().parseHex(TELEMETRY);
        byte[] two = HexFormat.of().parseHex(HEARTBEAT);
        byte[] joined = Arrays.copyOf(one, one.length + two.length - 5);
        System.arraycopy(two, 0, joined, one.length, two.length - 5);
        BinaryFrameDecoder decoder = new BinaryFrameDecoder(64);
        assertThat(decoder.feed(joined)).extracting(BinaryFrame::type).containsExactly(BinaryFrame.TELEMETRY);
        assertThat(decoder.bufferedBytes()).isEqualTo(two.length - 5);
        assertThat(decoder.feed(Arrays.copyOfRange(two, two.length - 5, two.length)))
                .extracting(BinaryFrame::type).containsExactly(BinaryFrame.HEARTBEAT);
    }

    @Test void rejectsBadMagicCrcLengthVersionTypeAndDirectionAndResets() {
        assertReason(mutate(TELEMETRY, 0, 0), "magic");
        assertReason(mutate(TELEMETRY, TELEMETRY.length() / 2 - 1, 0), "crc");
        assertReason(mutate(TELEMETRY, 4, 0x7f), "length");
        assertReason(mutate(TELEMETRY, 2, 2), "version");
        assertReason(mutate(TELEMETRY, 3, 0x7f), "type");
        assertReason(ACK, "direction");
    }

    @Test void rejectsUnboundedBufferedInput() {
        BinaryFrameDecoder decoder = new BinaryFrameDecoder(64);
        assertThatThrownBy(() -> decoder.feed(new byte[400]))
                .isInstanceOf(BinaryProtocolException.class)
                .extracting(error -> ((BinaryProtocolException) error).reason()).isEqualTo("buffer_overflow");
        assertThat(decoder.bufferedBytes()).isZero();
    }

    private static void assertReason(String hex, String reason) {
        BinaryFrameDecoder decoder = new BinaryFrameDecoder(64);
        assertThatThrownBy(() -> decoder.feed(HexFormat.of().parseHex(hex)))
                .isInstanceOf(BinaryProtocolException.class)
                .extracting(error -> ((BinaryProtocolException) error).reason()).isEqualTo(reason);
        assertThat(decoder.bufferedBytes()).isZero();
    }

    private static String mutate(String hex, int byteOffset, int value) {
        byte[] bytes = HexFormat.of().parseHex(hex); bytes[byteOffset] = (byte) value;
        return HexFormat.of().formatHex(bytes);
    }

    private static String fixture(String name) {
        try {
            String json = Files.readString(Path.of("..", "..", "fixtures", "b07", name));
            Matcher matcher = Pattern.compile("\\\"hex\\\"\\s*:\\s*\\\"([0-9a-f]+)\\\"").matcher(json);
            if (!matcher.find()) throw new IllegalStateException("fixture has no hex");
            return matcher.group(1);
        } catch (Exception error) { throw new ExceptionInInitializerError(error); }
    }
}
