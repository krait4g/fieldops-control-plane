package io.krait.fieldops.worker.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import io.krait.fieldops.command.domain.CommandScenario;
import io.krait.fieldops.command.domain.CommandStatus;
import io.krait.fieldops.command.domain.CommandType;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class DurableCommandDispatcherTests {
    private static final UUID ID = UUID.fromString("00000000-0000-0000-0000-000000000501");
    private final CommandLedger ledger = Mockito.mock(CommandLedger.class);
    private final CommandGatewayClient gateway = Mockito.mock(CommandGatewayClient.class);

    @Test
    void claimSqlUsesPostgresSkipLocked() {
        assertThat(CommandLedger.CLAIM_SQL).contains("FOR UPDATE SKIP LOCKED").contains("status='APPROVED'");
    }

    @Test
    void acknowledgedIsPersistedBeforeSuccessObservation() {
        CommandLedger.ClaimedCommand command = command(Instant.parse("2026-09-10T00:00:04Z"));
        when(ledger.claimNext("worker")).thenReturn(command);
        when(gateway.deliver(command)).thenReturn(result("ACKNOWLEDGED", "CLOSED"));
        new DurableCommandDispatcher(ledger, gateway, "worker", fixed()).dispatchOne();
        verify(ledger).transition(ID, CommandStatus.DISPATCHING, CommandStatus.ACKNOWLEDGED,
                "worker", "GATEWAY_ACKNOWLEDGED");
        verify(ledger, never()).transition(ID, CommandStatus.DISPATCHING, CommandStatus.SUCCEEDED,
                "worker", "DEVICE_STATE_CONFIRMED");
    }

    @Test
    void hangBecomesUnknownAtDeadlineAndIsNeverClaimedByOutcomeLoop() {
        CommandLedger.ClaimedCommand command = command(Instant.parse("2026-09-09T23:59:59Z"));
        when(ledger.awaitingOutcome()).thenReturn(List.of(command));
        when(gateway.status(ID)).thenReturn(result("HANGING", "CLOSED"));
        new DurableCommandDispatcher(ledger, gateway, "worker", fixed()).observeOutcomes();
        verify(ledger).transition(ID, CommandStatus.ACKNOWLEDGED, CommandStatus.UNKNOWN,
                "worker", "DEADLINE_EXPIRED_NO_PROOF");
        verify(ledger, never()).claimNext("worker");
    }

    private static CommandLedger.ClaimedCommand command(Instant deadline) {
        return new CommandLedger.ClaimedCommand(ID, "tenant-a", "valve-a-01", CommandType.OPEN,
                CommandScenario.SUCCESS, "hash", deadline);
    }

    private static CommandGatewayClient.Result result(String status, String state) {
        return new CommandGatewayClient.Result(ID, "hash", status, state, 1,
                Instant.parse("2026-09-10T00:00:00Z"));
    }

    private static Clock fixed() {
        return Clock.fixed(Instant.parse("2026-09-10T00:00:00Z"), ZoneOffset.UTC);
    }
}
