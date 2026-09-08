package io.krait.fieldops.server.auth;

public final class ScopeDeniedException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    public ScopeDeniedException(String message) {
        super(message);
    }
}
