package io.krait.fieldops.simulator.telemetry;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.locks.LockSupport;

import io.krait.fieldops.telemetry.domain.DeviceSample;
import io.krait.fieldops.telemetry.domain.RawMetric;
import org.eclipse.paho.mqttv5.client.MqttClient;
import org.eclipse.paho.mqttv5.client.MqttConnectionOptions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
@Profile("local-observe")
public class SyntheticTelemetryRunner implements ApplicationRunner {
    private static final Logger LOGGER = LoggerFactory.getLogger(SyntheticTelemetryRunner.class);
    private static final List<DeviceRef> DEVICES = List.of(
            new DeviceRef("tenant-a", "site-a", "device-a-soil-01"),
            new DeviceRef("tenant-a", "site-a", "device-a-soil-02"),
            new DeviceRef("tenant-a", "site-a", "device-a-soil-03"),
            new DeviceRef("tenant-b", "site-b", "device-b-soil-01"),
            new DeviceRef("tenant-b", "site-b", "device-b-soil-02"),
            new DeviceRef("tenant-b", "site-b", "device-b-soil-03"));

    private final ObjectMapper mapper;
    private final String uri;
    private final Map<String, Credential> credentials;
    private final Clock clock = Clock.systemUTC();

    public SyntheticTelemetryRunner(ObjectMapper mapper,
            @Value("${fieldops.b02.mqtt.uri}") String uri,
            @Value("${fieldops.b02.mqtt.tenant-a-username}") String tenantAUsername,
            @Value("${fieldops.b02.mqtt.tenant-a-password}") String tenantAPassword,
            @Value("${fieldops.b02.mqtt.tenant-b-username}") String tenantBUsername,
            @Value("${fieldops.b02.mqtt.tenant-b-password}") String tenantBPassword) {
        this.mapper = mapper;
        this.uri = uri;
        this.credentials = Map.of(
                "tenant-a", new Credential(tenantAUsername, tenantAPassword),
                "tenant-b", new Credential(tenantBUsername, tenantBPassword));
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        Options options = Options.parse(args.getSourceArgs());
        List<DeviceRef> selected = options.device().equals("all")
                ? DEVICES
                : DEVICES.stream().filter(device -> device.deviceId().equals(options.device())).toList();
        if (selected.isEmpty()) throw new IllegalArgumentException("Unknown B02 device: " + options.device());

        Instant sessionStartedAt = clock.instant();
        String sessionId = sessionStartedAt.toEpochMilli() + "-" + UUID.randomUUID();
        Map<DeviceRef, MqttClient> clients = new LinkedHashMap<>();
        try {
            for (DeviceRef device : selected) clients.put(device, connect(device));
            if (options.scenario().equals("load")) {
                publishControlledLoad(clients, selected, sessionId, sessionStartedAt, options);
                return;
            }
            for (DeviceRef device : selected) {
                publishDevice(clients.get(device), device, sessionId, sessionStartedAt, options);
            }
        } finally {
            for (MqttClient client : clients.values()) close(client);
        }
    }

    private void publishControlledLoad(Map<DeviceRef, MqttClient> clients, List<DeviceRef> devices,
            String sessionId, Instant sessionStartedAt, Options options) throws Exception {
        int measuredEvents = Math.multiplyExact(options.rate(), options.durationSeconds());
        if (measuredEvents > 60_000) {
            throw new IllegalArgumentException("B06 measured load must not exceed 60000 events");
        }
        int warmupEvents = Math.multiplyExact(options.rate(), options.warmupSeconds());
        AtomicLong attempted = new AtomicLong();
        AtomicLong published = new AtomicLong();
        AtomicLong errors = new AtomicLong();
        AtomicLong payloadBytes = new AtomicLong();
        AtomicLong measurementStart = new AtomicLong();
        AtomicLong measurementEnd = new AtomicLong();
        CountDownLatch ready = new CountDownLatch(devices.size());
        CountDownLatch start = new CountDownLatch(1);
        CyclicBarrier measurementBarrier = new CyclicBarrier(devices.size(),
                () -> measurementStart.set(System.nanoTime()));
        ExecutorService executor = Executors.newFixedThreadPool(devices.size());
        List<Future<?>> tasks = new ArrayList<>();
        for (int index = 0; index < devices.size(); index++) {
            final int deviceIndex = index;
            DeviceRef device = devices.get(index);
            tasks.add(executor.submit(() -> {
                try {
                    ready.countDown();
                    start.await();
                    Random random = new Random(options.seed() + device.deviceId().hashCode());
                    long sequence = 1;
                    sequence = publishLoadPhase(clients.get(device), device, sessionId, sessionStartedAt,
                            random, sequence, share(warmupEvents, devices.size(), deviceIndex),
                            options.warmupSeconds(), false, attempted, published, errors, payloadBytes);
                    measurementBarrier.await();
                    publishLoadPhase(clients.get(device), device, sessionId, sessionStartedAt,
                            random, sequence, share(measuredEvents, devices.size(), deviceIndex),
                            options.durationSeconds(), true, attempted, published, errors, payloadBytes);
                    measurementEnd.accumulateAndGet(System.nanoTime(), Math::max);
                } catch (Exception error) {
                    throw new IllegalStateException(error);
                }
            }));
        }
        ready.await(15, TimeUnit.SECONDS);
        start.countDown();
        try {
            for (Future<?> task : tasks) task.get(options.warmupSeconds() + options.durationSeconds() + 30L,
                    TimeUnit.SECONDS);
        } finally {
            executor.shutdownNow();
        }
        long elapsedNanos = Math.max(1, measurementEnd.get() - measurementStart.get());
        double achieved = published.get() * 1_000_000_000.0 / elapsedNanos;
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("scenario", "load");
        summary.put("sessionId", sessionId);
        summary.put("offeredEventsPerSecond", options.rate());
        summary.put("attempted", attempted.get());
        summary.put("published", published.get());
        summary.put("publishErrors", errors.get());
        summary.put("elapsedMs", TimeUnit.NANOSECONDS.toMillis(elapsedNanos));
        summary.put("achievedEventsPerSecond", Math.round(achieved * 100.0) / 100.0);
        summary.put("payloadBytes", payloadBytes.get());
        summary.put("devices", devices.size());
        System.out.println("B06_LOAD_SUMMARY=" + mapper.writeValueAsString(summary));
    }

    private long publishLoadPhase(MqttClient client, DeviceRef device, String sessionId,
            Instant sessionStartedAt, Random random, long firstSequence, int count, int durationSeconds,
            boolean measured, AtomicLong attempted, AtomicLong published, AtomicLong errors,
            AtomicLong payloadBytes) throws Exception {
        if (count == 0) return firstSequence;
        long started = System.nanoTime();
        long durationNanos = TimeUnit.SECONDS.toNanos(durationSeconds);
        for (int index = 0; index < count; index++) {
            long target = started + (durationNanos * index / count);
            long remaining;
            while ((remaining = target - System.nanoTime()) > 0) LockSupport.parkNanos(remaining);
            long sequence = firstSequence + index;
            Instant observedAt = clock.instant();
            DeviceSample sample = new DeviceSample(
                    sessionId + ":" + device.deviceId() + ":" + sequence,
                    "2.0.0", device.tenantId(), device.siteId(), device.deviceId(), sessionId,
                    sessionStartedAt, sequence, observedAt,
                    List.of(
                            new RawMetric("soil.moisture.pct", 30 + random.nextDouble() * 20, "%"),
                            new RawMetric("soil.temperature.c", 18 + random.nextDouble() * 8, "Cel")));
            byte[] payload = mapper.writeValueAsBytes(sample);
            if (measured) attempted.incrementAndGet();
            try {
                publishConfirmed(client, device, payload);
                if (measured) {
                    published.incrementAndGet();
                    payloadBytes.addAndGet(payload.length);
                }
            } catch (Exception error) {
                if (measured) errors.incrementAndGet();
                else throw error;
            }
        }
        long phaseEnd = started + durationNanos;
        long remaining;
        while ((remaining = phaseEnd - System.nanoTime()) > 0) LockSupport.parkNanos(remaining);
        return firstSequence + count;
    }

    static int share(int total, int devices, int index) {
        return total / devices + (index < total % devices ? 1 : 0);
    }

    private void publishDevice(MqttClient client, DeviceRef device, String sessionId,
            Instant sessionStartedAt, Options options) throws Exception {
        if (options.scenario().equals("portfolio")) {
            publishPortfolioDevice(client, device, sessionId, sessionStartedAt, options);
            return;
        }
        Random random = new Random(options.seed() + device.deviceId().hashCode());
        List<Long> sequenceOrder = new ArrayList<>();
        for (long sequence = 1; sequence <= options.count(); sequence++) sequenceOrder.add(sequence);
        if (options.reorder() && sequenceOrder.size() >= 2) {
            long first = sequenceOrder.get(0);
            sequenceOrder.set(0, sequenceOrder.get(1));
            sequenceOrder.set(1, first);
        }
        byte[] firstPayload = null;
        for (long sequence : sequenceOrder) {
            Instant observedAt = clock.instant();
            DeviceSample sample = new DeviceSample(
                    sessionId + ":" + device.deviceId() + ":" + sequence,
                    "2.0.0", device.tenantId(), device.siteId(), device.deviceId(), sessionId,
                    sessionStartedAt, sequence, observedAt,
                    List.of(
                            new RawMetric("soil.moisture.pct", 30 + random.nextDouble() * 20, "%"),
                            new RawMetric("soil.temperature.c", 18 + random.nextDouble() * 8, "Cel")));
            byte[] payload = mapper.writeValueAsBytes(sample);
            publish(client, device, payload);
            if (firstPayload == null) firstPayload = payload;
            LOGGER.info("B02_SIMULATOR eventId={} tenant={} device={} sequence={}",
                    sample.eventId(), sample.tenantId(), sample.deviceId(), sample.sequence());
            if (options.intervalMillis() > 0) Thread.sleep(options.intervalMillis());
        }
        if (options.duplicate() && firstPayload != null) {
            publish(client, device, firstPayload);
            LOGGER.info("B02_SIMULATOR duplicate tenant={} device={}", device.tenantId(), device.deviceId());
        }
        if (options.pauseMillis() > 0) Thread.sleep(options.pauseMillis());
    }

    private void publishPortfolioDevice(MqttClient client, DeviceRef device, String sessionId,
            Instant sessionStartedAt, Options options) throws Exception {
        List<PortfolioScenario.Point> points = new ArrayList<>(
                PortfolioScenario.pointsFor(device.deviceId(), sessionStartedAt));
        if (options.reorder() && points.size() >= 2) {
            PortfolioScenario.Point first = points.get(0);
            points.set(0, points.get(1));
            points.set(1, first);
        }
        byte[] firstPayload = null;
        for (PortfolioScenario.Point point : points) {
            DeviceSample sample = new DeviceSample(
                    sessionId + ":" + device.deviceId() + ":" + point.sequence(),
                    "2.0.0", device.tenantId(), device.siteId(), device.deviceId(), sessionId,
                    sessionStartedAt, point.sequence(), point.observedAt(), point.metrics());
            byte[] payload = mapper.writeValueAsBytes(sample);
            publish(client, device, payload);
            if (firstPayload == null) firstPayload = payload;
            LOGGER.info("B02_SIMULATOR scenario=portfolio eventId={} tenant={} device={} sequence={}",
                    sample.eventId(), sample.tenantId(), sample.deviceId(), sample.sequence());
            if (options.intervalMillis() > 0) Thread.sleep(options.intervalMillis());
        }
        if (options.duplicate() && firstPayload != null) {
            publish(client, device, firstPayload);
            LOGGER.info("B02_SIMULATOR scenario=portfolio duplicate tenant={} device={}",
                    device.tenantId(), device.deviceId());
        }
        if (options.pauseMillis() > 0) Thread.sleep(options.pauseMillis());
    }

    private MqttClient connect(DeviceRef device) throws Exception {
        Credential credential = credentials.get(device.tenantId());
        MqttClient client = new MqttClient(uri,
                "b02-sim-" + device.deviceId() + "-" + UUID.randomUUID(), null);
        MqttConnectionOptions options = new MqttConnectionOptions();
        options.setUserName(credential.username());
        options.setPassword(credential.password().getBytes(StandardCharsets.UTF_8));
        options.setCleanStart(true);
        options.setConnectionTimeout(5);
        options.setReceiveMaximum(32);
        client.connect(options);
        return client;
    }

    private static void publish(MqttClient client, DeviceRef device, byte[] payload) throws Exception {
        String topic = "fieldops/local/%s/%s/%s/telemetry"
                .formatted(device.tenantId(), device.siteId(), device.deviceId());
        client.publish(topic, payload, 1, false);
    }

    private static void publishConfirmed(MqttClient client, DeviceRef device, byte[] payload) throws Exception {
        String topic = "fieldops/local/%s/%s/%s/telemetry"
                .formatted(device.tenantId(), device.siteId(), device.deviceId());
        // MqttClient is the synchronous Paho facade; QoS1 publish returns only
        // after its delivery token completes or raises an exception.
        client.publish(topic, payload, 1, false);
    }

    private static void close(MqttClient client) {
        try {
            if (client.isConnected()) client.disconnect();
            client.close();
        } catch (Exception error) {
            LOGGER.warn("Failed to close simulator MQTT client", error);
        }
    }

    private record DeviceRef(String tenantId, String siteId, String deviceId) {}
    private record Credential(String username, String password) {}

    record Options(String device, int count, long seed, boolean duplicate,
            boolean reorder, long pauseMillis, long intervalMillis, String scenario,
            int rate, int durationSeconds, int warmupSeconds, boolean summaryOnly) {
        static Options parse(String[] args) {
            Map<String, String> values = new LinkedHashMap<>();
            for (String arg : args) {
                if (!arg.startsWith("--")) continue;
                int separator = arg.indexOf('=');
                values.put(separator > 2 ? arg.substring(2, separator) : arg.substring(2),
                        separator > 2 ? arg.substring(separator + 1) : "true");
            }
            String scenario = values.getOrDefault("scenario", "random");
            if (!scenario.equals("random") && !scenario.equals("portfolio") && !scenario.equals("load")) {
                throw new IllegalArgumentException("Unknown simulator scenario: " + scenario);
            }
            int rate = Integer.parseInt(values.getOrDefault("rate", "50"));
            int duration = Integer.parseInt(values.getOrDefault("duration-seconds", "10"));
            int warmup = Integer.parseInt(values.getOrDefault("warmup-seconds", "0"));
            if (scenario.equals("load") && (rate <= 0 || duration <= 0 || warmup < 0)) {
                throw new IllegalArgumentException("B06 load rate/duration must be positive and warmup non-negative");
            }
            return new Options(values.getOrDefault("device", "all"),
                    Integer.parseInt(values.getOrDefault("count", "3")),
                    Long.parseLong(values.getOrDefault("seed", "42")),
                    Boolean.parseBoolean(values.getOrDefault("duplicate", "false")),
                    Boolean.parseBoolean(values.getOrDefault("reorder", "false")),
                    Long.parseLong(values.getOrDefault("pause-ms", "0")),
                    Long.parseLong(values.getOrDefault("interval-ms", "2000")),
                    scenario, rate, duration, warmup,
                    Boolean.parseBoolean(values.getOrDefault("summary-only", "true")));
        }
    }
}
