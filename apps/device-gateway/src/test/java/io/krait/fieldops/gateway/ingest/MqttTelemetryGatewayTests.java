package io.krait.fieldops.gateway.ingest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.atomic.AtomicBoolean;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.eclipse.paho.mqttv5.client.MqttClient;
import org.eclipse.paho.mqttv5.client.IMqttToken;
import org.eclipse.paho.mqttv5.common.MqttMessage;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.ObjectMapper;

class MqttTelemetryGatewayTests {
    @Test
    void acknowledgesOnlyAfterKafkaAcceptsTheRawRecord() throws Exception {
        KafkaTemplate<String, String> kafka = kafkaTemplate();
        MqttTelemetryGateway gateway = gateway(kafka);
        MqttClient mqtt = mock(MqttClient.class);
        ReflectionTestUtils.setField(gateway, "client", mqtt);
        MqttMessage message = message();
        when(kafka.send("raw", "tenant-a:device-a-soil-01", "{}"))
                .thenReturn(CompletableFuture.completedFuture(null));

        gateway.sendRawThenAcknowledge("tenant-a:device-a-soil-01", "{}", message);

        verify(mqtt).messageArrivedComplete(message.getId(), message.getQos());
    }

    @Test
    void leavesMqttMessageUnacknowledgedWhenKafkaFails() {
        KafkaTemplate<String, String> kafka = kafkaTemplate();
        MqttTelemetryGateway gateway = gateway(kafka);
        MqttClient mqtt = mock(MqttClient.class);
        ReflectionTestUtils.setField(gateway, "client", mqtt);
        MqttMessage message = message();
        when(kafka.send("raw", "tenant-a:device-a-soil-01", "{}"))
                .thenReturn(CompletableFuture.failedFuture(new IllegalStateException("synthetic Kafka outage")));

        assertThatThrownBy(() -> gateway.sendRawThenAcknowledge(
                "tenant-a:device-a-soil-01", "{}", message)).isInstanceOf(Exception.class);

        try {
            verify(mqtt, never()).messageArrivedComplete(message.getId(), message.getQos());
        } catch (Exception impossible) {
            throw new AssertionError(impossible);
        }
        verify(kafka, times(3)).send("raw", "tenant-a:device-a-soil-01", "{}");
    }

    @Test
    void retriesTheSameRawRecordAndAcknowledgesAfterKafkaRecovers() throws Exception {
        KafkaTemplate<String, String> kafka = kafkaTemplate();
        MqttTelemetryGateway gateway = gateway(kafka);
        MqttClient mqtt = mock(MqttClient.class);
        ReflectionTestUtils.setField(gateway, "client", mqtt);
        MqttMessage message = message();
        when(kafka.send("raw", "tenant-a:device-a-soil-01", "{}"))
                .thenReturn(CompletableFuture.failedFuture(new IllegalStateException("synthetic Kafka outage")))
                .thenReturn(CompletableFuture.completedFuture(null));

        gateway.sendRawThenAcknowledge("tenant-a:device-a-soil-01", "{}", message);

        verify(kafka, times(2)).send("raw", "tenant-a:device-a-soil-01", "{}");
        verify(mqtt).messageArrivedComplete(message.getId(), message.getQos());
    }

    @Test
    void restoresTheSubscriptionOnReconnect() throws Exception {
        MqttTelemetryGateway gateway = gateway(kafkaTemplate());
        MqttClient mqtt = mock(MqttClient.class);
        IMqttToken token = mock(IMqttToken.class);
        ReflectionTestUtils.setField(gateway, "client", mqtt);
        ((AtomicBoolean) ReflectionTestUtils.getField(gateway, "running")).set(true);
        when(mqtt.subscribe("fieldops/local/+/+/+/telemetry", 1)).thenReturn(token);

        gateway.handleConnectComplete(true);

        verify(mqtt).subscribe("fieldops/local/+/+/+/telemetry", 1);
        verify(token).waitForCompletion(10_000);
    }

    @Test
    void anOldConnectionGenerationCannotAcknowledgeTheNewSession() {
        KafkaTemplate<String, String> kafka = kafkaTemplate();
        MqttTelemetryGateway gateway = gateway(kafka);
        MqttClient mqtt = mock(MqttClient.class);
        ReflectionTestUtils.setField(gateway, "client", mqtt);
        when(kafka.send("raw", "tenant-a:device-a-soil-01", "{}"))
                .thenReturn(CompletableFuture.completedFuture(null));

        gateway.handleConnectComplete(false);

        assertThatThrownBy(() -> gateway.sendRawThenAcknowledge(
                "tenant-a:device-a-soil-01", "{}", message(), 0))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("generation changed");
        try {
            verify(mqtt, never()).messageArrivedComplete(0, 1);
        } catch (Exception impossible) {
            throw new AssertionError(impossible);
        }
        verify(kafka).send("raw", "tenant-a:device-a-soil-01", "{}");
    }

    @Test
    void usesABoundedQueueWithCallerBackpressure() {
        MqttTelemetryGateway gateway = gateway(kafkaTemplate());
        ThreadPoolExecutor workers = (ThreadPoolExecutor) ReflectionTestUtils.getField(gateway, "workers");

        assertThat(workers.getQueue().remainingCapacity()).isEqualTo(4);
        assertThat(workers.getRejectedExecutionHandler())
                .isInstanceOf(ThreadPoolExecutor.CallerRunsPolicy.class);
    }

    private static MqttTelemetryGateway gateway(KafkaTemplate<String, String> kafka) {
        return new MqttTelemetryGateway(new ObjectMapper(), kafka, null, new SimpleMeterRegistry(),
                "tcp://127.0.0.1:21883", "gateway", "secret", "test-gateway", 65_536, 4, "raw");
    }

    private static MqttMessage message() {
        MqttMessage message = new MqttMessage(new byte[] { 1 });
        message.setQos(1);
        return message;
    }

    @SuppressWarnings("unchecked")
    private static KafkaTemplate<String, String> kafkaTemplate() {
        return mock(KafkaTemplate.class);
    }
}
