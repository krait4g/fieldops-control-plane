package io.krait.fieldops.server.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import io.krait.fieldops.command.domain.CommandScenario;
import io.krait.fieldops.command.domain.CommandStatus;
import io.krait.fieldops.command.domain.CommandType;
import io.krait.fieldops.server.FieldOpsServerApplication;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(classes = FieldOpsServerApplication.class)
@ActiveProfiles({"test", "b05-command"})
@Transactional
class DurableCommandServiceTests {
    @Autowired
    private DurableCommandService commands;

    @Test
    void repeatedKeyConvergesAndDifferentPayloadConflicts() {
        String key = "b05-idem-0001";
        var first = commands.request("tenant-a", "site-a", "valve-a-01", CommandType.OPEN,
                CommandScenario.SUCCESS, "operator", key);
        var repeat = commands.request("tenant-a", "site-a", "valve-a-01", CommandType.OPEN,
                CommandScenario.SUCCESS, "operator", key);

        assertThat(first.created()).isTrue();
        assertThat(repeat.created()).isFalse();
        assertThat(repeat.command().commandId()).isEqualTo(first.command().commandId());
        assertThatThrownBy(() -> commands.request("tenant-a", "site-a", "valve-a-01",
                CommandType.CLOSE, CommandScenario.SUCCESS, "operator", key))
                .isInstanceOf(CommandException.class)
                .hasMessageContaining("different command payload");
    }

    @Test
    void selfApprovalIsDeniedAndSeparateApproverCreatesAppendOnlyTransition() {
        UUID id = commands.request("tenant-a", "site-a", "valve-a-01", CommandType.OPEN,
                CommandScenario.SUCCESS, "operator", "b05-idem-0002").command().commandId();
        assertThatThrownBy(() -> commands.decide("tenant-a", id, "operator", true))
                .isInstanceOf(CommandException.class).hasMessageContaining("cannot decide");

        var approved = commands.decide("tenant-a", id, "approver", true);
        assertThat(approved.status()).isEqualTo(CommandStatus.APPROVED);
        assertThat(approved.transitions()).extracting("toStatus")
                .containsExactly(CommandStatus.PENDING_APPROVAL, CommandStatus.APPROVED);
    }

    @Test
    void rejectIsTerminalAndCannotDispatch() {
        UUID id = commands.request("tenant-a", "site-a", "valve-a-01", CommandType.CLOSE,
                CommandScenario.REJECT, "operator", "b05-idem-0003").command().commandId();
        assertThat(commands.decide("tenant-a", id, "approver", false).status())
                .isEqualTo(CommandStatus.REJECTED);
        assertThatThrownBy(() -> commands.decide("tenant-a", id, "other-approver", true))
                .isInstanceOf(IllegalStateException.class);
    }
}
