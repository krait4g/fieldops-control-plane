package io.krait.fieldops.server.query;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import io.krait.fieldops.telemetry.domain.LatestState;
import io.krait.fieldops.telemetry.domain.NormalizedMetric;
import io.krait.fieldops.telemetry.domain.StateCondition;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JavaType;
import tools.jackson.databind.ObjectMapper;

@Service
@Profile("local-observe")
public class ObserveQueryService {
    private final JdbcClient jdbc;
    private final StringRedisTemplate redis;
    private final ObjectMapper mapper;
    private final Duration freshAfter;
    private final Duration offlineAfter;
    private final Clock clock = Clock.systemUTC();
    private final JavaType metricListType;

    public ObserveQueryService(JdbcClient jdbc, StringRedisTemplate redis, ObjectMapper mapper,
            @Value("${fieldops.b02.state-fresh-after}") Duration freshAfter,
            @Value("${fieldops.b02.state-offline-after}") Duration offlineAfter) {
        this.jdbc = jdbc;
        this.redis = redis;
        this.mapper = mapper;
        this.freshAfter = freshAfter;
        this.offlineAfter = offlineAfter;
        this.metricListType = mapper.getTypeFactory().constructCollectionType(List.class, NormalizedMetric.class);
    }

    public Map<String, Object> overview(String tenantId, String siteId, String range) {
        Site site = site(tenantId, siteId);
        Instant now = clock.instant();
        List<Device> devices = devices(tenantId, siteId);
        List<StateView> states = devices.stream().map(device -> state(tenantId, device.id()).orElse(null)).toList();
        int online = (int) states.stream().filter(state -> state != null && "ONLINE".equals(state.connectivity())).count();
        int offline = (int) states.stream().filter(state -> state != null && "OFFLINE".equals(state.connectivity())).count();
        int unknown = devices.size() - online - offline;
        int fresh = (int) states.stream().filter(state -> state != null && "FRESH".equals(state.freshness())).count();
        int stale = (int) states.stream().filter(state -> state != null && "STALE".equals(state.freshness())).count();

        Map<String, StateView> stateByDevice = states.stream().filter(java.util.Objects::nonNull)
                .collect(Collectors.toMap(StateView::deviceId, value -> value));
        Map<String, StateView> latestByZone = new LinkedHashMap<>();
        for (Device device : devices) {
            StateView state = stateByDevice.get(device.id());
            if (state == null) continue;
            latestByZone.merge(device.zoneId(), state,
                    (left, right) -> left.receivedAt().isAfter(right.receivedAt()) ? left : right);
        }
        List<Map<String, Object>> conditions = new ArrayList<>();
        for (Map.Entry<String, StateView> entry : latestByZone.entrySet()) {
            Device representative = devices.stream().filter(device -> device.zoneId().equals(entry.getKey())).findFirst().orElseThrow();
            conditions.add(map("zoneId", entry.getKey(), "zoneName", representative.zoneName(),
                    "metrics", entry.getValue().metrics().stream().map(this::metricMap).toList()));
        }

        Map<String, Object> widgets = map(
                "deviceStatus", widget("AVAILABLE", "COMPOSED_READ_MODEL", now,
                        map("online", online, "offline", offline, "degraded", 0, "unknown", unknown,
                                "total", devices.size())),
                "activeAlarms", widget("EMPTY", "COMPOSED_READ_MODEL", now,
                        map("active", 0, "critical", 0, "warning", 0, "info", 0, "highestSeverity", null)),
                "commands", widget("EMPTY", "COMPOSED_READ_MODEL", now,
                        map("waitingApproval", 0, "inProgress", 0, "unknown", 0)),
                "freshness", widget(devices.isEmpty() ? "EMPTY" : "AVAILABLE", "COMPOSED_READ_MODEL", now,
                        map("fresh", fresh, "stale", stale, "monitored", devices.size(),
                                "ratio", devices.isEmpty() ? 0.0 : (double) fresh / devices.size())),
                "currentConditions", widget(conditions.isEmpty() ? "EMPTY" : "AVAILABLE",
                        "COMPOSED_READ_MODEL", now, conditions),
                "activeAlarmList", widget("EMPTY", "COMPOSED_READ_MODEL", now, List.of()),
                "deviceHealth", widget("AVAILABLE", "COMPOSED_READ_MODEL", now,
                        map("online", online, "offline", offline, "degraded", 0, "unknown", unknown,
                                "total", devices.size())),
                "recentCommands", widget("EMPTY", "COMPOSED_READ_MODEL", now, List.of()),
                "primaryCamera", widget("EMPTY", "NONE", now, null));
        return map("context", map("tenantId", tenantId, "siteId", siteId, "siteName", site.name(),
                        "timezone", site.timezone(), "range", range, "generatedAt", now,
                        "dataVersion", "b02-" + states.stream().filter(java.util.Objects::nonNull)
                                .mapToLong(StateView::revision).max().orElse(0)),
                "widgets", widgets, "partialFailures", List.of());
    }

    public Map<String, Object> listDevices(String tenantId, String siteId, String query,
            String deviceType, String protocol, String connectivity, String readiness,
            String freshness, String cursor, int pageSize) {
        List<Device> all = devices(tenantId, siteId);
        String normalizedQuery = query == null ? "" : query.toLowerCase(Locale.ROOT);
        String normalizedType = deviceType == null ? "" : deviceType.toLowerCase(Locale.ROOT);
        String filterKey = fingerprint(normalizedQuery, normalizedType, protocol, connectivity, readiness, freshness);
        String after = decodeCursor(cursor, tenantId, siteId, filterKey);
        List<Map<String, Object>> filtered = all.stream().map(device -> {
            StateView state = state(tenantId, device.id()).orElse(null);
            return deviceSummary(device, state);
        }).filter(row -> normalizedQuery.isBlank()
                || String.valueOf(row.get("name")).toLowerCase(Locale.ROOT).contains(normalizedQuery)
                || String.valueOf(row.get("externalId")).toLowerCase(Locale.ROOT).contains(normalizedQuery))
                .filter(row -> normalizedType.isBlank()
                        || String.valueOf(row.get("typeCode")).toLowerCase(Locale.ROOT).contains(normalizedType)
                        || String.valueOf(row.get("typeName")).toLowerCase(Locale.ROOT).contains(normalizedType))
                .filter(row -> protocol == null || protocol.equals(row.get("protocol")))
                .filter(row -> connectivity == null || connectivity.equals(row.get("connectivity")))
                .filter(row -> readiness == null || readiness.equals(row.get("readiness")))
                .filter(row -> freshness == null || freshness.equals(row.get("freshness")))
                .toList();
        List<Map<String, Object>> matching = filtered.stream()
                .filter(row -> after == null || String.valueOf(row.get("id")).compareTo(after) > 0).toList();
        boolean hasNext = matching.size() > pageSize;
        List<Map<String, Object>> page = matching.stream().limit(pageSize).toList();
        String next = hasNext ? encodeCursor(tenantId, siteId, filterKey,
                String.valueOf(page.getLast().get("id"))) : null;
        return map("items", page, "page", map("pageSize", pageSize, "hasNext", hasNext,
                "nextCursor", next), "total", filtered.size());
    }

    public Map<String, Object> device(String tenantId, String deviceId) {
        Device device = deviceRow(tenantId, deviceId);
        StateView state = state(tenantId, deviceId).orElse(null);
        return map("id", device.id(), "externalId", device.externalId(), "name", device.name(),
                "typeCode", device.typeCode(), "typeName", device.typeName(), "siteId", device.siteId(),
                "siteName", device.siteName(), "zoneId", device.zoneId(), "zoneName", device.zoneName(),
                "protocol", device.protocol(),
                "primaryMetricCodes", List.of("soil.moisture.pct", "soil.temperature.c"),
                "connection", map("adapterType", "MQTT_5", "status", state == null ? "UNKNOWN" :
                                ("OFFLINE".equals(state.connectivity()) ? "DISCONNECTED" : "CONNECTED"),
                        "lastConnectedAt", state == null ? null : state.receivedAt(),
                        "lastDisconnectedAt", "OFFLINE".equals(state == null ? null : state.connectivity())
                                ? state.receivedAt() : null,
                        "reasonCode", state == null ? "NO_TELEMETRY" : null,
                        "sessionIdMasked", state == null ? null : mask(state.sessionId())),
                "createdAt", device.createdAt(), "updatedAt", device.updatedAt(), "version", device.version());
    }

    public String siteIdForDevice(String tenantId, String deviceId) {
        return deviceRow(tenantId, deviceId).siteId();
    }

    public Map<String, Object> deviceState(String tenantId, String deviceId) {
        deviceRow(tenantId, deviceId);
        StateView state = state(tenantId, deviceId)
                .orElseThrow(() -> new StateUnavailableException("No telemetry state exists for the device"));
        return map("deviceId", state.deviceId(), "connectivity", state.connectivity(),
                "readiness", state.readiness(), "freshness", state.freshness(), "source", state.source(),
                "stateVersion", state.revision(), "stateEpoch", state.stateEpoch(), "revision", state.revision(),
                "observedAt", state.observedAt(), "receivedAt", state.receivedAt(), "staleAt", state.staleAt(),
                "metrics", state.metrics().stream().map(this::metricMap).toList());
    }

    public Map<String, Object> series(String tenantId, String siteId, String deviceId,
            String range, String bucket, List<String> requestedMetrics) {
        Site site = site(tenantId, siteId);
        if (deviceId != null) deviceRow(tenantId, deviceId);
        Instant now = clock.instant();
        Instant start = now.minus(duration(range));
        long bucketSeconds = bucketDuration(bucket).toSeconds();
        String sql = deviceId == null ? """
                SELECT device_id, observed_at, metrics_json FROM b02_telemetry_history
                WHERE tenant_id = :tenantId AND site_id = :siteId AND observed_at >= :start
                ORDER BY observed_at, device_id
                """ : """
                SELECT device_id, observed_at, metrics_json FROM b02_telemetry_history
                WHERE tenant_id = :tenantId AND site_id = :siteId AND device_id = :deviceId
                  AND observed_at >= :start ORDER BY observed_at
                """;
        JdbcClient.StatementSpec statement = jdbc.sql(sql).param("tenantId", tenantId)
                .param("siteId", siteId).param("start", dbTime(start));
        if (deviceId != null) statement = statement.param("deviceId", deviceId);
        List<HistoryRow> rows = statement.query((row, ignored) -> new HistoryRow(
                row.getString("device_id"), instant(row.getObject("observed_at")),
                readMetrics(row.getString("metrics_json")))).list();
        List<String> codes = requestedMetrics == null || requestedMetrics.isEmpty()
                ? List.of("soil.moisture.pct", "soil.temperature.c") : requestedMetrics;
        List<Map<String, Object>> series = new ArrayList<>();
        for (String code : codes) {
            if (!List.of("soil.moisture.pct", "soil.temperature.c").contains(code)) {
                throw new InvalidQueryException("Unsupported B02 metric code");
            }
            Map<Instant, List<NormalizedMetric>> buckets = rows.stream()
                    .flatMap(row -> row.metrics().stream().filter(metric -> code.equals(metric.code()))
                            .map(metric -> Map.entry(bucketStart(row.observedAt(), bucketSeconds), metric)))
                    .collect(Collectors.groupingBy(Map.Entry::getKey, LinkedHashMap::new,
                            Collectors.mapping(Map.Entry::getValue, Collectors.toList())));
            List<Map<String, Object>> points = buckets.entrySet().stream()
                    .sorted(Map.Entry.comparingByKey())
                    .map(entry -> map("timestamp", entry.getKey(), "value",
                            entry.getValue().stream().mapToDouble(NormalizedMetric::value).average().orElseThrow(),
                            "quality", aggregateQuality(entry.getValue())))
                    .toList();
            String name = code.equals("soil.moisture.pct") ? "Soil moisture" : "Soil temperature";
            String unit = code.equals("soil.moisture.pct") ? "%" : "Cel";
            series.add(map("metricCode", code, "displayName", name, "unit", unit,
                    "aggregation", "AVG", "points", points));
        }
        return map("context", map("tenantId", tenantId, "siteId", siteId, "deviceId", deviceId,
                        "timezone", site.timezone(), "range", range, "bucket", bucket, "generatedAt", now),
                "series", series);
    }

    public Map<String, Object> members(String tenantId, String query, String role, String status,
            String siteId, String cursor, int pageSize) {
        String normalized = query == null ? "" : query.toLowerCase(Locale.ROOT);
        String filterKey = fingerprint(normalized, role, status, siteId);
        String after = decodeCursor(cursor, tenantId, "members", filterKey);
        List<Map<String, Object>> members = jdbc.sql("""
                SELECT m.issuer, p.subject, p.display_name, p.email, m.role_code, m.all_sites, m.status
                FROM b02_membership m
                JOIN b02_principal p ON p.issuer = m.issuer AND p.subject = m.subject
                WHERE m.tenant_id = :tenantId ORDER BY p.subject
                """).param("tenantId", tenantId).query((row, ignored) -> {
                    String subject = row.getString("subject");
                    List<Map<String, Object>> sites = jdbc.sql("""
                            SELECT s.site_id, s.name, s.timezone FROM b02_membership_site ms
                            JOIN b02_site s ON s.tenant_id = ms.tenant_id AND s.site_id = ms.site_id
                            WHERE ms.issuer = :issuer AND ms.subject = :subject
                              AND ms.tenant_id = :tenantId ORDER BY s.site_id
                            """).param("issuer", row.getString("issuer"))
                            .param("subject", subject).param("tenantId", tenantId)
                            .query((siteRow, siteIndex) -> map("id", siteRow.getString("site_id"),
                                    "name", siteRow.getString("name"), "timezone", siteRow.getString("timezone")))
                            .list();
                    return map("id", "membership-" + subject, "displayName", row.getString("display_name"),
                            "email", row.getString("email"), "role", row.getString("role_code"),
                            "siteScopes", sites, "allSites", row.getBoolean("all_sites"),
                            "status", row.getString("status"), "lastLoginAt", null,
                            "updatedBy", "system-seed", "updatedAt", Instant.parse("2026-09-07T00:00:00Z"));
                }).list().stream()
                .filter(member -> normalized.isBlank()
                        || String.valueOf(member.get("displayName")).toLowerCase(Locale.ROOT).contains(normalized)
                        || String.valueOf(member.get("email")).toLowerCase(Locale.ROOT).contains(normalized))
                .filter(member -> role == null || role.equals(member.get("role")))
                .filter(member -> status == null || status.equals(member.get("status")))
                .filter(member -> siteId == null || Boolean.TRUE.equals(member.get("allSites"))
                        || ((List<?>) member.get("siteScopes")).stream().anyMatch(scope -> siteId.equals(
                                ((Map<?, ?>) scope).get("id"))))
                .toList();
        List<Map<String, Object>> afterCursor = members.stream()
                .filter(member -> after == null || String.valueOf(member.get("id")).compareTo(after) > 0).toList();
        boolean hasNext = afterCursor.size() > pageSize;
        List<Map<String, Object>> page = afterCursor.stream().limit(pageSize).toList();
        String next = hasNext ? encodeCursor(tenantId, "members", filterKey,
                String.valueOf(page.getLast().get("id"))) : null;
        return map("items", page, "page", map("pageSize", pageSize, "hasNext", hasNext,
                "nextCursor", next), "total", members.size());
    }

    public Optional<StateView> state(String tenantId, String deviceId) {
        String key = "b02:state:" + tenantId + ":" + deviceId;
        try {
            String json = redis.<String, String>opsForHash().get(key, "stateJson");
            if (json != null) return Optional.of(toView(mapper.readValue(json, LatestState.class), "REDIS_REALTIME"));
        } catch (RuntimeException redisUnavailable) {
            // PostgreSQL is the explicit stale snapshot fallback; the failure is not converted to an empty success.
        }
        return jdbc.sql("""
                SELECT tenant_id, site_id, device_id, event_id, session_id, session_started_at,
                       sequence, observed_at, received_at, payload_digest, metrics_json, state_epoch, revision
                FROM b02_device_snapshot WHERE tenant_id = :tenantId AND device_id = :deviceId
                """).param("tenantId", tenantId).param("deviceId", deviceId)
                .query((row, ignored) -> new LatestState(row.getString("tenant_id"), row.getString("site_id"),
                        row.getString("device_id"), row.getString("event_id"), row.getString("session_id"),
                        instant(row.getObject("session_started_at")), row.getLong("sequence"),
                        instant(row.getObject("observed_at")), instant(row.getObject("received_at")),
                        row.getString("payload_digest"), readMetrics(row.getString("metrics_json")),
                        row.getString("state_epoch"), row.getLong("revision")))
                .optional().map(value -> toView(value, "POSTGRES_SNAPSHOT"));
    }

    private StateView toView(LatestState state, String source) {
        StateCondition.Derived condition = StateCondition.derive(state.receivedAt(), clock.instant(),
                freshAfter, offlineAfter, "POSTGRES_SNAPSHOT".equals(source));
        return new StateView(state.deviceId(), condition.connectivity(), condition.readiness(),
                condition.freshness(), source,
                state.sessionId(), state.observedAt(), state.receivedAt(),
                condition.staleAt(), state.metrics(), state.stateEpoch(), state.revision());
    }

    private Site site(String tenantId, String siteId) {
        return jdbc.sql("SELECT site_id, name, timezone FROM b02_site WHERE tenant_id=:tenantId AND site_id=:siteId")
                .param("tenantId", tenantId).param("siteId", siteId)
                .query((row, ignored) -> new Site(row.getString("site_id"), row.getString("name"),
                        row.getString("timezone"))).single();
    }

    private List<Device> devices(String tenantId, String siteId) {
        return jdbc.sql("""
                SELECT d.*, s.name AS site_name FROM b02_device d JOIN b02_site s
                  ON s.tenant_id=d.tenant_id AND s.site_id=d.site_id
                WHERE d.tenant_id=:tenantId AND d.site_id=:siteId ORDER BY d.device_id
                """).param("tenantId", tenantId).param("siteId", siteId)
                .query(this::mapDevice).list();
    }

    private Device deviceRow(String tenantId, String deviceId) {
        return jdbc.sql("""
                SELECT d.*, s.name AS site_name FROM b02_device d JOIN b02_site s
                  ON s.tenant_id=d.tenant_id AND s.site_id=d.site_id
                WHERE d.tenant_id=:tenantId AND d.device_id=:deviceId
                """).param("tenantId", tenantId).param("deviceId", deviceId)
                .query(this::mapDevice).single();
    }

    private Device mapDevice(java.sql.ResultSet row, int ignored) throws java.sql.SQLException {
        return new Device(row.getString("device_id"), row.getString("external_id"), row.getString("name"),
                row.getString("type_code"), row.getString("type_name"), row.getString("site_id"),
                row.getString("site_name"), row.getString("zone_id"), row.getString("zone_name"),
                row.getString("protocol"), instant(row.getObject("created_at")),
                instant(row.getObject("updated_at")), row.getLong("version"));
    }

    private Map<String, Object> deviceSummary(Device device, StateView state) {
        NormalizedMetric latest = state == null || state.metrics().isEmpty() ? null : state.metrics().getFirst();
        return map("id", device.id(), "externalId", device.externalId(), "name", device.name(),
                "typeCode", device.typeCode(), "typeName", device.typeName(), "siteId", device.siteId(),
                "siteName", device.siteName(), "zoneId", device.zoneId(), "zoneName", device.zoneName(),
                "protocol", device.protocol(), "connectivity", state == null ? "UNKNOWN" : state.connectivity(),
                "readiness", state == null ? "UNKNOWN" : state.readiness(),
                "freshness", state == null ? "UNKNOWN" : state.freshness(),
                "latestMetric", latest == null ? null : metricMap(latest),
                "lastSeenAt", state == null ? null : state.receivedAt(), "activeAlarmCount", 0,
                "version", state == null ? device.version() : state.revision());
    }

    private Map<String, Object> metricMap(NormalizedMetric metric) {
        return map("code", metric.code(), "displayName", metric.displayName(), "value", metric.value(),
                "unit", metric.unit(), "quality", metric.quality(), "observedAt", metric.observedAt());
    }

    private static Map<String, Object> widget(String status, String source, Instant generatedAt, Object data) {
        return map("meta", map("status", status, "source", source, "generatedAt", generatedAt,
                "staleAt", null, "failure", null), "data", data);
    }

    public static Map<String, Object> map(Object... values) {
        if (values.length % 2 != 0) throw new IllegalArgumentException("map requires key/value pairs");
        Map<String, Object> result = new LinkedHashMap<>();
        for (int index = 0; index < values.length; index += 2) {
            result.put((String) values[index], values[index + 1]);
        }
        return result;
    }

    private List<NormalizedMetric> readMetrics(String json) {
        try {
            return mapper.readValue(json, metricListType);
        } catch (tools.jackson.core.JacksonException error) {
            throw new IllegalStateException("Stored telemetry metrics are invalid", error);
        }
    }

    private static Instant instant(Object value) {
        if (value instanceof OffsetDateTime timestamp) return timestamp.toInstant();
        if (value instanceof Instant timestamp) return timestamp;
        if (value instanceof java.sql.Timestamp timestamp) return timestamp.toInstant();
        return OffsetDateTime.parse(String.valueOf(value)).toInstant();
    }

    private static OffsetDateTime dbTime(Instant value) {
        return OffsetDateTime.ofInstant(value, ZoneOffset.UTC);
    }

    private static Duration duration(String range) {
        return switch (range) {
            case "PT1H" -> Duration.ofHours(1);
            case "PT6H" -> Duration.ofHours(6);
            case "P7D" -> Duration.ofDays(7);
            case "PT24H" -> Duration.ofHours(24);
            default -> throw new InvalidQueryException("Invalid range");
        };
    }

    private static Duration bucketDuration(String bucket) {
        return switch (bucket) {
            case "PT1M" -> Duration.ofMinutes(1);
            case "PT5M" -> Duration.ofMinutes(5);
            case "PT1H" -> Duration.ofHours(1);
            case "PT6H" -> Duration.ofHours(6);
            default -> throw new InvalidQueryException("Invalid bucket");
        };
    }

    private static Instant bucketStart(Instant observedAt, long bucketSeconds) {
        return Instant.ofEpochSecond(Math.floorDiv(observedAt.getEpochSecond(), bucketSeconds) * bucketSeconds);
    }

    private static String aggregateQuality(List<NormalizedMetric> metrics) {
        return metrics.stream().map(NormalizedMetric::quality)
                .max(Comparator.comparingInt(ObserveQueryService::qualityRank)).orElse("UNKNOWN");
    }

    private static int qualityRank(String quality) {
        return switch (quality) { case "BAD" -> 3; case "UNCERTAIN" -> 2; case "GOOD" -> 1; default -> 4; };
    }

    private static String mask(String sessionId) {
        return sessionId.length() <= 4 ? "••••" : "mqtt-••••-" + sessionId.substring(sessionId.length() - 4);
    }

    private static String encodeCursor(String tenantId, String siteId, String filterKey, String itemId) {
        String value = String.join("\n", tenantId, siteId, filterKey, itemId);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String decodeCursor(String cursor, String tenantId, String siteId, String filterKey) {
        if (cursor == null || cursor.isBlank()) return null;
        try {
            String[] values = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8).split("\n", -1);
            if (values.length != 4 || !tenantId.equals(values[0]) || !siteId.equals(values[1])
                    || !filterKey.equals(values[2])) {
                throw new IllegalArgumentException("cursor scope differs from the request");
            }
            return values[3];
        } catch (IllegalArgumentException error) {
            throw new InvalidQueryException("Invalid or cross-scope cursor");
        }
    }

    private static String fingerprint(String... values) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            for (String value : values) {
                byte[] bytes = String.valueOf(value).getBytes(StandardCharsets.UTF_8);
                digest.update((byte) (bytes.length >>> 24));
                digest.update((byte) (bytes.length >>> 16));
                digest.update((byte) (bytes.length >>> 8));
                digest.update((byte) bytes.length);
                digest.update(bytes);
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 unavailable", error);
        }
    }

    private record Site(String id, String name, String timezone) {}
    private record Device(String id, String externalId, String name, String typeCode, String typeName,
            String siteId, String siteName, String zoneId, String zoneName, String protocol,
            Instant createdAt, Instant updatedAt, long version) {}
    private record HistoryRow(String deviceId, Instant observedAt, List<NormalizedMetric> metrics) {}
    public record StateView(String deviceId, String connectivity, String readiness, String freshness,
            String source, String sessionId, Instant observedAt, Instant receivedAt, Instant staleAt,
            List<NormalizedMetric> metrics, String stateEpoch, long revision) {}

    public static final class StateUnavailableException extends RuntimeException {
        private static final long serialVersionUID = 1L;
        public StateUnavailableException(String message) { super(message); }
    }

    public static final class InvalidQueryException extends RuntimeException {
        private static final long serialVersionUID = 1L;
        public InvalidQueryException(String message) { super(message); }
    }
}
