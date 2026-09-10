package io.krait.fieldops.gateway.ingest;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

import io.krait.fieldops.telemetry.domain.DeviceSample;
import io.krait.fieldops.telemetry.domain.RawTelemetry;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.eclipse.paho.mqttv5.client.IMqttToken;
import org.eclipse.paho.mqttv5.client.MqttCallback;
import org.eclipse.paho.mqttv5.client.MqttClient;
import org.eclipse.paho.mqttv5.client.MqttConnectionOptions;
import org.eclipse.paho.mqttv5.client.MqttDisconnectResponse;
import org.eclipse.paho.mqttv5.common.MqttException;
import org.eclipse.paho.mqttv5.common.MqttMessage;
import org.eclipse.paho.mqttv5.common.packet.MqttProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.context.SmartLifecycle;
import tools.jackson.databind.ObjectMapper;

@Component
@Profile("local-observe")
public class MqttTelemetryGateway implements SmartLifecycle {
    private static final Logger LOGGER = LoggerFactory.getLogger(MqttTelemetryGateway.class);
    private static final String TOPIC_PREFIX = "fieldops/local/";
    private static final String TELEMETRY_TOPIC = "fieldops/local/+/+/+/telemetry";
    private static final Set<String> REQUIRED_METRICS = Set.of("soil.moisture.pct", "soil.temperature.c");
    private static final int KAFKA_ATTEMPTS = 3;
    private static final long KAFKA_RETRY_MILLIS = 100;

    private final ObjectMapper mapper;
    private final KafkaTemplate<String, String> kafka;
    private final JdbcClient jdbc;
    private final String uri;
    private final String username;
    private final String password;
    private final String clientId;
    private final String rawTopic;
    private final int maxPayloadBytes;
    private final ThreadPoolExecutor workers;
    private final Counter accepted;
    private final Counter rejected;
    private final Counter brokerErrors;
    private final Timer ingestDuration;
    private final Timer deviceValidationDuration;
    private final Timer kafkaPublishDuration;
    private final AtomicBoolean running = new AtomicBoolean();
    private final AtomicLong connectionGeneration = new AtomicLong();
    private final Clock clock = Clock.systemUTC();
    private volatile MqttClient client;

    public MqttTelemetryGateway(ObjectMapper mapper, KafkaTemplate<String, String> kafka, JdbcClient jdbc,
            MeterRegistry meters,
            @Value("${fieldops.b02.mqtt.uri}") String uri,
            @Value("${fieldops.b02.mqtt.username}") String username,
            @Value("${fieldops.b02.mqtt.password}") String password,
            @Value("${fieldops.b02.mqtt.client-id}") String clientId,
            @Value("${fieldops.b02.mqtt.max-payload-bytes}") int maxPayloadBytes,
            @Value("${fieldops.b02.mqtt.worker-threads:2}") int workerThreads,
            @Value("${fieldops.b02.mqtt.max-inflight}") int maxInflight,
            @Value("${fieldops.b02.kafka.raw-topic}") String rawTopic) {
        this.mapper = mapper;
        this.kafka = kafka;
        this.jdbc = jdbc;
        this.uri = uri;
        this.username = username;
        this.password = password;
        this.clientId = clientId;
        this.rawTopic = rawTopic;
        this.maxPayloadBytes = maxPayloadBytes;
        if (workerThreads < 1 || workerThreads > 4) {
            throw new IllegalArgumentException("MQTT worker threads must be between 1 and 4");
        }
        this.workers = new ThreadPoolExecutor(workerThreads, 4, 30, TimeUnit.SECONDS,
                new ArrayBlockingQueue<>(maxInflight), new ThreadPoolExecutor.CallerRunsPolicy());
        this.accepted = meters.counter("fieldops.gateway.telemetry", "result", "accepted");
        this.rejected = meters.counter("fieldops.gateway.telemetry", "result", "rejected");
        this.brokerErrors = meters.counter("fieldops.gateway.telemetry", "result", "kafka_error");
        this.ingestDuration = meters.timer("fieldops.gateway.ingest.duration");
        this.deviceValidationDuration = meters.timer("fieldops.gateway.device.validation.duration");
        this.kafkaPublishDuration = meters.timer("fieldops.gateway.kafka.publish.duration");
        Gauge.builder("fieldops.gateway.ingest.queue.depth", workers,
                executor -> executor.getQueue().size()).register(meters);
        Gauge.builder("fieldops.gateway.ingest.active", workers,
                ThreadPoolExecutor::getActiveCount).register(meters);
    }

    @Override
    public void start() {
        if (!running.compareAndSet(false, true)) return;
        try {
            MqttClient mqtt = new MqttClient(uri, clientId, null);
            mqtt.setManualAcks(true);
            mqtt.setCallback(callback());
            client = mqtt;
            MqttConnectionOptions options = new MqttConnectionOptions();
            options.setUserName(username);
            options.setPassword(password.getBytes(StandardCharsets.UTF_8));
            options.setCleanStart(false);
            options.setSessionExpiryInterval(300L);
            options.setAutomaticReconnect(true);
            options.setAutomaticReconnectDelay(1, 10);
            options.setConnectionTimeout(5);
            options.setReceiveMaximum(256);
            mqtt.connect(options);
            mqtt.subscribe(TELEMETRY_TOPIC, 1).waitForCompletion(10_000);
            LOGGER.info("B02 MQTT gateway subscribed to localhost broker");
        } catch (MqttException error) {
            running.set(false);
            client = null;
            throw new IllegalStateException("Unable to start B02 MQTT gateway", error);
        }
    }

    private MqttCallback callback() {
        return new MqttCallback() {
            @Override public void disconnected(MqttDisconnectResponse response) {
                LOGGER.warn("B02 MQTT gateway disconnected: {}", response.getReasonString());
            }
            @Override public void mqttErrorOccurred(MqttException exception) {
                LOGGER.error("B02 MQTT error", exception);
            }
            @Override public void messageArrived(String topic, MqttMessage message) {
                long generation = connectionGeneration.get();
                workers.execute(() -> ingest(topic, message, generation));
            }
            @Override public void deliveryComplete(IMqttToken token) {}
            @Override public void connectComplete(boolean reconnect, String serverUri) {
                handleConnectComplete(reconnect);
            }
            @Override public void authPacketArrived(int reasonCode, MqttProperties properties) {}
        };
    }

    private void ingest(String topic, MqttMessage message, long generation) {
        Timer.Sample ingestSample = Timer.start();
        try {
            if (message.getPayload().length > maxPayloadBytes) {
                rejectAndAcknowledge(message, "payload-too-large");
                return;
            }
            TopicScope scope = TopicScope.parse(topic);
            DeviceSample sample = mapper.readValue(message.getPayload(), DeviceSample.class);
            Timer.Sample validationSample = Timer.start();
            try {
                validate(scope, sample);
            } finally {
                validationSample.stop(deviceValidationDuration);
            }
            Instant receivedAt = clock.instant();
            String digest = "sha256:" + sha256(message.getPayload());
            RawTelemetry raw = new RawTelemetry(sample.eventId(), sample.schemaVersion(), sample.tenantId(),
                    sample.siteId(), sample.deviceId(), sample.sessionId(), sample.sessionStartedAt(),
                    sample.sequence(), sample.observedAt(), receivedAt, sample.metrics(), digest,
                    "mqtt-" + UUID.randomUUID(), sample.eventId());
            String json = mapper.writeValueAsString(raw);
            sendRawThenAcknowledge(raw.tenantId() + ":" + raw.deviceId(), json, message, generation);
            accepted.increment();
        } catch (IllegalArgumentException | tools.jackson.core.JacksonException error) {
            rejectAndAcknowledge(message, error.getMessage());
        } catch (Exception error) {
            brokerErrors.increment();
            LOGGER.error("B02 raw Kafka publish exhausted bounded retries; MQTT message remains unacknowledged", error);
        } finally {
            ingestSample.stop(ingestDuration);
        }
    }

    private void validate(TopicScope scope, DeviceSample sample) {
        if (!"2.0.0".equals(sample.schemaVersion()) || sample.sequence() < 0) {
            throw new IllegalArgumentException("invalid schema version or sequence");
        }
        if (!scope.matches(sample)) {
            throw new IllegalArgumentException("MQTT topic and payload scope differ");
        }
        if (sample.observedAt().isAfter(clock.instant().plus(Duration.ofSeconds(30)))) {
            throw new IllegalArgumentException("future observedAt rejected");
        }
        Set<String> codes = sample.metrics().stream().map(metric -> metric.code()).collect(java.util.stream.Collectors.toSet());
        if (sample.metrics().size() != 2 || !codes.equals(REQUIRED_METRICS)) {
            throw new IllegalArgumentException("incomplete B02 sample");
        }
        int deviceCount = jdbc.sql("""
                SELECT COUNT(*) FROM b02_device
                WHERE tenant_id = :tenantId AND site_id = :siteId AND device_id = :deviceId
                """)
                .param("tenantId", sample.tenantId())
                .param("siteId", sample.siteId())
                .param("deviceId", sample.deviceId())
                .query(Integer.class)
                .single();
        if (deviceCount != 1) throw new IllegalArgumentException("device is not registered in topic scope");
    }

    private void rejectAndAcknowledge(MqttMessage message, String reason) {
        rejected.increment();
        LOGGER.warn("Rejected B02 MQTT sample: {}", reason);
        try {
            acknowledge(message, connectionGeneration.get());
        } catch (MqttException error) {
            LOGGER.warn("Failed to acknowledge rejected MQTT sample", error);
        }
    }

    private void acknowledge(MqttMessage message, long expectedGeneration) throws MqttException {
        MqttClient mqtt = client;
        if (mqtt == null || connectionGeneration.get() != expectedGeneration) {
            throw new IllegalStateException("MQTT connection generation changed before acknowledgment");
        }
        mqtt.messageArrivedComplete(message.getId(), message.getQos());
    }

    void sendRawThenAcknowledge(String key, String json, MqttMessage message) throws Exception {
        sendRawThenAcknowledge(key, json, message, connectionGeneration.get());
    }

    void sendRawThenAcknowledge(String key, String json, MqttMessage message, long generation) throws Exception {
        Exception lastFailure = null;
        for (int attempt = 1; attempt <= KAFKA_ATTEMPTS; attempt++) {
            Timer.Sample publishSample = Timer.start();
            try {
                kafka.send(rawTopic, key, json).get(10, TimeUnit.SECONDS);
                lastFailure = null;
                break;
            } catch (Exception error) {
                lastFailure = error;
                if (attempt < KAFKA_ATTEMPTS) {
                    Thread.sleep(KAFKA_RETRY_MILLIS * attempt);
                }
            } finally {
                publishSample.stop(kafkaPublishDuration);
            }
        }
        if (lastFailure != null) throw lastFailure;
        acknowledge(message, generation);
    }

    void handleConnectComplete(boolean reconnect) {
        connectionGeneration.incrementAndGet();
        if (!reconnect || !running.get()) return;
        MqttClient mqtt = client;
        if (mqtt == null) return;
        try {
            mqtt.subscribe(TELEMETRY_TOPIC, 1).waitForCompletion(10_000);
            LOGGER.info("B02 MQTT gateway restored telemetry subscription after reconnect");
        } catch (MqttException error) {
            LOGGER.error("B02 MQTT gateway failed to restore telemetry subscription", error);
        }
    }

    private static String sha256(byte[] payload) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(payload));
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 unavailable", error);
        }
    }

    @Override
    public void stop() {
        running.set(false);
        workers.shutdownNow();
        MqttClient mqtt = client;
        if (mqtt == null) return;
        try {
            if (mqtt.isConnected()) mqtt.disconnect();
            mqtt.close();
        } catch (MqttException error) {
            LOGGER.warn("Failed to close B02 MQTT gateway cleanly", error);
        }
    }

    @Override public boolean isRunning() { return running.get(); }
    @Override public int getPhase() { return 0; }

    private record TopicScope(String tenantId, String siteId, String deviceId) {
        static TopicScope parse(String topic) {
            String[] parts = topic.split("/", -1);
            if (parts.length != 6 || !TOPIC_PREFIX.equals(String.join("/", parts[0], parts[1]) + "/")
                    || !"telemetry".equals(parts[5])) {
                throw new IllegalArgumentException("unexpected MQTT topic");
            }
            return new TopicScope(parts[2], parts[3], parts[4]);
        }

        boolean matches(DeviceSample sample) {
            return tenantId.equals(sample.tenantId()) && siteId.equals(sample.siteId())
                    && deviceId.equals(sample.deviceId());
        }
    }
}
