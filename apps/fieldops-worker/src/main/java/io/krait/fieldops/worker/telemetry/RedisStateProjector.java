package io.krait.fieldops.worker.telemetry;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.TimeUnit;

import io.krait.fieldops.telemetry.domain.NormalizedMetric;
import io.krait.fieldops.telemetry.domain.NormalizedTelemetry;
import io.krait.fieldops.telemetry.domain.LatestState;
import io.krait.fieldops.telemetry.domain.SourceOrder;
import io.krait.fieldops.telemetry.domain.StateCondition;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
@Profile("local-observe")
public class RedisStateProjector {
    private static final Logger LOGGER = LoggerFactory.getLogger(RedisStateProjector.class);
    private static final long MAX_SAFE_INTEGER = 9_007_199_254_740_991L;
    private static final DefaultRedisScript<Long> CAS = new DefaultRedisScript<>("""
            local currentStart = tonumber(redis.call('HGET', KEYS[1], 'sessionStartedAt'))
            if currentStart then
              local nextStart = tonumber(ARGV[1])
              if nextStart < currentStart then return 0 end
              if nextStart == currentStart then
                local currentSequence = tonumber(redis.call('HGET', KEYS[1], 'sequence'))
                local nextSequence = tonumber(ARGV[2])
                if nextSequence < currentSequence then return 0 end
                if nextSequence == currentSequence then
                  local sameEvent = redis.call('HGET', KEYS[1], 'eventId') == ARGV[3]
                  local sameDigest = redis.call('HGET', KEYS[1], 'payloadDigest') == ARGV[4]
                  local sameSession = redis.call('HGET', KEYS[1], 'sessionId') == ARGV[5]
                  if sameEvent and sameDigest and sameSession then return 2 end
                  return -1
                end
              end
            end
            redis.call('HSET', KEYS[1],
              'sessionStartedAt', ARGV[1], 'sequence', ARGV[2],
              'eventId', ARGV[3], 'payloadDigest', ARGV[4], 'sessionId', ARGV[5],
              'stateJson', ARGV[6], 'stateEpoch', ARGV[7], 'revision', ARGV[8])
            redis.call('EXPIRE', KEYS[1], tonumber(ARGV[9]))
            return 1
            """, Long.class);

    private final ObjectMapper mapper;
    private final StringRedisTemplate redis;
    private final KafkaTemplate<String, String> kafka;
    private final JdbcClient jdbc;
    private final TopicEpochProvider epochs;
    private final String stateTopic;
    private final long ttlSeconds;
    private final Duration freshAfter;
    private final Duration offlineAfter;
    private final Counter accepted;
    private final Counter duplicate;
    private final Counter older;
    private final Counter conflicts;
    private final Counter redisErrors;
    private final Clock clock = Clock.systemUTC();

    public RedisStateProjector(ObjectMapper mapper, StringRedisTemplate redis, KafkaTemplate<String, String> kafka,
            JdbcClient jdbc, TopicEpochProvider epochs, MeterRegistry meters,
            @Value("${fieldops.b02.kafka.state-topic}") String stateTopic,
            @Value("${fieldops.b02.redis.state-ttl}") Duration stateTtl,
            @Value("${fieldops.b02.state-fresh-after}") Duration freshAfter,
            @Value("${fieldops.b02.state-offline-after}") Duration offlineAfter) {
        this.mapper = mapper;
        this.redis = redis;
        this.kafka = kafka;
        this.jdbc = jdbc;
        this.epochs = epochs;
        this.stateTopic = stateTopic;
        this.ttlSeconds = stateTtl.toSeconds();
        this.freshAfter = freshAfter;
        this.offlineAfter = offlineAfter;
        this.accepted = meters.counter("fieldops.worker.projection", "result", "accepted");
        this.duplicate = meters.counter("fieldops.worker.projection", "result", "duplicate");
        this.older = meters.counter("fieldops.worker.projection", "result", "older");
        this.conflicts = meters.counter("fieldops.worker.projection", "result", "conflict");
        this.redisErrors = meters.counter("fieldops.worker.projection", "result", "redis_error");
    }

    @KafkaListener(topics = "${fieldops.b02.kafka.normalized-topic}", groupId = "fieldops-b02-state")
    public void project(ConsumerRecord<String, String> record, Acknowledgment acknowledgment) throws Exception {
        NormalizedTelemetry telemetry = mapper.readValue(record.value(), NormalizedTelemetry.class);
        long revision = safeRevision(record.offset());
        String epoch = epochs.epoch(record.topic(), record.partition());
        LatestState state = new LatestState(telemetry.tenantId(), telemetry.siteId(), telemetry.deviceId(),
                telemetry.eventId(), telemetry.sessionId(), telemetry.sessionStartedAt(), telemetry.sequence(),
                telemetry.observedAt(), telemetry.receivedAt(), telemetry.payloadDigest(), telemetry.metrics(),
                epoch, revision);
        String stateJson = mapper.writeValueAsString(state);
        String key = stateKey(telemetry.tenantId(), telemetry.deviceId());

        final Long result;
        try {
            Long lowerBound = lowerBoundResult(key, telemetry);
            result = lowerBound != null ? lowerBound : redis.execute(CAS, List.of(key),
                    Long.toString(new SourceOrder(telemetry.sessionStartedAt(), telemetry.sequence())
                            .sessionStartedAtMillis()),
                    Long.toString(telemetry.sequence()), telemetry.eventId(), telemetry.payloadDigest(),
                    telemetry.sessionId(), stateJson, epoch, Long.toString(revision), Long.toString(ttlSeconds));
        } catch (RuntimeException error) {
            redisErrors.increment();
            throw error;
        }
        if (result == null) throw new IllegalStateException("Redis CAS returned no result");
        if (result == 0) {
            older.increment();
            acknowledgment.acknowledge();
            return;
        }
        if (result == -1) {
            conflicts.increment();
            recordRejection(telemetry, "STATE_ORDER_CONFLICT");
            acknowledgment.acknowledge();
            return;
        }
        if (result == 2) {
            String storedRevision = redis.<String, String>opsForHash().get(key, "revision");
            if (!Long.toString(revision).equals(storedRevision)) {
                duplicate.increment();
                acknowledgment.acknowledge();
                return;
            }
        }

        StateEvent event = StateEvent.from(state, clock.instant(), freshAfter, offlineAfter);
        kafka.send(stateTopic, telemetry.tenantId() + ":" + telemetry.deviceId(),
                mapper.writeValueAsString(event)).get(10, TimeUnit.SECONDS);
        acknowledgment.acknowledge();
        if (result == 1) accepted.increment(); else duplicate.increment();
    }

    private void recordRejection(NormalizedTelemetry telemetry, String reason) {
        jdbc.sql("""
                INSERT INTO b02_telemetry_rejection(
                    stage, reason_code, event_id, tenant_id, device_id, rejected_at)
                VALUES ('STATE', :reason, :eventId, :tenantId, :deviceId, :rejectedAt)
                """)
                .param("reason", reason)
                .param("eventId", telemetry.eventId())
                .param("tenantId", telemetry.tenantId())
                .param("deviceId", telemetry.deviceId())
                .param("rejectedAt", OffsetDateTime.ofInstant(Instant.now(), ZoneOffset.UTC))
                .update();
        LOGGER.warn("Rejected conflicting state event {}", telemetry.eventId());
    }

    private Long lowerBoundResult(String key, NormalizedTelemetry telemetry) {
        if (!Boolean.FALSE.equals(redis.hasKey(key))) return null;
        return jdbc.sql("""
                SELECT event_id, session_id, session_started_at, sequence, payload_digest
                FROM b02_device_snapshot WHERE tenant_id = :tenantId AND device_id = :deviceId
                """)
                .param("tenantId", telemetry.tenantId())
                .param("deviceId", telemetry.deviceId())
                .query((row, ignored) -> new SnapshotOrder(row.getString("event_id"), row.getString("session_id"),
                        row.getObject("session_started_at", OffsetDateTime.class).toInstant(),
                        row.getLong("sequence"), row.getString("payload_digest")))
                .optional()
                .map(snapshot -> compareSnapshot(snapshot, telemetry))
                .orElse(null);
    }

    private static Long compareSnapshot(SnapshotOrder snapshot, NormalizedTelemetry telemetry) {
        int comparison = new SourceOrder(telemetry.sessionStartedAt(), telemetry.sequence())
                .compareTo(new SourceOrder(snapshot.sessionStartedAt(), snapshot.sequence()));
        if (comparison < 0) return 0L;
        if (comparison > 0) return null;
        return snapshot.eventId().equals(telemetry.eventId())
                && snapshot.sessionId().equals(telemetry.sessionId())
                && snapshot.payloadDigest().equals(telemetry.payloadDigest()) ? 2L : -1L;
    }

    public static String stateKey(String tenantId, String deviceId) {
        return "b02:state:" + tenantId + ":" + deviceId;
    }

    private static long safeRevision(long offset) {
        if (offset < 0 || offset >= MAX_SAFE_INTEGER) {
            throw new IllegalArgumentException("Kafka offset is outside JavaScript safe integer range");
        }
        return offset + 1;
    }

    public record StateEvent(String eventId, String eventType, String tenantId, String siteId,
            String resourceType, String resourceId, long version, String stateEpoch, long revision,
            Instant occurredAt, StatePayload payload) {
        static StateEvent from(LatestState state, Instant now, Duration freshAfter, Duration offlineAfter) {
            StateCondition.Derived condition = StateCondition.derive(
                    state.receivedAt(), now, freshAfter, offlineAfter, false);
            StatePayload payload = new StatePayload(condition.connectivity(), condition.readiness(),
                    condition.freshness(), "REDIS_REALTIME", state.observedAt(), state.receivedAt(),
                    condition.staleAt(), state.metrics());
            return new StateEvent(state.eventId(), "device.state.updated", state.tenantId(), state.siteId(),
                    "DEVICE", state.deviceId(), state.revision(), state.stateEpoch(), state.revision(),
                    state.receivedAt(), payload);
        }
    }

    public record StatePayload(String connectivity, String readiness, String freshness, String source,
            Instant observedAt, Instant receivedAt, Instant staleAt, List<NormalizedMetric> metrics) {}
    private record SnapshotOrder(String eventId, String sessionId, Instant sessionStartedAt,
            long sequence, String payloadDigest) {}
}
