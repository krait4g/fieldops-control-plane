package io.krait.fieldops.server.camera;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

import jakarta.annotation.PreDestroy;

import io.krait.fieldops.camera.control.LatestWinsBuffer;
import io.krait.fieldops.camera.control.PtzCommand;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.ObjectMapper;

@Component
@Profile("b04-camera")
public class CameraWebSocketHandler extends TextWebSocketHandler {
    private static final long MAX_SAFE_INTEGER = 9_007_199_254_740_991L;
    private final ObjectMapper mapper;
    private final RedisCameraLeaseService leases;
    private final CameraGatewayClient gateway;
    private final long dispatchMillis;
    private final long deadManNanos;
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2,
            Thread.ofPlatform().name("b04-ptz-", 0).factory());
    private final Map<String, ClientState> clients = new ConcurrentHashMap<>();

    public CameraWebSocketHandler(ObjectMapper mapper, RedisCameraLeaseService leases,
            CameraGatewayClient gateway,
            @Value("${fieldops.b04.ptz.dispatch-interval:75ms}") Duration dispatchInterval,
            @Value("${fieldops.b04.ptz.dead-man:400ms}") Duration deadMan) {
        this.mapper = mapper;
        this.leases = leases;
        this.gateway = gateway;
        this.dispatchMillis = dispatchInterval.toMillis();
        this.deadManNanos = deadMan.toNanos();
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        ClientState state = new ClientState(session, text(session, "cameraId"), text(session, "ownerId"),
                text(session, "sessionId"), number(session, "generation"));
        clients.put(session.getId(), state);
        state.task = scheduler.scheduleAtFixedRate(() -> tick(state),
                dispatchMillis, dispatchMillis, TimeUnit.MILLISECONDS);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        ClientState state = clients.get(session.getId());
        if (state == null) return;
        try {
            ClientMessage incoming = mapper.readValue(message.getPayload(), ClientMessage.class);
            validateEnvelope(state, incoming);
            if (incoming.seq() <= state.lastSequence) {
                send(state, new ErrorMessage("ERROR", incoming.seq(), "NON_MONOTONIC_SEQUENCE",
                        "Sequence must increase on this WebSocket."));
                return;
            }
            state.lastSequence = incoming.seq();
            switch (incoming.type()) {
                case "HEARTBEAT" -> heartbeat(state, incoming.seq());
                case "MOVE" -> move(state, incoming);
                case "STOP" -> stopNow(state, incoming.seq(), incoming.reason() == null
                        ? "USER_REQUEST" : incoming.reason());
                default -> send(state, new ErrorMessage("ERROR", incoming.seq(), "INVALID_MESSAGE",
                        "Unsupported PTZ message type."));
            }
        } catch (Exception error) {
            send(state, new ErrorMessage("ERROR", null, "INVALID_MESSAGE", "Malformed PTZ message."));
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        ClientState state = clients.remove(session.getId());
        if (state == null) return;
        if (state.task != null) state.task.cancel(false);
        priorityStop(state, Math.max(1, state.lastSequence), "SOCKET_CLOSED", false);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        session.close(CloseStatus.SERVER_ERROR);
    }

    private void validateEnvelope(ClientState state, ClientMessage message) {
        if (message.sessionId() == null || !message.sessionId().equals(state.sessionId)
                || message.generation() != state.generation || message.seq() < 1
                || message.seq() > MAX_SAFE_INTEGER) {
            throw new IllegalArgumentException("PTZ envelope does not match the lease");
        }
    }

    private void heartbeat(ClientState state, long sequence) {
        try {
            leases.renew(state.cameraId, state.ownerId, state.sessionId, state.generation);
            send(state, new AckMessage("ACK", sequence, state.generation, Instant.now()));
        } catch (ControlLeaseException error) {
            controlLost(state, "LEASE_EXPIRED");
        }
    }

    private void move(ClientState state, ClientMessage message) {
        PtzCommand command = PtzCommand.move(state.ownerId, state.sessionId, state.generation,
                message.seq(), value(message.pan()), value(message.tilt()), value(message.zoom()),
                message.timeoutMs() == null ? 500 : message.timeoutMs());
        state.buffer.offer(command);
        state.lastMoveNanos = System.nanoTime();
        state.deadManSent = false;
    }

    private void stopNow(ClientState state, long sequence, String reason) {
        priorityStop(state, sequence, reason, true);
    }

    private void tick(ClientState state) {
        if (!state.session.isOpen()) return;
        if (state.lastMoveNanos > 0 && !state.deadManSent
                && System.nanoTime() - state.lastMoveNanos >= deadManNanos) {
            state.deadManSent = true;
            priorityStop(state, Math.max(1, state.lastSequence), "DEAD_MAN", true);
            return;
        }
        PtzCommand command = state.buffer.poll();
        if (command != null) dispatch(state, command, true);
    }

    private void priorityStop(ClientState state, long sequence, String reason, boolean respond) {
        state.buffer.clearMoves();
        dispatch(state, PtzCommand.stop(state.ownerId, state.sessionId, state.generation,
                sequence, reason), respond);
    }

    private void dispatch(ClientState state, PtzCommand command, boolean respond) {
        if (!state.dispatchLock.tryLock()) {
            if (command.type() == PtzCommand.Type.STOP) state.buffer.offer(command);
            else state.buffer.offer(command);
            return;
        }
        try {
            CameraGatewayClient.GatewayCommandResult result = gateway.send(state.cameraId, command);
            if (!result.accepted()) {
                if (respond) controlLost(state, "LEASE_REPLACED");
                return;
            }
            if (respond) {
                send(state, new AckMessage("ACK", command.sequence(), state.generation, result.acceptedAt()));
                if (result.pose() != null) {
                    send(state, new PoseMessage("POSE", state.generation, result.pose().pan(),
                            result.pose().tilt(), result.pose().zoom(), result.pose().moving(), Instant.now()));
                }
            }
        } catch (RuntimeException error) {
            if (respond) send(state, new ErrorMessage("ERROR", command.sequence(), "DEVICE_UNAVAILABLE",
                    "Synthetic camera is unavailable."));
        } finally {
            state.dispatchLock.unlock();
        }
    }

    private void controlLost(ClientState state, String reason) {
        send(state, new ControlLostMessage("CONTROL_LOST", state.generation, reason));
        try {
            state.session.close(CloseStatus.POLICY_VIOLATION);
        } catch (IOException ignored) {
            // Connection is already gone; the finite ONVIF timeout remains the final safety net.
        }
    }

    private void send(ClientState state, Object payload) {
        if (!state.session.isOpen()) return;
        synchronized (state.session) {
            try {
                state.session.sendMessage(new TextMessage(mapper.writeValueAsString(payload)));
            } catch (IOException error) {
                try {
                    state.session.close(CloseStatus.SERVER_ERROR);
                } catch (IOException ignored) {
                    // Nothing else can be delivered to this socket.
                }
            }
        }
    }

    @PreDestroy
    void close() {
        scheduler.shutdownNow();
    }

    private static String text(WebSocketSession session, String key) {
        return String.valueOf(session.getAttributes().get(key));
    }

    private static long number(WebSocketSession session, String key) {
        return ((Number) session.getAttributes().get(key)).longValue();
    }

    private static double value(Double value) {
        return value == null ? 0 : value;
    }

    public record ClientMessage(String type, String sessionId, long generation, long seq,
            Double pan, Double tilt, Double zoom, Integer timeoutMs, String reason) {}
    public record AckMessage(String type, long seq, long generation, Instant acceptedAt) {}
    public record PoseMessage(String type, long generation, double pan, double tilt,
            double zoom, boolean moving, Instant observedAt) {}
    public record ControlLostMessage(String type, long generation, String reason) {}
    public record ErrorMessage(String type, Long seq, String code, String detail) {}

    private static final class ClientState {
        private final WebSocketSession session;
        private final String cameraId;
        private final String ownerId;
        private final String sessionId;
        private final long generation;
        private final LatestWinsBuffer buffer = new LatestWinsBuffer();
        private final ReentrantLock dispatchLock = new ReentrantLock();
        private volatile long lastSequence;
        private volatile long lastMoveNanos;
        private volatile boolean deadManSent;
        private ScheduledFuture<?> task;

        private ClientState(WebSocketSession session, String cameraId, String ownerId,
                String sessionId, long generation) {
            this.session = session;
            this.cameraId = cameraId;
            this.ownerId = ownerId;
            this.sessionId = sessionId;
            this.generation = generation;
        }
    }
}
