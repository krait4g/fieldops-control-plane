package io.krait.fieldops.server.query;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import tools.jackson.databind.ObjectMapper;

class ObserveQueryServiceTests {
    private JdbcClient jdbc;
    private ObserveQueryService queries;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        jdbc = JdbcClient.create(new DriverManagerDataSource(
                "jdbc:h2:mem:query-" + System.nanoTime() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", ""));
        createSchemaAndSeed();
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        HashOperations<String, String, String> hashes = mock(HashOperations.class);
        when(redis.<String, String>opsForHash()).thenReturn(hashes);
        when(hashes.get(anyString(), anyString())).thenReturn(null);
        queries = new ObserveQueryService(jdbc, redis, new ObjectMapper(),
                java.time.Duration.ofSeconds(15), java.time.Duration.ofSeconds(30));
    }

    @Test
    @SuppressWarnings("unchecked")
    void appliesEveryDeviceFilterBeforeStableCursorPagination() {
        Map<String, Object> first = queries.listDevices("tenant-a", "site-a", null,
                "soil", "MQTT", "UNKNOWN", "UNKNOWN", "UNKNOWN", null, 2);
        Map<String, Object> firstPage = (Map<String, Object>) first.get("page");

        assertThat(first.get("total")).isEqualTo(3);
        assertThat(firstPage.get("hasNext")).isEqualTo(true);
        String cursor = (String) firstPage.get("nextCursor");
        Map<String, Object> second = queries.listDevices("tenant-a", "site-a", null,
                "soil", "MQTT", "UNKNOWN", "UNKNOWN", "UNKNOWN", cursor, 2);
        assertThat((List<?>) second.get("items")).hasSize(1);
        assertThat(second.get("total")).isEqualTo(3);
        assertThatThrownBy(() -> queries.listDevices("tenant-a", "site-a", null,
                "camera", "MQTT", "UNKNOWN", "UNKNOWN", "UNKNOWN", cursor, 2))
                .isInstanceOf(ObserveQueryService.InvalidQueryException.class);
    }

    @Test
    @SuppressWarnings("unchecked")
    void filtersMembersBySiteAndReturnsATraversableCursor() {
        Map<String, Object> first = queries.members("tenant-a", null, null, "ACTIVE", "site-a", null, 1);
        Map<String, Object> page = (Map<String, Object>) first.get("page");

        assertThat(first.get("total")).isEqualTo(2);
        assertThat(page.get("hasNext")).isEqualTo(true);
        Map<String, Object> second = queries.members("tenant-a", null, null, "ACTIVE", "site-a",
                (String) page.get("nextCursor"), 1);
        assertThat((List<?>) second.get("items")).hasSize(1);
    }

    @Test
    @SuppressWarnings("unchecked")
    void bucketsDeviceAndSiteSeriesUsingTheRequestedBucket() {
        Instant bucket = Instant.ofEpochSecond(Math.floorDiv(Instant.now().minusSeconds(60).getEpochSecond(), 300) * 300 + 10);
        insertHistory("event-1", "device-1", 1, bucket, 10.0);
        insertHistory("event-2", "device-1", 2, bucket.plusSeconds(1), 20.0);
        insertHistory("event-3", "device-2", 1, bucket.plusSeconds(2), 30.0);

        Map<String, Object> device = queries.series("tenant-a", "site-a", "device-1",
                "PT1H", "PT5M", List.of("soil.moisture.pct"));
        Map<String, Object> deviceSeries = (Map<String, Object>) ((List<?>) device.get("series")).getFirst();
        Map<String, Object> devicePoint = (Map<String, Object>) ((List<?>) deviceSeries.get("points")).getFirst();
        assertThat(deviceSeries.get("aggregation")).isEqualTo("AVG");
        assertThat((Double) devicePoint.get("value")).isEqualTo(15.0);

        Map<String, Object> site = queries.series("tenant-a", "site-a", null,
                "PT1H", "PT5M", List.of("soil.moisture.pct"));
        Map<String, Object> siteSeries = (Map<String, Object>) ((List<?>) site.get("series")).getFirst();
        Map<String, Object> sitePoint = (Map<String, Object>) ((List<?>) siteSeries.get("points")).getFirst();
        assertThat((Double) sitePoint.get("value")).isEqualTo(20.0);
        assertThatThrownBy(() -> queries.series("tenant-a", "site-a", null,
                "PT2H", "PT5M", null)).isInstanceOf(ObserveQueryService.InvalidQueryException.class);
    }

    @Test
    void marksEvenARecentPostgresFallbackAsStale() {
        Instant now = Instant.now();
        String metrics = "[{\"code\":\"soil.moisture.pct\",\"displayName\":\"Soil moisture\"," +
                "\"value\":25.0,\"unit\":\"%\",\"quality\":\"GOOD\",\"observedAt\":\"" + now + "\"}]";
        jdbc.sql("""
                INSERT INTO b02_device_snapshot VALUES('tenant-a','site-a','device-1','fallback-event',
                  'fallback-session',:time,1,:time,:time,'sha256:fallback',:metrics,'snapshot',1)
                """).param("time", dbTime(now)).param("metrics", metrics).update();

        ObserveQueryService.StateView state = queries.state("tenant-a", "device-1").orElseThrow();

        assertThat(state.source()).isEqualTo("POSTGRES_SNAPSHOT");
        assertThat(state.freshness()).isEqualTo("STALE");
    }

    private void insertHistory(String eventId, String deviceId, long sequence, Instant observedAt, double value) {
        String metrics = "[{\"code\":\"soil.moisture.pct\",\"displayName\":\"Soil moisture\"," +
                "\"value\":" + value + ",\"unit\":\"%\",\"quality\":\"GOOD\"," +
                "\"observedAt\":\"" + observedAt + "\"}]";
        jdbc.sql("""
                INSERT INTO b02_telemetry_history VALUES(
                  'tenant-a', :eventId, 'site-a', :deviceId, 'session', :sessionStartedAt,
                  :sequence, :observedAt, :receivedAt, 'sha256:test', :metrics, 0, :sequence)
                """).param("eventId", eventId).param("deviceId", deviceId)
                .param("sessionStartedAt", dbTime(observedAt.minusSeconds(10))).param("sequence", sequence)
                .param("observedAt", dbTime(observedAt)).param("receivedAt", dbTime(observedAt.plusSeconds(1)))
                .param("metrics", metrics).update();
    }

    private void createSchemaAndSeed() {
        jdbc.sql("CREATE TABLE b02_site(tenant_id VARCHAR, site_id VARCHAR, name VARCHAR, timezone VARCHAR)").update();
        jdbc.sql("""
                CREATE TABLE b02_device(tenant_id VARCHAR, site_id VARCHAR, device_id VARCHAR, external_id VARCHAR,
                  name VARCHAR, type_code VARCHAR, type_name VARCHAR, zone_id VARCHAR, zone_name VARCHAR,
                  protocol VARCHAR, created_at TIMESTAMP WITH TIME ZONE, updated_at TIMESTAMP WITH TIME ZONE,
                  version BIGINT)
                """).update();
        jdbc.sql("""
                CREATE TABLE b02_device_snapshot(tenant_id VARCHAR, site_id VARCHAR, device_id VARCHAR,
                  event_id VARCHAR, session_id VARCHAR, session_started_at TIMESTAMP WITH TIME ZONE,
                  sequence BIGINT, observed_at TIMESTAMP WITH TIME ZONE, received_at TIMESTAMP WITH TIME ZONE,
                  payload_digest VARCHAR, metrics_json CLOB, state_epoch VARCHAR, revision BIGINT)
                """).update();
        jdbc.sql("""
                CREATE TABLE b02_telemetry_history(tenant_id VARCHAR, event_id VARCHAR, site_id VARCHAR,
                  device_id VARCHAR, session_id VARCHAR, session_started_at TIMESTAMP WITH TIME ZONE,
                  sequence BIGINT, observed_at TIMESTAMP WITH TIME ZONE, received_at TIMESTAMP WITH TIME ZONE,
                  payload_digest VARCHAR, metrics_json CLOB, kafka_partition INTEGER, kafka_offset BIGINT)
                """).update();
        jdbc.sql("CREATE TABLE b02_principal(issuer VARCHAR, subject VARCHAR, display_name VARCHAR, email VARCHAR)").update();
        jdbc.sql("""
                CREATE TABLE b02_membership(issuer VARCHAR, subject VARCHAR, tenant_id VARCHAR,
                  role_code VARCHAR, all_sites BOOLEAN, status VARCHAR)
                """).update();
        jdbc.sql("""
                CREATE TABLE b02_membership_site(issuer VARCHAR, subject VARCHAR, tenant_id VARCHAR, site_id VARCHAR)
                """).update();
        jdbc.sql("INSERT INTO b02_site VALUES('tenant-a','site-a','Site A','UTC')").update();
        for (int index = 1; index <= 3; index++) {
            jdbc.sql("""
                    INSERT INTO b02_device VALUES('tenant-a','site-a',:id,:externalId,:name,'SOIL_SENSOR',
                      'Soil sensor','zone-a','Zone A','MQTT',:created,:created,1)
                    """).param("id", "device-" + index).param("externalId", "EXT-" + index)
                    .param("name", "Sensor " + index).param("created", dbTime(Instant.parse("2026-09-07T00:00:00Z")))
                    .update();
        }
        jdbc.sql("INSERT INTO b02_principal VALUES('issuer','a','Admin','a@example.invalid'),('issuer','b','Viewer','b@example.invalid')").update();
        jdbc.sql("INSERT INTO b02_membership VALUES('issuer','a','tenant-a','TENANT_ADMIN',TRUE,'ACTIVE'),('issuer','b','tenant-a','TENANT_VIEWER',FALSE,'ACTIVE')").update();
        jdbc.sql("INSERT INTO b02_membership_site VALUES('issuer','b','tenant-a','site-a')").update();
    }

    private static OffsetDateTime dbTime(Instant value) {
        return OffsetDateTime.ofInstant(value, ZoneOffset.UTC);
    }
}
