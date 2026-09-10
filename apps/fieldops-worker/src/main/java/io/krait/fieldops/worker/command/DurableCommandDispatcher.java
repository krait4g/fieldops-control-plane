package io.krait.fieldops.worker.command;

import java.time.Clock;

import io.krait.fieldops.command.domain.CommandStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@Profile("b05-command")
public class DurableCommandDispatcher {
    private final CommandLedger ledger;
    private final CommandGatewayClient gateway;
    private final String workerId;
    private final Clock clock;

    @Autowired
    public DurableCommandDispatcher(CommandLedger ledger, CommandGatewayClient gateway,
            @Value("${fieldops.b05.worker-id:b05-worker-1}") String workerId) {
        this(ledger, gateway, workerId, Clock.systemUTC());
    }

    DurableCommandDispatcher(CommandLedger ledger, CommandGatewayClient gateway,
            String workerId, Clock clock) {
        this.ledger = ledger;
        this.gateway = gateway;
        this.workerId = workerId;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${fieldops.b05.dispatch-interval:200ms}")
    public void dispatchOne() {
        CommandLedger.ClaimedCommand command = ledger.claimNext(workerId);
        if (command == null) return;
        try {
            CommandGatewayClient.Result result = gateway.deliver(command);
            if (result.status().equals("REJECTED")) {
                ledger.transition(command.commandId(), CommandStatus.DISPATCHING,
                        CommandStatus.FAILED, workerId, "DEVICE_REJECTED");
            } else if (result.status().equals("ACKNOWLEDGED") || result.status().equals("HANGING")) {
                ledger.transition(command.commandId(), CommandStatus.DISPATCHING,
                        CommandStatus.ACKNOWLEDGED, workerId, "GATEWAY_ACKNOWLEDGED");
            } else if (result.status().equals("SUCCEEDED")) {
                // Even a very fast device must expose ACK as a distinct durable transition.
                ledger.transition(command.commandId(), CommandStatus.DISPATCHING,
                        CommandStatus.ACKNOWLEDGED, workerId, "GATEWAY_ACKNOWLEDGED");
            } else {
                ledger.transition(command.commandId(), CommandStatus.DISPATCHING,
                        CommandStatus.UNKNOWN, workerId, "UNRECOGNIZED_GATEWAY_RESULT");
            }
        } catch (RuntimeException uncertain) {
            ledger.transition(command.commandId(), CommandStatus.DISPATCHING,
                    CommandStatus.UNKNOWN, workerId, "DELIVERY_OUTCOME_UNCERTAIN");
        }
    }

    @Scheduled(fixedDelayString = "${fieldops.b05.observation-interval:200ms}")
    public void observeOutcomes() {
        for (CommandLedger.ClaimedCommand command : ledger.awaitingOutcome()) {
            try {
                CommandGatewayClient.Result result = gateway.status(command.commandId());
                if (result.status().equals("SUCCEEDED") && expected(command).equals(result.observedState())) {
                    ledger.transition(command.commandId(), CommandStatus.ACKNOWLEDGED,
                            CommandStatus.SUCCEEDED, workerId, "DEVICE_STATE_CONFIRMED");
                } else if (result.status().equals("REJECTED")) {
                    ledger.transition(command.commandId(), CommandStatus.ACKNOWLEDGED,
                            CommandStatus.FAILED, workerId, "DEVICE_REJECTED");
                } else if (!clock.instant().isBefore(command.deadlineAt())) {
                    ledger.transition(command.commandId(), CommandStatus.ACKNOWLEDGED,
                            CommandStatus.UNKNOWN, workerId, "DEADLINE_EXPIRED_NO_PROOF");
                }
            } catch (RuntimeException unavailable) {
                if (!clock.instant().isBefore(command.deadlineAt())) {
                    ledger.transition(command.commandId(), CommandStatus.ACKNOWLEDGED,
                            CommandStatus.UNKNOWN, workerId, "DEADLINE_EXPIRED_GATEWAY_UNAVAILABLE");
                }
            }
        }
    }

    private static String expected(CommandLedger.ClaimedCommand command) {
        return command.type().name().equals("OPEN") ? "OPEN" : "CLOSED";
    }
}
