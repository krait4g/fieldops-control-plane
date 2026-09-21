package io.krait.fieldops.gateway.tcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.io.ByteArrayOutputStream;
import java.time.Duration;
import java.util.HexFormat;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

class TcpBinaryTelemetryAdapterTests {
    private static final byte[] TELEMETRY = HexFormat.of().parseHex(
            "464f010100040000002a000001977420dc00000001977420dc7b00bb00f6fdb2b39d");

    @Test void writesAckOnlyAfterKafkaPublisherReturnsSuccessfully() throws Exception {
        TcpRawTelemetryPublisher publisher = mock(TcpRawTelemetryPublisher.class);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        BinaryFrame frame = new BinaryFrameDecoder(64).feed(TELEMETRY).getFirst();
        adapter(publisher).processFrame(frame, output);
        verify(publisher).publish(frame);
        assertThat(output.toByteArray()).hasSize(30);
        assertThat(output.toByteArray()[3] & 0xff).isEqualTo(BinaryFrame.ACK);
    }

    @Test void doesNotAckWhenKafkaPublishFails() throws Exception {
        TcpRawTelemetryPublisher publisher = mock(TcpRawTelemetryPublisher.class);
        BinaryFrame frame = new BinaryFrameDecoder(64).feed(TELEMETRY).getFirst();
        doThrow(new IllegalStateException("synthetic Kafka failure")).when(publisher).publish(frame);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        assertThatThrownBy(() -> adapter(publisher).processFrame(frame, output))
                .isInstanceOf(IllegalStateException.class);
        assertThat(output.size()).isZero();
    }

    @Test void heartbeatValidatesRegistrationWithoutPublishingOrAcking() throws Exception {
        TcpRawTelemetryPublisher publisher = mock(TcpRawTelemetryPublisher.class);
        BinaryFrame heartbeat = new BinaryFrameDecoder(64).feed(HexFormat.of().parseHex(
                "464f010200000000002b000001977420dc00000001977420dfe898ac8e62")).getFirst();
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        adapter(publisher).processFrame(heartbeat, output);
        verify(publisher).validateRegistration();
        verify(publisher, never()).publish(heartbeat);
        assertThat(output.size()).isZero();
    }

    @Test void metricsUseOnlyBoundedTags() {
        SimpleMeterRegistry meters = new SimpleMeterRegistry();
        new TcpBinaryTelemetryAdapter(mock(TcpRawTelemetryPublisher.class), meters,
                "127.0.0.1", 28087, 64, Duration.ofSeconds(3));
        assertThat(meters.getMeters()).allSatisfy(meter ->
                assertThat(meter.getId().getTags()).allSatisfy(tag ->
                        assertThat(tag.getKey()).isIn("type", "result", "reason")));
    }

    @Test void refusesNonLoopbackEndpoint() {
        assertThatThrownBy(() -> new TcpBinaryTelemetryAdapter(mock(TcpRawTelemetryPublisher.class),
                new SimpleMeterRegistry(), "192.0.2.10", 28087, 64, Duration.ofSeconds(3)))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("localhost-only");
    }

    private static TcpBinaryTelemetryAdapter adapter(TcpRawTelemetryPublisher publisher) {
        return new TcpBinaryTelemetryAdapter(publisher, new SimpleMeterRegistry(),
                "127.0.0.1", 28087, 64, Duration.ofSeconds(3));
    }
}
