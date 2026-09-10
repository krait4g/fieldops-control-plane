package io.krait.fieldops.command.domain;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

public final class CommandLifecycle {
    private static final Map<CommandStatus, Set<CommandStatus>> ALLOWED = allowedTransitions();

    private CommandLifecycle() {}

    public static void requireTransition(CommandStatus from, CommandStatus to) {
        if (from == null || to == null || !ALLOWED.getOrDefault(from, Set.of()).contains(to)) {
            throw new IllegalStateException("invalid command transition: " + from + " -> " + to);
        }
    }

    private static Map<CommandStatus, Set<CommandStatus>> allowedTransitions() {
        EnumMap<CommandStatus, Set<CommandStatus>> transitions = new EnumMap<>(CommandStatus.class);
        transitions.put(CommandStatus.PENDING_APPROVAL,
                EnumSet.of(CommandStatus.APPROVED, CommandStatus.REJECTED));
        transitions.put(CommandStatus.APPROVED, EnumSet.of(CommandStatus.DISPATCHING));
        transitions.put(CommandStatus.DISPATCHING,
                EnumSet.of(CommandStatus.ACKNOWLEDGED, CommandStatus.FAILED, CommandStatus.UNKNOWN));
        transitions.put(CommandStatus.ACKNOWLEDGED,
                EnumSet.of(CommandStatus.SUCCEEDED, CommandStatus.FAILED, CommandStatus.UNKNOWN));
        return Map.copyOf(transitions);
    }
}
