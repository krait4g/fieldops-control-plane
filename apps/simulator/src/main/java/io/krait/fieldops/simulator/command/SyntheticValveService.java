package io.krait.fieldops.simulator.command;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import io.krait.fieldops.command.domain.CommandScenario;
import io.krait.fieldops.command.domain.CommandType;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("b05-command")
public class SyntheticValveService {
    private final String deviceId;
    private final Duration successDelay;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
    private final AtomicReference<String> state = new AtomicReference<>("CLOSED");
    private final AtomicInteger actuationCount = new AtomicInteger();
    private final Map<UUID, Delivery> deliveries = new ConcurrentHashMap<>();

    public SyntheticValveService(@Value("${fieldops.b05.device-id}") String deviceId,
            @Value("${fieldops.b05.success-delay:750ms}") Duration successDelay) {
        this.deviceId = deviceId;
        this.successDelay = successDelay;
    }

    public synchronized Delivery deliver(String requestedDeviceId, UUID commandId,
            CommandType type, CommandScenario scenario) {
        requireDevice(requestedDeviceId);
        Delivery existing = deliveries.get(commandId);
        if (existing != null) return existing;
        if (scenario == CommandScenario.REJECT) {
            Delivery rejected = new Delivery(commandId, "REJECTED", state.get(), actuationCount.get(), Instant.now());
            deliveries.put(commandId, rejected);
            return rejected;
        }
        int count = actuationCount.incrementAndGet();
        Delivery acknowledged = new Delivery(commandId,
                scenario == CommandScenario.HANG ? "HANGING" : "ACKNOWLEDGED",
                state.get(), count, Instant.now());
        deliveries.put(commandId, acknowledged);
        if (scenario == CommandScenario.SUCCESS) {
            scheduler.schedule(() -> {
                state.set(type.name().equals("OPEN") ? "OPEN" : "CLOSED");
                deliveries.computeIfPresent(commandId, (ignored, prior) ->
                        new Delivery(commandId, "SUCCEEDED", state.get(), prior.actuationCount(), Instant.now()));
            }, successDelay.toMillis(), TimeUnit.MILLISECONDS);
        }
        return acknowledged;
    }

    public Delivery status(String requestedDeviceId, UUID commandId) {
        requireDevice(requestedDeviceId);
        Delivery delivery = deliveries.get(commandId);
        if (delivery == null) throw new ValveDeliveryNotFoundException();
        return delivery;
    }

    public ValveState valveState(String requestedDeviceId) {
        requireDevice(requestedDeviceId);
        return new ValveState(deviceId, state.get(), actuationCount.get(), Instant.now());
    }

    private void requireDevice(String requestedDeviceId) {
        if (!deviceId.equals(requestedDeviceId)) throw new ValveDeliveryNotFoundException();
    }

    @PreDestroy
    void close() {
        scheduler.shutdownNow();
    }

    public record Delivery(UUID commandId, String status, String observedState,
            int actuationCount, Instant observedAt) {}
    public record ValveState(String deviceId, String state, int actuationCount, Instant observedAt) {}

    static final class ValveDeliveryNotFoundException extends RuntimeException {
        private static final long serialVersionUID = 1L;
    }
}
