package io.krait.fieldops.camera.control;

import java.util.concurrent.atomic.AtomicReference;

public final class LatestWinsBuffer {
    private final AtomicReference<PtzCommand> latestMove = new AtomicReference<>();
    private final AtomicReference<PtzCommand> priorityStop = new AtomicReference<>();

    public void offer(PtzCommand command) {
        if (command.type() == PtzCommand.Type.STOP) {
            latestMove.set(null);
            priorityStop.set(command);
        } else {
            latestMove.set(command);
        }
    }

    public PtzCommand poll() {
        PtzCommand stop = priorityStop.getAndSet(null);
        return stop != null ? stop : latestMove.getAndSet(null);
    }

    public void clearMoves() {
        latestMove.set(null);
    }
}
