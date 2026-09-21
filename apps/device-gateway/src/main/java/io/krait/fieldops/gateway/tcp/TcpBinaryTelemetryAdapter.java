package io.krait.fieldops.gateway.tcp;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.SmartLifecycle;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("b07-tcp-binary")
public class TcpBinaryTelemetryAdapter implements SmartLifecycle {
    private static final Logger LOGGER = LoggerFactory.getLogger(TcpBinaryTelemetryAdapter.class);
    private static final long[] BACKOFF = {250, 500, 1000, 2000};
    private final TcpRawTelemetryPublisher publisher;
    private final String host;
    private final int port;
    private final int maxPayload;
    private final long heartbeatTimeoutMillis;
    private final Counter telemetryAccepted;
    private final Counter heartbeats;
    private final Counter ackSent;
    private final Counter reconnects;
    private final MeterRegistry meters;
    private final AtomicBoolean running = new AtomicBoolean();
    private final AtomicInteger connected = new AtomicInteger();
    private volatile Thread reader;
    private volatile Socket socket;

    public TcpBinaryTelemetryAdapter(TcpRawTelemetryPublisher publisher, MeterRegistry meters,
            @Value("${fieldops.b07.host:127.0.0.1}") String host,
            @Value("${fieldops.b07.port:28087}") int port,
            @Value("${fieldops.b07.max-payload-bytes:64}") int maxPayload,
            @Value("${fieldops.b07.heartbeat-timeout:3s}") Duration heartbeatTimeout) {
        if (!"127.0.0.1".equals(host) && !"localhost".equals(host)) {
            throw new IllegalArgumentException("B07 TCP endpoint must be localhost-only");
        }
        this.publisher = publisher; this.meters = meters; this.host = host; this.port = port;
        this.maxPayload = maxPayload; this.heartbeatTimeoutMillis = heartbeatTimeout.toMillis();
        telemetryAccepted = meters.counter("fieldops.gateway.tcp.frames", "type", "telemetry", "result", "accepted");
        heartbeats = meters.counter("fieldops.gateway.tcp.frames", "type", "heartbeat", "result", "accepted");
        ackSent = meters.counter("fieldops.gateway.tcp.ack", "result", "sent");
        reconnects = meters.counter("fieldops.gateway.tcp.reconnect", "result", "attempt");
        Gauge.builder("fieldops.gateway.tcp.connection", connected, AtomicInteger::get).register(meters);
    }

    @Override public void start() {
        if (!running.compareAndSet(false, true)) return;
        reader = new Thread(this::runLoop, "b07-tcp-adapter");
        reader.setDaemon(true);
        reader.start();
    }

    private void runLoop() {
        int backoff = 0;
        while (running.get()) {
            BinaryFrameDecoder decoder = new BinaryFrameDecoder(maxPayload);
            boolean validFrame = false;
            try (Socket current = new Socket()) {
                socket = current;
                current.connect(new InetSocketAddress(host, port), 2000);
                current.setSoTimeout(250);
                connected.set(1);
                long lastValid = System.nanoTime();
                byte[] chunk = new byte[256];
                while (running.get()) {
                    try {
                        int count = current.getInputStream().read(chunk);
                        if (count < 0) throw new IOException("device closed connection");
                        List<BinaryFrame> frames = decoder.feed(java.util.Arrays.copyOf(chunk, count));
                        for (BinaryFrame frame : frames) {
                            processFrame(frame, current.getOutputStream());
                            lastValid = System.nanoTime();
                            validFrame = true;
                            backoff = 0;
                        }
                    } catch (SocketTimeoutException timeout) {
                        if ((System.nanoTime() - lastValid) / 1_000_000L >= heartbeatTimeoutMillis) {
                            throw new IOException("valid-frame heartbeat timeout");
                        }
                    }
                }
            } catch (BinaryProtocolException error) {
                meters.counter("fieldops.gateway.tcp.protocol.error", "reason", error.reason()).increment();
                LOGGER.warn("B07 TCP protocol connection rejected: {}", error.reason());
            } catch (Exception error) {
                if (running.get()) LOGGER.warn("B07 TCP connection ended: {}", bounded(error.getMessage()));
            } finally {
                connected.set(0); socket = null; decoder.reset();
            }
            if (!running.get()) break;
            reconnects.increment();
            try { Thread.sleep(BACKOFF[Math.min(backoff, BACKOFF.length - 1)]); }
            catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); break; }
            if (!validFrame) backoff = Math.min(backoff + 1, BACKOFF.length - 1);
        }
    }

    void processFrame(BinaryFrame frame, OutputStream output) throws Exception {
        if (frame.type() == BinaryFrame.HEARTBEAT) {
            publisher.validateRegistration();
            heartbeats.increment();
            return;
        }
        publisher.publish(frame); // broker ACK must complete before the device ACK is created or written
        output.write(BinaryAckEncoder.encode(frame, System.currentTimeMillis()));
        output.flush();
        telemetryAccepted.increment(); ackSent.increment();
    }

    @Override public void stop() {
        running.set(false);
        Socket current = socket;
        if (current != null) try { current.close(); } catch (IOException ignored) {}
        Thread owned = reader;
        if (owned != null) {
            owned.interrupt();
            try { owned.join(5000); } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
            if (owned.isAlive()) throw new IllegalStateException("B07 TCP reader did not stop within bound");
        }
    }

    @Override public boolean isRunning() { return running.get(); }
    @Override public int getPhase() { return 100; }

    private static String bounded(String message) {
        if (message == null) return "unspecified";
        return message.substring(0, Math.min(message.length(), 160));
    }
}
