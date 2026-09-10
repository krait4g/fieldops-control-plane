package io.krait.fieldops.simulator.command;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.UUID;

import io.krait.fieldops.command.domain.CommandScenario;
import io.krait.fieldops.command.domain.CommandType;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class SyntheticValveServiceTests {
    private final SyntheticValveService valve = new SyntheticValveService("valve-a-01", Duration.ofMillis(20));

    @AfterEach
    void close() {
        valve.close();
    }

    @Test
    void successAcknowledgesBeforeObservedStateChangesAndDeduplicatesDelivery() throws Exception {
        UUID id = UUID.randomUUID();
        var acknowledged = valve.deliver("valve-a-01", id, CommandType.OPEN, CommandScenario.SUCCESS);
        assertThat(acknowledged.status()).isEqualTo("ACKNOWLEDGED");
        assertThat(acknowledged.observedState()).isEqualTo("CLOSED");

        Thread.sleep(40);
        var succeeded = valve.status("valve-a-01", id);
        assertThat(succeeded.status()).isEqualTo("SUCCEEDED");
        assertThat(succeeded.observedState()).isEqualTo("OPEN");
        assertThat(valve.deliver("valve-a-01", id, CommandType.OPEN, CommandScenario.SUCCESS)
                .actuationCount()).isEqualTo(1);
    }

    @Test
    void rejectDoesNotActuateAndHangNeverConfirmsState() throws Exception {
        var rejected = valve.deliver("valve-a-01", UUID.randomUUID(), CommandType.OPEN,
                CommandScenario.REJECT);
        UUID hangingId = UUID.randomUUID();
        valve.deliver("valve-a-01", hangingId, CommandType.OPEN, CommandScenario.HANG);
        Thread.sleep(30);
        assertThat(rejected.status()).isEqualTo("REJECTED");
        assertThat(rejected.actuationCount()).isZero();
        assertThat(valve.status("valve-a-01", hangingId).status()).isEqualTo("HANGING");
    }
}
