package io.krait.fieldops.command.domain;

public enum CommandStatus {
    PENDING_APPROVAL,
    APPROVED,
    REJECTED,
    DISPATCHING,
    ACKNOWLEDGED,
    SUCCEEDED,
    FAILED,
    UNKNOWN;

    public boolean terminal() {
        return this == REJECTED || this == SUCCEEDED || this == FAILED || this == UNKNOWN;
    }
}
