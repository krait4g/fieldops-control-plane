package io.krait.fieldops.server.camera;

public final class CameraNotFoundException extends RuntimeException {
    private static final long serialVersionUID = 1L;
    public CameraNotFoundException() {
        super("The requested camera does not exist in the authorized scope.");
    }
}
