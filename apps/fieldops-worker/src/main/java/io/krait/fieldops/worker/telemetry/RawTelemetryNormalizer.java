package io.krait.fieldops.worker.telemetry;

import java.util.concurrent.TimeUnit;

import io.krait.fieldops.telemetry.application.TelemetryNormalizer;
import io.krait.fieldops.telemetry.domain.NormalizedTelemetry;
import io.krait.fieldops.telemetry.domain.RawTelemetry;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
@Profile("local-observe")
public class RawTelemetryNormalizer {
    private static final Logger LOGGER = LoggerFactory.getLogger(RawTelemetryNormalizer.class);
    private final ObjectMapper mapper;
    private final KafkaTemplate<String, String> kafka;
    private final TelemetryNormalizer normalizer = new TelemetryNormalizer();
    private final String normalizedTopic;
    private final Counter accepted;
    private final Counter rejected;

    public RawTelemetryNormalizer(ObjectMapper mapper, KafkaTemplate<String, String> kafka, MeterRegistry meters,
            @Value("${fieldops.b02.kafka.normalized-topic}") String normalizedTopic) {
        this.mapper = mapper;
        this.kafka = kafka;
        this.normalizedTopic = normalizedTopic;
        this.accepted = meters.counter("fieldops.worker.normalization", "result", "accepted");
        this.rejected = meters.counter("fieldops.worker.normalization", "result", "rejected");
    }

    @KafkaListener(topics = "${fieldops.b02.kafka.raw-topic}", groupId = "fieldops-b02-normalizer")
    public void normalize(ConsumerRecord<String, String> record, Acknowledgment acknowledgment) throws Exception {
        try {
            RawTelemetry raw = mapper.readValue(record.value(), RawTelemetry.class);
            NormalizedTelemetry normalized = normalizer.normalize(raw);
            kafka.send(normalizedTopic, normalized.tenantId() + ":" + normalized.deviceId(),
                    mapper.writeValueAsString(normalized)).get(10, TimeUnit.SECONDS);
            acknowledgment.acknowledge();
            accepted.increment();
        } catch (IllegalArgumentException | tools.jackson.core.JacksonException error) {
            rejected.increment();
            LOGGER.warn("Rejected B02 raw telemetry at offset {}: {}", record.offset(), error.getMessage());
            acknowledgment.acknowledge();
        }
    }
}
