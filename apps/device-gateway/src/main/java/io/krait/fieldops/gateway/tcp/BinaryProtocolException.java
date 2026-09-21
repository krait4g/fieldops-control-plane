package io.krait.fieldops.gateway.tcp;

public final class BinaryProtocolException extends RuntimeException {
    private static final long serialVersionUID = 1L;
    private final String reason;

    public BinaryProtocolException(String reason, String message) {
        super(message);
        this.reason = reason;
    }

    public String reason() {
        return reason;
    }
}
