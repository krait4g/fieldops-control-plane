package io.krait.fieldops.server.realtime;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import io.krait.fieldops.server.auth.ScopeDeniedException;
import io.krait.fieldops.server.auth.ScopeService;
import io.micrometer.core.instrument.MeterRegistry;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationListener;
import org.springframework.context.annotation.Profile;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.session.SessionDestroyedEvent;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
@Profile("local-observe")
public class SseStreamService implements ApplicationListener<SessionDestroyedEvent>, AutoCloseable {
    private static final Logger LOGGER = LoggerFactory.getLogger(SseStreamService.class);
    private static final int MAX_SUBSCRIBERS = 32;
    private static final int MAX_EVENTS_PER_SUBSCRIBER = 256;
    private final ScopeService scopes;
    private final ObjectMapper mapper;
    private final Map<String, Subscriber> subscribers = new ConcurrentHashMap<>();
    private final ThreadPoolExecutor sender = new ThreadPoolExecutor(2, 4, 30, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(128), new ThreadPoolExecutor.AbortPolicy());

    public SseStreamService(ScopeService scopes, ObjectMapper mapper, MeterRegistry meters) {
        this.scopes = scopes;
        this.mapper = mapper;
        meters.gauge("fieldops.server.sse.active", subscribers, Map::size);
    }

    public SseEmitter subscribe(OidcUser user, String tenantId, String siteId, String sessionId) {
        scopes.requireSite(user, tenantId, siteId, "OVERVIEW_READ", "DEVICE_READ", "TELEMETRY_READ");
        if (subscribers.size() >= MAX_SUBSCRIBERS) {
            throw new IllegalStateException("B02 SSE subscriber limit reached");
        }
        String id = UUID.randomUUID().toString();
        SseEmitter emitter = new SseEmitter(Duration.ofMinutes(5).toMillis());
        Subscriber subscriber = new Subscriber(id, user, tenantId, siteId, sessionId, emitter);
        subscribers.put(id, subscriber);
        LOGGER.info("B02 SSE subscribed tenant={} site={} active={}", tenantId, siteId, subscribers.size());
        emitter.onCompletion(() -> remove(id));
        emitter.onTimeout(() -> remove(id));
        emitter.onError(error -> remove(id));
        try {
            emitter.send(SseEmitter.event().comment("fieldops-b02-connected").reconnectTime(3000));
        } catch (IOException error) {
            remove(id);
            throw new IllegalStateException("Unable to establish SSE stream", error);
        }
        return emitter;
    }

    @KafkaListener(topics = "${fieldops.b02.kafka.state-topic}", groupId = "fieldops-b02-server")
    public void stateEvent(ConsumerRecord<String, String> record) throws Exception {
        JsonNode event = mapper.readTree(record.value());
        String tenantId = requiredText(event, "tenantId");
        String siteId = requiredText(event, "siteId");
        String eventId = requiredText(event, "eventId");
        String eventType = requiredText(event, "eventType");
        publish(tenantId, siteId, new OutboundEvent(eventId, eventType, record.value()));
    }

    @Scheduled(fixedDelay = 15_000)
    public void heartbeat() {
        Instant now = Instant.now();
        for (Subscriber subscriber : new ArrayList<>(subscribers.values())) {
            try {
                String eventId = "heartbeat-" + now.toEpochMilli();
                String json = mapper.writeValueAsString(Map.ofEntries(
                        Map.entry("eventId", eventId),
                        Map.entry("eventType", "heartbeat"),
                        Map.entry("tenantId", subscriber.tenantId),
                        Map.entry("siteId", subscriber.siteId),
                        Map.entry("resourceType", "SITE"),
                        Map.entry("resourceId", subscriber.siteId),
                        Map.entry("version", now.toEpochMilli()),
                        Map.entry("stateEpoch", "server:heartbeat:0"),
                        Map.entry("revision", now.toEpochMilli()),
                        Map.entry("occurredAt", now.toString()),
                        Map.entry("payload", Map.of("serverTime", now.toString()))));
                enqueue(subscriber, new OutboundEvent(eventId, "heartbeat", json));
            } catch (tools.jackson.core.JacksonException error) {
                LOGGER.warn("Unable to encode SSE heartbeat", error);
            }
        }
    }

    private void publish(String tenantId, String siteId, OutboundEvent event) {
        int matched = 0;
        for (Subscriber subscriber : subscribers.values()) {
            if (subscriber.tenantId.equals(tenantId) && subscriber.siteId.equals(siteId)) {
                matched++;
                enqueue(subscriber, event);
            }
        }
        LOGGER.info("B02 SSE source event={} tenant={} site={} matched={}",
                event.id(), tenantId, siteId, matched);
    }

    private void enqueue(Subscriber subscriber, OutboundEvent event) {
        if (!subscriber.events.offer(event)) {
            fail(subscriber, new IllegalStateException("SSE queue exceeded 256 events"));
            return;
        }
        scheduleDrain(subscriber);
    }

    private void scheduleDrain(Subscriber subscriber) {
        if (subscriber.draining.compareAndSet(false, true)) {
            try {
                sender.execute(() -> drain(subscriber));
            } catch (RuntimeException rejected) {
                fail(subscriber, rejected);
            }
        }
    }

    private void drain(Subscriber subscriber) {
        try {
            OutboundEvent event;
            while ((event = subscriber.events.poll()) != null) {
                if (Duration.between(subscriber.authorizedAt, Instant.now()).compareTo(Duration.ofSeconds(30)) >= 0) {
                    scopes.requireSite(subscriber.user, subscriber.tenantId, subscriber.siteId,
                            "OVERVIEW_READ", "DEVICE_READ", "TELEMETRY_READ");
                    subscriber.authorizedAt = Instant.now();
                }
                subscriber.emitter.send(SseEmitter.event().id(event.id()).name(event.type()).data(event.json()));
            }
        } catch (IOException | ScopeDeniedException error) {
            fail(subscriber, error);
        } finally {
            subscriber.draining.set(false);
            if (!subscriber.events.isEmpty()) scheduleDrain(subscriber);
        }
    }

    private void fail(Subscriber subscriber, Throwable error) {
        LOGGER.warn("B02 SSE subscriber failed tenant={} site={} cause={}",
                subscriber.tenantId, subscriber.siteId, error.toString());
        remove(subscriber.id);
        subscriber.emitter.completeWithError(error);
    }

    private void remove(String id) {
        subscribers.remove(id);
    }

    @Override
    public void onApplicationEvent(SessionDestroyedEvent event) {
        subscribers.values().stream().filter(subscriber -> subscriber.sessionId.equals(event.getId()))
                .toList().forEach(subscriber -> fail(subscriber,
                        new ScopeDeniedException("Session ended while SSE was active")));
    }

    private static String requiredText(JsonNode node, String field) {
        String value = node.path(field).asString();
        if (value.isBlank()) throw new IllegalArgumentException("SSE source event missing " + field);
        return value;
    }

    @Override
    public void close() {
        for (Subscriber subscriber : new ArrayList<>(subscribers.values())) {
            subscriber.emitter.complete();
        }
        subscribers.clear();
        sender.shutdownNow();
    }

    private static final class Subscriber {
        private final String id;
        private final OidcUser user;
        private final String tenantId;
        private final String siteId;
        private final String sessionId;
        private final SseEmitter emitter;
        private final ArrayBlockingQueue<OutboundEvent> events = new ArrayBlockingQueue<>(MAX_EVENTS_PER_SUBSCRIBER);
        private final AtomicBoolean draining = new AtomicBoolean();
        private volatile Instant authorizedAt = Instant.now();

        private Subscriber(String id, OidcUser user, String tenantId, String siteId,
                String sessionId, SseEmitter emitter) {
            this.id = Objects.requireNonNull(id);
            this.user = Objects.requireNonNull(user);
            this.tenantId = Objects.requireNonNull(tenantId);
            this.siteId = Objects.requireNonNull(siteId);
            this.sessionId = Objects.requireNonNull(sessionId);
            this.emitter = Objects.requireNonNull(emitter);
        }
    }

    private record OutboundEvent(String id, String type, String json) {}
}
