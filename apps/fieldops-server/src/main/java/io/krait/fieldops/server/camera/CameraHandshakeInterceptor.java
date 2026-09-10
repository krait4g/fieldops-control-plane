package io.krait.fieldops.server.camera;

import java.util.Map;

import io.krait.fieldops.server.auth.ScopeService;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Component;
import org.springframework.util.MultiValueMap;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

@Component
@Profile("b04-camera")
public class CameraHandshakeInterceptor implements HandshakeInterceptor {
    private final ScopeService scopes;
    private final RedisCameraLeaseService leases;

    public CameraHandshakeInterceptor(ScopeService scopes, RedisCameraLeaseService leases) {
        this.scopes = scopes;
        this.leases = leases;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler handler, Map<String, Object> attributes) {
        try {
            if (!(request instanceof ServletServerHttpRequest servletRequest)
                    || !(servletRequest.getServletRequest().getUserPrincipal() instanceof OAuth2AuthenticationToken token)
                    || !(token.getPrincipal() instanceof OidcUser user)) {
                response.setStatusCode(HttpStatus.UNAUTHORIZED);
                return false;
            }
            MultiValueMap<String, String> query = UriComponentsBuilder.fromUri(request.getURI())
                    .build().getQueryParams();
            String tenantId = required(query, "tenantId");
            String sessionId = required(query, "sessionId");
            long generation = Long.parseLong(required(query, "generation"));
            String cameraId = cameraId(request.getURI().getPath());
            scopes.requireCamera(user, tenantId, cameraId, "CAMERA_CONTROL");
            String ownerId = scopes.subject(user);
            if (!leases.valid(cameraId, ownerId, sessionId, generation)) {
                response.setStatusCode(HttpStatus.CONFLICT);
                return false;
            }
            attributes.put("cameraId", cameraId);
            attributes.put("tenantId", tenantId);
            attributes.put("ownerId", ownerId);
            attributes.put("sessionId", sessionId);
            attributes.put("generation", generation);
            return true;
        } catch (RuntimeException error) {
            response.setStatusCode(HttpStatus.FORBIDDEN);
            return false;
        }
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler handler, Exception exception) {
        // No durable or replayable state is created during a handshake.
    }

    private static String required(MultiValueMap<String, String> query, String name) {
        String value = query.getFirst(name);
        if (value == null || value.isBlank()) throw new IllegalArgumentException(name + " is required");
        return value;
    }

    private static String cameraId(String path) {
        String marker = "/api/v1/cameras/";
        int start = path.indexOf(marker);
        int end = path.lastIndexOf("/ptz");
        if (start < 0 || end <= start + marker.length()) throw new IllegalArgumentException("Invalid camera path");
        return path.substring(start + marker.length(), end);
    }
}
