package io.krait.fieldops.camera.control;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LatestWinsBufferTests {
    @Test
    void retainsOnlyLatestMove() {
        LatestWinsBuffer buffer = new LatestWinsBuffer();
        buffer.offer(PtzCommand.move("owner", "session", 1, 1, 0.1, 0, 0, 500));
        buffer.offer(PtzCommand.move("owner", "session", 1, 2, 0.8, 0, 0, 500));

        assertThat(buffer.poll().sequence()).isEqualTo(2);
        assertThat(buffer.poll()).isNull();
    }

    @Test
    void stopClearsAndPreemptsMove() {
        LatestWinsBuffer buffer = new LatestWinsBuffer();
        buffer.offer(PtzCommand.move("owner", "session", 2, 3, 1, 0, 0, 500));
        buffer.offer(PtzCommand.stop("owner", "session", 2, 4, "INPUT_RELEASED"));

        assertThat(buffer.poll().type()).isEqualTo(PtzCommand.Type.STOP);
        assertThat(buffer.poll()).isNull();
    }
}
