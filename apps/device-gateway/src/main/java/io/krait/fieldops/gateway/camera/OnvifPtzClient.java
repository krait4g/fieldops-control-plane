package io.krait.fieldops.gateway.camera;

public interface OnvifPtzClient {
    CameraPose status();
    CameraPose continuousMove(double pan, double tilt, double zoom, int timeoutMs);
    CameraPose stop();
    String streamUri();

    record CameraPose(double pan, double tilt, double zoom, boolean moving) {}
}
