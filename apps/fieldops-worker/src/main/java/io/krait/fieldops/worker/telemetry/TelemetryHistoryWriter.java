package io.krait.fieldops.worker.telemetry;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import io.krait.fieldops.telemetry.domain.NormalizedTelemetry;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

@Component
@Profile("local-observe")
public class TelemetryHistoryWriter {
    private static final Logger LOGGER = LoggerFactory.getLogger(TelemetryHistoryWriter.class);
    private final ObjectMapper mapper;
    private final JdbcClient jdbc;
    private final TopicEpochProvider epochs;
    private final TransactionTemplate transactions;
    private final Counter stored;
    private final Counter duplicate;
    private final Counter older;
    private final Counter conflict;
    private final Timer persistDuration;
    private final Timer endToEndDuration;
    private final Clock clock = Clock.systemUTC();

    public TelemetryHistoryWriter(ObjectMapper mapper, JdbcClient jdbc, TopicEpochProvider epochs,
            MeterRegistry meters, PlatformTransactionManager transactionManager) {
        this.mapper = mapper;
        this.jdbc = jdbc;
        this.epochs = epochs;
        this.transactions = new TransactionTemplate(transactionManager);
        this.stored = meters.counter("fieldops.worker.history", "result", "stored");
        this.duplicate = meters.counter("fieldops.worker.history", "result", "duplicate");
        this.older = meters.counter("fieldops.worker.history", "result", "older");
        this.conflict = meters.counter("fieldops.worker.history", "result", "conflict");
        this.persistDuration = meters.timer("fieldops.worker.history.persist.duration");
        this.endToEndDuration = meters.timer("fieldops.worker.history.e2e.duration");
    }

    @KafkaListener(topics = "${fieldops.b02.kafka.normalized-topic}", groupId = "fieldops-b02-history",
            concurrency = "${fieldops.b06.listener-concurrency:1}")
    public void store(ConsumerRecord<String, String> record, Acknowledgment acknowledgment) throws Exception {
        NormalizedTelemetry telemetry = mapper.readValue(record.value(), NormalizedTelemetry.class);
        String metricsJson = mapper.writeValueAsString(telemetry.metrics());
        Timer.Sample persistSample = Timer.start();
        StoreResult result;
        try {
            result = transactions.execute(status -> persist(record, telemetry, metricsJson));
        } finally {
            persistSample.stop(persistDuration);
        }
        if (result == null) throw new IllegalStateException("History transaction returned no result");
        switch (result) {
            case STORED -> stored.increment();
            case STORED_OLDER -> {
                stored.increment();
                older.increment();
            }
            case DUPLICATE -> duplicate.increment();
            case CONFLICT -> {
                conflict.increment();
                LOGGER.warn("Rejected conflicting telemetry event {}", telemetry.eventId());
            }
        }
        // MANUAL_IMMEDIATE can commit the Kafka offset at this call, so it must
        // remain outside the JDBC TransactionTemplate's commit boundary.
        acknowledgment.acknowledge();
        recordEndToEnd(telemetry);
    }

    private void recordEndToEnd(NormalizedTelemetry telemetry) {
        java.time.Duration elapsed = java.time.Duration.between(telemetry.receivedAt(), clock.instant());
        if (!elapsed.isNegative()) endToEndDuration.record(elapsed);
    }

    private StoreResult persist(ConsumerRecord<String, String> record, NormalizedTelemetry telemetry,
            String metricsJson) {
        List<Existing> candidates = existingCandidates(telemetry);
        if (!candidates.isEmpty()) {
            boolean exact = candidates.stream().anyMatch(existing -> existing.eventId().equals(telemetry.eventId())
                    && existing.sessionId().equals(telemetry.sessionId())
                    && existing.sequence() == telemetry.sequence()
                    && existing.payloadDigest().equals(telemetry.payloadDigest()));
            if (exact) {
                return StoreResult.DUPLICATE;
            } else {
                recordRejection(telemetry, "ORDER_OR_EVENT_CONFLICT");
                return StoreResult.CONFLICT;
            }
        }
        jdbc.sql("""
                    INSERT INTO b02_telemetry_history(
                        tenant_id, event_id, site_id, device_id, session_id, session_started_at,
                        sequence, observed_at, received_at, payload_digest, metrics_json,
                        kafka_partition, kafka_offset)
                    VALUES (:tenantId, :eventId, :siteId, :deviceId, :sessionId, :sessionStartedAt,
                        :sequence, :observedAt, :receivedAt, :digest, :metrics, :partition, :offset)
                    """)
                    .param("tenantId", telemetry.tenantId())
                    .param("eventId", telemetry.eventId())
                    .param("siteId", telemetry.siteId())
                    .param("deviceId", telemetry.deviceId())
                    .param("sessionId", telemetry.sessionId())
                    .param("sessionStartedAt", dbTime(telemetry.sessionStartedAt()))
                    .param("sequence", telemetry.sequence())
                    .param("observedAt", dbTime(telemetry.observedAt()))
                    .param("receivedAt", dbTime(telemetry.receivedAt()))
                    .param("digest", telemetry.payloadDigest())
                    .param("metrics", metricsJson)
                    .param("partition", record.partition())
                    .param("offset", record.offset())
                    .update();

        long revision = safeRevision(record.offset());
        String epoch = epochs.epoch(record.topic(), record.partition());
        int updated = updateSnapshotIfNewer(telemetry, metricsJson, epoch, revision);
        if (updated == 0 && !insertSnapshotIfAbsent(telemetry, metricsJson, epoch, revision)) {
            return StoreResult.STORED_OLDER;
        }
        return StoreResult.STORED;
    }

    private List<Existing> existingCandidates(NormalizedTelemetry telemetry) {
        return jdbc.sql("""
                SELECT event_id, session_id, sequence, payload_digest
                FROM b02_telemetry_history
                WHERE tenant_id = :tenantId AND device_id = :deviceId
                  AND (event_id = :eventId OR (session_id = :sessionId AND sequence = :sequence))
                """)
                .param("tenantId", telemetry.tenantId())
                .param("deviceId", telemetry.deviceId())
                .param("eventId", telemetry.eventId())
                .param("sessionId", telemetry.sessionId())
                .param("sequence", telemetry.sequence())
                .query((row, ignored) -> new Existing(row.getString("event_id"), row.getString("session_id"),
                        row.getLong("sequence"), row.getString("payload_digest")))
                .list();
    }

    private int updateSnapshotIfNewer(NormalizedTelemetry telemetry, String metricsJson,
            String epoch, long revision) {
        return jdbc.sql("""
                UPDATE b02_device_snapshot SET
                    site_id = :siteId, event_id = :eventId, session_id = :sessionId,
                    session_started_at = :sessionStartedAt, sequence = :sequence,
                    observed_at = :observedAt, received_at = :receivedAt,
                    payload_digest = :digest, metrics_json = :metrics,
                    state_epoch = :epoch, revision = :revision
                WHERE tenant_id = :tenantId AND device_id = :deviceId
                  AND (session_started_at < :sessionStartedAt
                    OR (session_started_at = :sessionStartedAt AND sequence < :sequence))
                """)
                .param("tenantId", telemetry.tenantId())
                .param("siteId", telemetry.siteId())
                .param("deviceId", telemetry.deviceId())
                .param("eventId", telemetry.eventId())
                .param("sessionId", telemetry.sessionId())
                .param("sessionStartedAt", dbTime(telemetry.sessionStartedAt()))
                .param("sequence", telemetry.sequence())
                .param("observedAt", dbTime(telemetry.observedAt()))
                .param("receivedAt", dbTime(telemetry.receivedAt()))
                .param("digest", telemetry.payloadDigest())
                .param("metrics", metricsJson)
                .param("epoch", epoch)
                .param("revision", revision)
                .update();
    }

    private boolean insertSnapshotIfAbsent(NormalizedTelemetry telemetry, String metricsJson,
            String epoch, long revision) {
        return jdbc.sql("""
                    INSERT INTO b02_device_snapshot(
                        tenant_id, site_id, device_id, event_id, session_id, session_started_at,
                        sequence, observed_at, received_at, payload_digest, metrics_json,
                        state_epoch, revision)
                    VALUES (:tenantId, :siteId, :deviceId, :eventId, :sessionId, :sessionStartedAt,
                        :sequence, :observedAt, :receivedAt, :digest, :metrics, :epoch, :revision)
                    ON CONFLICT (tenant_id, device_id) DO NOTHING
                    """)
                    .param("tenantId", telemetry.tenantId())
                    .param("siteId", telemetry.siteId())
                    .param("deviceId", telemetry.deviceId())
                    .param("eventId", telemetry.eventId())
                    .param("sessionId", telemetry.sessionId())
                    .param("sessionStartedAt", dbTime(telemetry.sessionStartedAt()))
                    .param("sequence", telemetry.sequence())
                    .param("observedAt", dbTime(telemetry.observedAt()))
                    .param("receivedAt", dbTime(telemetry.receivedAt()))
                    .param("digest", telemetry.payloadDigest())
                    .param("metrics", metricsJson)
                    .param("epoch", epoch)
                    .param("revision", revision)
                    .update() == 1;
    }

    private void recordRejection(NormalizedTelemetry telemetry, String reason) {
        jdbc.sql("""
                INSERT INTO b02_telemetry_rejection(
                    stage, reason_code, event_id, tenant_id, device_id, rejected_at)
                VALUES ('HISTORY', :reason, :eventId, :tenantId, :deviceId, :rejectedAt)
                """)
                .param("reason", reason)
                .param("eventId", telemetry.eventId())
                .param("tenantId", telemetry.tenantId())
                .param("deviceId", telemetry.deviceId())
                .param("rejectedAt", dbTime(clock.instant()))
                .update();
    }

    private static OffsetDateTime dbTime(java.time.Instant value) {
        return OffsetDateTime.ofInstant(value, ZoneOffset.UTC);
    }

    private static long safeRevision(long offset) {
        if (offset < 0 || offset >= 9_007_199_254_740_991L) {
            throw new IllegalArgumentException("Kafka offset is outside JavaScript safe integer range");
        }
        return offset + 1;
    }

    private record Existing(String eventId, String sessionId, long sequence, String payloadDigest) {}
    private enum StoreResult { STORED, STORED_OLDER, DUPLICATE, CONFLICT }
}
