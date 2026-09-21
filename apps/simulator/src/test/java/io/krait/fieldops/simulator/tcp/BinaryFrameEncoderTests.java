package io.krait.fieldops.simulator.tcp;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HexFormat;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;

class BinaryFrameEncoderTests {
    private final BinaryFrameEncoder encoder = new BinaryFrameEncoder();

    @Test void encoderMatchesIndependentGoldenTelemetryFixture() {
        assertThat(HexFormat.of().formatHex(encoder.telemetry(42, 1_750_000_000_000L,
                1_750_000_000_123L, 18.7, 24.6))).isEqualTo(fixture("telemetry-frame-v1.json"));
    }

    @Test void encoderMatchesIndependentGoldenHeartbeatFixture() {
        assertThat(HexFormat.of().formatHex(encoder.heartbeat(43, 1_750_000_000_000L,
                1_750_000_001_000L))).isEqualTo(fixture("heartbeat-frame-v1.json"));
    }

    @Test void independentAckDecoderMatchesGoldenFixture() {
        AckFrameDecoder.Ack ack = new AckFrameDecoder().decode(
                HexFormat.of().parseHex(fixture("ack-frame-v1.json")));
        assertThat(ack.sessionStartedAtMillis()).isEqualTo(1_750_000_000_000L);
        assertThat(ack.sequence()).isEqualTo(42);
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
