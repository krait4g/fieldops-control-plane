package io.krait.fieldops.server.camera;

public final class CameraUnavailableException extends RuntimeException {
    private static final long serialVersionUID = 1L;
    public CameraUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
