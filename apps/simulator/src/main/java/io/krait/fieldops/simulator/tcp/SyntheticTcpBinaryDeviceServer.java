package io.krait.fieldops.simulator.tcp;

import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.SmartLifecycle;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("b07-tcp-device")
public class SyntheticTcpBinaryDeviceServer implements SmartLifecycle {
    private static final Logger LOGGER = LoggerFactory.getLogger(SyntheticTcpBinaryDeviceServer.class);
    private final int port;
    private final String scenario;
    private final BinaryFrameEncoder encoder = new BinaryFrameEncoder();
    private final AckFrameDecoder ackDecoder = new AckFrameDecoder();
    private final AtomicBoolean running = new AtomicBoolean();
    private volatile ServerSocket server;
    private volatile Socket client;
    private volatile Thread thread;
    private volatile long sessionStartedAt;
    private volatile long sequence;
    private volatile byte[] pendingRetransmit;

    public SyntheticTcpBinaryDeviceServer(@Value("${fieldops.b07.device-port:28087}") int port,
            @Value("${fieldops.b07.scenario:normal}") String scenario) {
        this.port = port; this.scenario = scenario;
    }

    @Override public void start() {
        if (!running.compareAndSet(false, true)) return;
        sessionStartedAt = System.currentTimeMillis();
        thread = new Thread(this::serve, "b07-synthetic-tcp-device");
        thread.setDaemon(false);
        thread.start();
    }

    private void serve() {
        try (ServerSocket listener = new ServerSocket(port, 1, InetAddress.getByName("127.0.0.1"))) {
            server = listener;
            listener.setReuseAddress(true);
            LOGGER.info("B07 synthetic TCP device listening on localhost:{} scenario={}", port, scenario);
            boolean firstConnection = true;
            while (running.get()) {
                try (Socket accepted = listener.accept()) {
                    client = accepted;
                    accepted.setSoTimeout(2500);
                    runConnection(accepted, firstConnection);
                    firstConnection = false;
                } catch (SocketTimeoutException ignored) {
                    // A missing ACK closes this device connection; the adapter reconnects.
                } catch (IOException error) {
                    if (running.get()) LOGGER.warn("B07 synthetic connection ended: {}", error.getMessage());
                } finally { client = null; }
            }
        } catch (IOException error) {
            if (running.get()) throw new IllegalStateException("B07 synthetic TCP server failed", error);
        } finally { server = null; }
    }

    private void runConnection(Socket socket, boolean firstConnection) throws IOException {
        if ("heartbeat-timeout".equals(scenario) && firstConnection) {
            sleep(3500); return;
        }
        if ("reboot".equals(scenario) && !firstConnection) {
            sessionStartedAt = System.currentTimeMillis(); sequence = 0;
        }
        if (pendingRetransmit != null) {
            sendAndRequireAck(socket, pendingRetransmit); pendingRetransmit = null;
        }
        if (firstConnection && runInitialScenario(socket)) return;
        while (running.get() && !socket.isClosed()) {
            byte[] telemetry = encoder.telemetry(++sequence, sessionStartedAt, System.currentTimeMillis(),
                    18.0 + (sequence % 20) / 10.0, 24.0 + (sequence % 10) / 10.0);
            sendAndRequireAck(socket, telemetry);
            if (sequence % 2 == 0) {
                socket.getOutputStream().write(encoder.heartbeat(++sequence, sessionStartedAt, System.currentTimeMillis()));
                socket.getOutputStream().flush();
            }
            sleep(500);
        }
    }

    private boolean runInitialScenario(Socket socket) throws IOException {
        byte[] one = encoder.telemetry(++sequence, sessionStartedAt, System.currentTimeMillis(), 18.7, 24.6);
        switch (scenario) {
            case "fragment-header" -> {
                socket.getOutputStream().write(one, 0, 5); socket.getOutputStream().flush(); sleep(40);
                socket.getOutputStream().write(one, 5, one.length - 5); socket.getOutputStream().flush();
                requireAck(socket, sessionStartedAt, sequence); return false;
            }
            case "fragment-payload" -> {
                socket.getOutputStream().write(one, 0, 28); socket.getOutputStream().flush(); sleep(40);
                socket.getOutputStream().write(one, 28, one.length - 28); socket.getOutputStream().flush();
                requireAck(socket, sessionStartedAt, sequence); return false;
            }
            case "coalesced" -> {
                byte[] two = encoder.telemetry(++sequence, sessionStartedAt, System.currentTimeMillis(), 19.1, 24.9);
                byte[] joined = Arrays.copyOf(one, one.length + two.length);
                System.arraycopy(two, 0, joined, one.length, two.length);
                socket.getOutputStream().write(joined); socket.getOutputStream().flush();
                requireAck(socket, sessionStartedAt, sequence - 1); requireAck(socket, sessionStartedAt, sequence);
                return false;
            }
            case "disconnect-before-ack" -> { pendingRetransmit = one; socket.getOutputStream().write(one); socket.getOutputStream().flush(); return true; }
            case "duplicate" -> { sendAndRequireAck(socket, one); sendAndRequireAck(socket, one); return false; }
            case "reorder" -> {
                byte[] later = encoder.telemetry(sequence + 2, sessionStartedAt, System.currentTimeMillis(), 20.0, 25.0);
                byte[] older = encoder.telemetry(sequence + 1, sessionStartedAt, System.currentTimeMillis(), 19.0, 24.0);
                sendAndRequireAck(socket, later); sendAndRequireAck(socket, older); sequence += 2; return false;
            }
            case "bad-crc" -> { one[one.length - 1] ^= 1; return sendMalformed(socket, one); }
            case "bad-length" -> { one[4] = 0x7f; one[5] = (byte) 0xff; return sendMalformed(socket, one); }
            case "unsupported-version" -> { one[2] = 2; return sendMalformed(socket, one); }
            case "unknown-type" -> { one[3] = 0x7f; return sendMalformed(socket, one); }
            case "normal", "heartbeat-timeout", "reboot" -> { sendAndRequireAck(socket, one); return "reboot".equals(scenario); }
            default -> throw new IllegalArgumentException("unsupported B07 scenario: " + scenario);
        }
    }

    private boolean sendMalformed(Socket socket, byte[] frame) throws IOException {
        socket.getOutputStream().write(frame); socket.getOutputStream().flush();
        try { return socket.getInputStream().read() < 0; }
        catch (SocketTimeoutException expected) { return true; }
    }

    private void sendAndRequireAck(Socket socket, byte[] frame) throws IOException {
        socket.getOutputStream().write(frame); socket.getOutputStream().flush();
        ByteBufferView view = view(frame);
        requireAck(socket, view.session(), view.sequence());
    }

    private void requireAck(Socket socket, long expectedSession, long expectedSequence) throws IOException {
        byte[] bytes = readFully(socket.getInputStream(), 30);
        AckFrameDecoder.Ack ack = ackDecoder.decode(bytes);
        if (ack.sessionStartedAtMillis() != expectedSession || ack.sequence() != expectedSequence) {
            throw new IOException("ACK did not echo logical session and sequence");
        }
    }

    private static ByteBufferView view(byte[] frame) {
        java.nio.ByteBuffer data = java.nio.ByteBuffer.wrap(frame).order(java.nio.ByteOrder.BIG_ENDIAN);
        data.position(6); return new ByteBufferView(Integer.toUnsignedLong(data.getInt()), data.getLong());
    }

    private static byte[] readFully(InputStream input, int length) throws IOException {
        byte[] result = new byte[length]; int offset = 0;
        while (offset < length) { int count = input.read(result, offset, length - offset); if (count < 0) throw new EOFException(); offset += count; }
        return result;
    }

    private static void sleep(long millis) {
        try { Thread.sleep(millis); } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
    }

    @Override public void stop() {
        running.set(false);
        try { if (client != null) client.close(); } catch (IOException ignored) {}
        try { if (server != null) server.close(); } catch (IOException ignored) {}
        if (thread != null) {
            thread.interrupt();
            try { thread.join(5000); } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
            if (thread.isAlive()) throw new IllegalStateException("B07 synthetic server did not stop within bound");
        }
    }

    @Override public boolean isRunning() { return running.get(); }
    private record ByteBufferView(long sequence, long session) {}
}
