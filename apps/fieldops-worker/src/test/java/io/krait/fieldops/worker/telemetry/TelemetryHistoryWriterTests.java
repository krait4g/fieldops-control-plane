package io.krait.fieldops.worker.telemetry;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.sql.DataSource;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DelegatingDataSource;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.kafka.support.Acknowledgment;
import tools.jackson.databind.ObjectMapper;

class TelemetryHistoryWriterTests {
    private CommitAwareDataSource dataSource;
    private JdbcClient jdbc;
    private TelemetryHistoryWriter writer;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource delegate = new DriverManagerDataSource(
                "jdbc:h2:mem:history-" + System.nanoTime() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        dataSource = new CommitAwareDataSource(delegate);
        jdbc = JdbcClient.create(dataSource);
        createSchema();
        TopicEpochProvider epochs = mock(TopicEpochProvider.class);
        when(epochs.epoch("normalized", 0)).thenReturn("normalized:test-topic:0");
        writer = new TelemetryHistoryWriter(new ObjectMapper(), jdbc, epochs,
                new SimpleMeterRegistry(), new DataSourceTransactionManager(dataSource));
    }

    @Test
    void doesNotAcknowledgeWhenTheJdbcCommitFails() {
        Acknowledgment acknowledgment = mock(Acknowledgment.class);
        dataSource.failNextCommit.set(true);

        assertThatThrownBy(() -> writer.store(record(), acknowledgment)).isInstanceOf(RuntimeException.class);

        verify(acknowledgment, never()).acknowledge();
        assertThat(historyCount()).isZero();
    }

    @Test
    void acknowledgesAfterCommitAndRedeliveryConvergesWhenTheFirstAckFails() throws Exception {
        Acknowledgment orderedAck = mock(Acknowledgment.class);
        doAnswer(invocation -> {
            assertThat(dataSource.committed.get()).isTrue();
            throw new IllegalStateException("synthetic Kafka commit failure");
        }).when(orderedAck).acknowledge();

        assertThatThrownBy(() -> writer.store(record(), orderedAck))
                .isInstanceOf(IllegalStateException.class);
        assertThat(historyCount()).isOne();

        reset(orderedAck);
        writer.store(record(), orderedAck);
        verify(orderedAck).acknowledge();
        assertThat(historyCount()).isOne();
    }

    private ConsumerRecord<String, String> record() {
        return recordWithOffset(10);
    }

    private ConsumerRecord<String, String> recordWithOffset(long offset) {
        String json = """
                {"eventId":"event-r02","schemaVersion":"2.0.0","tenantId":"tenant-a",
                 "siteId":"site-a","deviceId":"device-a-soil-01","sessionId":"session-r02",
                 "sessionStartedAt":"2026-09-08T00:00:00Z","sequence":1,
                 "observedAt":"2026-09-08T00:00:01Z","receivedAt":"2026-09-08T00:00:02Z",
                 "metrics":[{"code":"soil.moisture.pct","displayName":"Soil moisture",
                   "value":42.5,"unit":"%","quality":"GOOD","observedAt":"2026-09-08T00:00:01Z"}],
                 "payloadDigest":"sha256:r02","traceId":"trace-r02","correlationId":"event-r02"}
                """;
        return new ConsumerRecord<>("normalized", 0, offset, "tenant-a:device-a-soil-01", json);
    }

    private long historyCount() {
        return jdbc.sql("SELECT COUNT(*) FROM b02_telemetry_history").query(Long.class).single();
    }

    private void createSchema() {
        jdbc.sql("""
                CREATE TABLE b02_telemetry_history(
                  tenant_id VARCHAR(64), event_id VARCHAR(128), site_id VARCHAR(64), device_id VARCHAR(64),
                  session_id VARCHAR(128), session_started_at TIMESTAMP WITH TIME ZONE, sequence BIGINT,
                  observed_at TIMESTAMP WITH TIME ZONE, received_at TIMESTAMP WITH TIME ZONE,
                  payload_digest VARCHAR(80), metrics_json CLOB, kafka_partition INTEGER, kafka_offset BIGINT,
                  PRIMARY KEY(tenant_id, event_id), UNIQUE(tenant_id, device_id, session_id, sequence))
                """).update();
        jdbc.sql("""
                CREATE TABLE b02_device_snapshot(
                  tenant_id VARCHAR(64), site_id VARCHAR(64), device_id VARCHAR(64), event_id VARCHAR(128),
                  session_id VARCHAR(128), session_started_at TIMESTAMP WITH TIME ZONE, sequence BIGINT,
                  observed_at TIMESTAMP WITH TIME ZONE, received_at TIMESTAMP WITH TIME ZONE,
                  payload_digest VARCHAR(80), metrics_json CLOB, state_epoch VARCHAR(255), revision BIGINT,
                  PRIMARY KEY(tenant_id, device_id))
                """).update();
        jdbc.sql("""
                INSERT INTO b02_device_snapshot(
                  tenant_id, site_id, device_id, event_id, session_id, session_started_at,
                  sequence, observed_at, received_at, payload_digest, metrics_json, state_epoch, revision)
                VALUES ('tenant-a', 'site-a', 'device-a-soil-01', 'seed-r02', 'seed-session',
                  TIMESTAMP WITH TIME ZONE '2026-09-07 00:00:00+00', 1,
                  TIMESTAMP WITH TIME ZONE '2026-09-07 00:00:01+00',
                  TIMESTAMP WITH TIME ZONE '2026-09-07 00:00:02+00',
                  'sha256:seed-r02', '[]', 'seed', 1)
                """).update();
        jdbc.sql("""
                CREATE TABLE b02_telemetry_rejection(
                  rejection_id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, stage VARCHAR(32),
                  reason_code VARCHAR(64), event_id VARCHAR(128), tenant_id VARCHAR(64),
                  device_id VARCHAR(64), rejected_at TIMESTAMP WITH TIME ZONE)
                """).update();
    }

    private static final class CommitAwareDataSource extends DelegatingDataSource {
        private final AtomicBoolean failNextCommit = new AtomicBoolean();
        private final AtomicBoolean committed = new AtomicBoolean();

        CommitAwareDataSource(DataSource target) {
            super(target);
        }

        @Override
        public Connection getConnection() throws SQLException {
            return wrap(super.getConnection());
        }

        @Override
        public Connection getConnection(String username, String password) throws SQLException {
            return wrap(super.getConnection(username, password));
        }

        private Connection wrap(Connection delegate) {
            return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(),
                    new Class<?>[] {Connection.class}, (proxy, method, args) -> {
                        if ("commit".equals(method.getName())) {
                            if (failNextCommit.compareAndSet(true, false)) {
                                delegate.rollback();
                                throw new SQLException("synthetic commit failure");
                            }
                            Object result = method.invoke(delegate, args);
                            committed.set(true);
                            return result;
                        }
                        try {
                            return method.invoke(delegate, args);
                        } catch (java.lang.reflect.InvocationTargetException error) {
                            throw error.getCause();
                        }
                    });
        }
    }
}
