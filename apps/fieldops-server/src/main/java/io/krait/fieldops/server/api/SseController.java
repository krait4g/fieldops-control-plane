package io.krait.fieldops.server.api;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import io.krait.fieldops.server.realtime.SseStreamService;
import org.springframework.context.annotation.Profile;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/v1")
@Profile("local-observe")
public class SseController {
    private final SseStreamService streams;

    public SseController(SseStreamService streams) {
        this.streams = streams;
    }

    @GetMapping(path = "/events/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    SseEmitter stream(@AuthenticationPrincipal OidcUser user,
            @RequestParam String tenantId, @RequestParam String siteId,
            HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) throw new IllegalStateException("Authenticated session is missing");
        return streams.subscribe(user, tenantId, siteId, session.getId());
    }
}
