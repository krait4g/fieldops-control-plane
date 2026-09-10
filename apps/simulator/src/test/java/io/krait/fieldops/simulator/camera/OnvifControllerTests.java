package io.krait.fieldops.simulator.camera;

import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class OnvifControllerTests {
    private static final String PROFILE = "<tptz:ProfileToken>profile-main</tptz:ProfileToken>";
    private final AtomicLong nanos = new AtomicLong();
    private final OnvifCameraState state = new OnvifCameraState(nanos::get);
    private final OnvifController controller = new OnvifController(
            state, "http://127.0.0.1:28084", "rtsp://127.0.0.1:28554/camera-a-01", "profile-main");

    @Test
    void supportsRequiredOnvifSubset() {
        assertThat(body("<tds:GetCapabilities/>")).contains("GetCapabilitiesResponse", "media_service", "ptz_service");
        assertThat(body("<trt:GetProfiles/>")).contains("GetProfilesResponse", "profile-main");
        assertThat(body("<trt:GetStreamUri/>"))
                .contains("GetStreamUriResponse", "rtsp://127.0.0.1:28554/camera-a-01");
        assertThat(body("<tptz:GetStatus/>"))
                .contains("GetStatusResponse", "PanTilt", "IDLE");
    }

    @Test
    void continuousMoveChangesPoseAndFiniteTimeoutStopsMotion() {
        String move = PROFILE + """
                <tptz:ContinuousMove><tptz:ProfileToken>profile-main</tptz:ProfileToken>
                <tptz:Velocity><tt:PanTilt x="1" y="-0.5"/><tt:Zoom x="0.25"/></tptz:Velocity>
                <tptz:Timeout>PT0.5S</tptz:Timeout></tptz:ContinuousMove>
                """;
        assertThat(body(move)).contains("ContinuousMoveResponse");
        nanos.addAndGet(250_000_000L);
        OnvifCameraState.Pose moving = state.status();
        assertThat(moving.pan()).isPositive();
        assertThat(moving.tilt()).isNegative();
        assertThat(moving.zoom()).isPositive();
        assertThat(moving.moving()).isTrue();

        nanos.addAndGet(300_000_000L);
        OnvifCameraState.Pose stopped = state.status();
        assertThat(stopped.moving()).isFalse();
        assertThat(stopped.pan()).isBetween(0.34, 0.36);
    }

    @Test
    void stopIsImmediateAndDoctypeIsRejected() {
        body(PROFILE + """
                <tptz:ContinuousMove><tptz:ProfileToken>profile-main</tptz:ProfileToken>
                <tptz:Velocity><tt:PanTilt x="1" y="0"/></tptz:Velocity>
                <tptz:Timeout>PT0.5S</tptz:Timeout></tptz:ContinuousMove>
                """);
        assertThat(body("<tptz:Stop>" + PROFILE + "</tptz:Stop>")).contains("StopResponse");
        assertThat(state.status().moving()).isFalse();

        String malicious = "<!DOCTYPE x [<!ENTITY e SYSTEM \"file:///etc/passwd\">]><tds:GetCapabilities>&e;</tds:GetCapabilities>";
        assertThat(controller.invoke(envelope(malicious)).getStatusCode().value()).isEqualTo(500);
    }

    private String body(String body) {
        return controller.invoke(envelope(body)).getBody();
    }

    private static String envelope(String body) {
        return """
                <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
                  xmlns:tds="http://www.onvif.org/ver10/device/wsdl"
                  xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
                  xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"
                  xmlns:tt="http://www.onvif.org/ver10/schema"><s:Body>%s</s:Body></s:Envelope>
                """.formatted(body);
    }
}
