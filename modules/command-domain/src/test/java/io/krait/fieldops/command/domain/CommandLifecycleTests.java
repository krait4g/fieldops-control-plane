package io.krait.fieldops.command.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class CommandLifecycleTests {
    @Test
    void permitsOnlyTheDurableApprovalAndOutcomePaths() {
        CommandLifecycle.requireTransition(CommandStatus.PENDING_APPROVAL, CommandStatus.APPROVED);
        CommandLifecycle.requireTransition(CommandStatus.PENDING_APPROVAL, CommandStatus.REJECTED);
        CommandLifecycle.requireTransition(CommandStatus.APPROVED, CommandStatus.DISPATCHING);
        CommandLifecycle.requireTransition(CommandStatus.DISPATCHING, CommandStatus.ACKNOWLEDGED);
        CommandLifecycle.requireTransition(CommandStatus.ACKNOWLEDGED, CommandStatus.SUCCEEDED);
        CommandLifecycle.requireTransition(CommandStatus.ACKNOWLEDGED, CommandStatus.FAILED);
        CommandLifecycle.requireTransition(CommandStatus.ACKNOWLEDGED, CommandStatus.UNKNOWN);
    }

    @Test
    void acknowledgementIsNotSuccessAndTerminalStatesCannotRedispatch() {
        assertThat(CommandStatus.ACKNOWLEDGED.terminal()).isFalse();
        assertThat(CommandStatus.UNKNOWN.terminal()).isTrue();
        assertThatThrownBy(() -> CommandLifecycle.requireTransition(
                CommandStatus.ACKNOWLEDGED, CommandStatus.DISPATCHING))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> CommandLifecycle.requireTransition(
                CommandStatus.UNKNOWN, CommandStatus.DISPATCHING))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void canonicalHashSeparatesSemanticPayloads() {
        String original = new CommandPayload("tenant-a", "valve-a-01", CommandType.OPEN,
                CommandScenario.SUCCESS).canonicalHash();
        assertThat(new CommandPayload("tenant-a", "valve-a-01", CommandType.OPEN,
                CommandScenario.SUCCESS).canonicalHash()).isEqualTo(original);
        assertThat(new CommandPayload("tenant-a", "valve-a-01", CommandType.CLOSE,
                CommandScenario.SUCCESS).canonicalHash()).isNotEqualTo(original);
    }
}
