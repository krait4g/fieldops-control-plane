package io.krait.fieldops.gateway.tcp;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import io.krait.fieldops.telemetry.domain.RawMetric;
import io.krait.fieldops.telemetry.domain.RawTelemetry;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
@Profile("b07-tcp-binary")
public class TcpRawTelemetryPublisher {
    private static final int KAFKA_ATTEMPTS = 3;
    private final ObjectMapper mapper;
    private final KafkaTemplate<String, String> kafka;
    private final JdbcClient jdbc;
    private final String tenantId;
    private final String siteId;
    private final String deviceId;
    private final String rawTopic;
    private final Clock clock;

    @Autowired
    public TcpRawTelemetryPublisher(ObjectMapper mapper, KafkaTemplate<String, String> kafka, JdbcClient jdbc,
            @Value("${fieldops.b07.tenant-id:tenant-a}") String tenantId,
            @Value("${fieldops.b07.site-id:site-a}") String siteId,
            @Value("${fieldops.b07.device-id:device-a-soil-tcp-01}") String deviceId,
            @Value("${fieldops.b02.kafka.raw-topic}") String rawTopic) {
        this(mapper, kafka, jdbc, tenantId, siteId, deviceId, rawTopic, Clock.systemUTC());
    }

    TcpRawTelemetryPublisher(ObjectMapper mapper, KafkaTemplate<String, String> kafka, JdbcClient jdbc,
            String tenantId, String siteId, String deviceId, String rawTopic, Clock clock) {
        this.mapper = mapper; this.kafka = kafka; this.jdbc = jdbc;
        this.tenantId = tenantId; this.siteId = siteId; this.deviceId = deviceId;
        this.rawTopic = rawTopic; this.clock = clock;
    }

    void validateRegistration() {
        int count = jdbc.sql("""
                SELECT COUNT(*) FROM b02_device
                WHERE tenant_id=:tenant AND site_id=:site AND device_id=:device AND protocol='TCP_BINARY'
                """).param("tenant", tenantId).param("site", siteId).param("device", deviceId)
                .query(Integer.class).single();
        if (count != 1) throw new IllegalArgumentException("configured TCP device/protocol is not registered");
    }

    RawTelemetry publish(BinaryFrame frame) throws Exception {
        validateRegistration();
        if (frame.type() != BinaryFrame.TELEMETRY) throw new IllegalArgumentException("not telemetry");
        Instant now = clock.instant();
        Instant observedAt = Instant.ofEpochMilli(frame.observedAtMillis());
        if (observedAt.isAfter(now.plus(Duration.ofSeconds(30)))) {
            throw new IllegalArgumentException("future observedAt rejected");
        }
        ByteBuffer payload = ByteBuffer.wrap(frame.payload()).order(ByteOrder.BIG_ENDIAN);
        double moisture = Short.toUnsignedInt(payload.getShort()) / 10.0;
        double temperature = payload.getShort() / 10.0;
        if (moisture < 0 || moisture > 100 || temperature < -20 || temperature > 80) {
            throw new IllegalArgumentException("telemetry value outside B07 bounds");
        }
        String sessionId = "tcp:" + deviceId + ":" + frame.sessionStartedAtMillis();
        String eventId = "b07:" + deviceId + ":" + frame.sessionStartedAtMillis() + ":" + frame.sequence();
        RawTelemetry raw = new RawTelemetry(eventId, "2.0.0", tenantId, siteId, deviceId, sessionId,
                Instant.ofEpochMilli(frame.sessionStartedAtMillis()), frame.sequence(), observedAt, now,
                List.of(new RawMetric("soil.moisture.pct", moisture, "%"),
                        new RawMetric("soil.temperature.c", temperature, "Cel")),
                "sha256:" + sha256(frame.encoded()), "tcp-" + UUID.randomUUID(), eventId);
        String json = mapper.writeValueAsString(raw);
        Exception last = null;
        for (int attempt = 1; attempt <= KAFKA_ATTEMPTS; attempt++) {
            try {
                kafka.send(rawTopic, tenantId + ":" + deviceId, json).get(10, TimeUnit.SECONDS);
                return raw;
            } catch (Exception error) {
                last = error;
                if (attempt < KAFKA_ATTEMPTS) Thread.sleep(100L * attempt);
            }
        }
        throw last;
    }

    private static String sha256(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }
}
