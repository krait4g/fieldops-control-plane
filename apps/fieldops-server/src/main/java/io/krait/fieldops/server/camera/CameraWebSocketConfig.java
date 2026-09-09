package io.krait.fieldops.server.camera;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration(proxyBeanMethods = false)
@EnableWebSocket
@Profile("b04-camera")
public class CameraWebSocketConfig implements WebSocketConfigurer {
    private final CameraWebSocketHandler handler;
    private final CameraHandshakeInterceptor handshakeInterceptor;
    private final String browserOrigin;

    public CameraWebSocketConfig(CameraWebSocketHandler handler,
            CameraHandshakeInterceptor handshakeInterceptor,
            @Value("${fieldops.b04.browser-origin}") String browserOrigin) {
        this.handler = handler;
        this.handshakeInterceptor = handshakeInterceptor;
        this.browserOrigin = browserOrigin;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/api/v1/cameras/{cameraId}/ptz")
                .addInterceptors(handshakeInterceptor)
                .setAllowedOrigins(browserOrigin);
    }
}
