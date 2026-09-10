package io.krait.fieldops.gateway.camera;

import io.krait.fieldops.camera.control.PtzCommand;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class CameraControlGatewayControllerTests {
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    @SuppressWarnings("unchecked")
    private final ValueOperations<String, String> values = mock(ValueOperations.class);
    private final OnvifPtzClient onvif = mock(OnvifPtzClient.class);
    private CameraControlGatewayController controller;

    @BeforeEach
    void setUp() {
        when(redis.opsForValue()).thenReturn(values);
        controller = new CameraControlGatewayController(redis, onvif, "internal-secret", "camera-a-01");
    }

    @Test
    void rejectsStaleMoveAndStopDuringFinalRedisRevalidation() {
        when(values.get("b04:camera:camera-a-01:lease")).thenReturn("new-owner|new-session|9");

        var move = controller.command("camera-a-01", "internal-secret",
                PtzCommand.move("old-owner", "old-session", 8, 11, 1, 0, 0, 500));
        var stop = controller.command("camera-a-01", "internal-secret",
                PtzCommand.stop("old-owner", "old-session", 8, 12, "INPUT_RELEASED"));

        assertThat(move.accepted()).isFalse();
        assertThat(stop.accepted()).isFalse();
        assertThat(move.reason()).isEqualTo("STALE_FENCE");
        assertThat(stop.reason()).isEqualTo("STALE_FENCE");
        verifyNoInteractions(onvif);
    }

    @Test
    void sendsOnlyAfterMatchingFenceReadInsideCameraLock() {
        when(values.get("b04:camera:camera-a-01:lease")).thenReturn("owner|session|4");
        when(onvif.continuousMove(0.75, -0.25, 0.1, 500))
                .thenReturn(new OnvifPtzClient.CameraPose(0.1, -0.05, 0.01, true));

        var result = controller.command("camera-a-01", "internal-secret",
                PtzCommand.move("owner", "session", 4, 7, 0.75, -0.25, 0.1, 500));

        assertThat(result.accepted()).isTrue();
        assertThat(result.pose().moving()).isTrue();
        verify(values).get("b04:camera:camera-a-01:lease");
        verify(onvif).continuousMove(0.75, -0.25, 0.1, 500);
    }
}
