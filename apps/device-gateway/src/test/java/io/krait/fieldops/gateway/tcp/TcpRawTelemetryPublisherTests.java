package io.krait.fieldops.gateway.tcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.concurrent.CompletableFuture;

import io.krait.fieldops.telemetry.domain.RawTelemetry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.kafka.core.KafkaTemplate;
import tools.jackson.databind.ObjectMapper;

class TcpRawTelemetryPublisherTests {

    @Test
    void productionConstructorIsExplicitlySelectedForSpringInjection() throws Exception {
        assertThat(TcpRawTelemetryPublisher.class.getConstructor(
                ObjectMapper.class, KafkaTemplate.class, JdbcClient.class,
                String.class, String.class, String.class, String.class)
                .getAnnotation(Autowired.class)).isNotNull();
    }
    private static final byte[] TELEMETRY = HexFormat.of().parseHex(
            "464f010100040000002a000001977420dc00000001977420dc7b00bb00f6fdb2b39d");

    @Test void convergesGoldenFrameOnExistingRawTelemetryContract() throws Exception {
        JdbcClient jdbc = registeredJdbc(1);
        KafkaTemplate<String, String> kafka = kafka();
        when(kafka.send(anyString(), anyString(), anyString()))
                .thenReturn(CompletableFuture.completedFuture(null));
        TcpRawTelemetryPublisher publisher = publisher(jdbc, kafka);
        BinaryFrame frame = new BinaryFrameDecoder(64).feed(TELEMETRY).getFirst();

        RawTelemetry raw = publisher.publish(frame);

        assertThat(raw.eventId()).isEqualTo("b07:device-a-soil-tcp-01:1750000000000:42");
        assertThat(raw.sessionId()).isEqualTo("tcp:device-a-soil-tcp-01:1750000000000");
        assertThat(raw.sequence()).isEqualTo(42);
        assertThat(raw.metrics()).extracting(metric -> metric.code())
                .containsExactly("soil.moisture.pct", "soil.temperature.c");
        assertThat(raw.metrics()).extracting(metric -> metric.value()).containsExactly(18.7, 24.6);
        assertThat(raw.payloadDigest()).startsWith("sha256:").hasSize(71);
    }

    @Test void rejectsConfiguredDeviceWhenTcpProtocolRegistrationDoesNotMatch() {
        TcpRawTelemetryPublisher publisher = publisher(registeredJdbc(0), kafka());
        BinaryFrame frame = new BinaryFrameDecoder(64).feed(TELEMETRY).getFirst();
        assertThatThrownBy(() -> publisher.publish(frame)).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("not registered");
    }

    @SuppressWarnings("unchecked")
    private static KafkaTemplate<String, String> kafka() { return mock(KafkaTemplate.class); }

    private static JdbcClient registeredJdbc(int count) {
        JdbcClient jdbc = mock(JdbcClient.class, RETURNS_DEEP_STUBS);
        when(jdbc.sql(anyString()).param(anyString(), anyString()).param(anyString(), anyString())
                .param(anyString(), anyString()).query(Integer.class).single()).thenReturn(count);
        return jdbc;
    }

    private static TcpRawTelemetryPublisher publisher(JdbcClient jdbc, KafkaTemplate<String, String> kafka) {
        return new TcpRawTelemetryPublisher(new ObjectMapper(), kafka, jdbc, "tenant-a", "site-a",
                "device-a-soil-tcp-01", "raw", Clock.fixed(Instant.parse("2025-06-15T16:00:10Z"), ZoneOffset.UTC));
    }
}
