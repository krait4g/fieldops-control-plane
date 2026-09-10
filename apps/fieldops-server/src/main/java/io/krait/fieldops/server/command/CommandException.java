package io.krait.fieldops.server.command;

public final class CommandException extends RuntimeException {
    private static final long serialVersionUID = 1L;
    private final String code;

    public CommandException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
