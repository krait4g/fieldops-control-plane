package io.krait.fieldops.worker.telemetry;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("local-observe")
public class TopicEpochProvider implements AutoCloseable {
    private final AdminClient admin;
    private final Map<String, String> topicIds = new ConcurrentHashMap<>();

    public TopicEpochProvider(@Value("${spring.kafka.bootstrap-servers}") String bootstrapServers) {
        this.admin = AdminClient.create(Map.of(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers));
    }

    public String epoch(String topic, int partition) {
        String topicId = topicIds.computeIfAbsent(topic, this::loadTopicId);
        return topic + ":" + topicId + ":" + partition;
    }

    private String loadTopicId(String topic) {
        try {
            return admin.describeTopics(List.of(topic)).allTopicNames()
                    .get(Duration.ofSeconds(10).toMillis(), java.util.concurrent.TimeUnit.MILLISECONDS)
                    .get(topic).topicId().toString();
        } catch (Exception error) {
            throw new IllegalStateException("Unable to resolve Kafka topic generation: " + topic, error);
        }
    }

    @Override
    public void close() {
        admin.close(Duration.ofSeconds(5));
    }
}
