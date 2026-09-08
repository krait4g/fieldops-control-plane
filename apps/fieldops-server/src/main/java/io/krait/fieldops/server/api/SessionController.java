package io.krait.fieldops.server.api;

import io.krait.fieldops.server.auth.ScopeService;
import io.krait.fieldops.server.auth.ScopeService.SessionView;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class SessionController {
    private final ScopeService scopes;

    public SessionController(ScopeService scopes) {
        this.scopes = scopes;
    }

    @GetMapping("/session")
    SessionView session(@AuthenticationPrincipal OidcUser user) {
        return scopes.session(user);
    }

    @GetMapping("/auth/csrf")
    CsrfResponse csrf(CsrfToken token) {
        return new CsrfResponse(token.getHeaderName(), token.getParameterName(), token.getToken());
    }

    record CsrfResponse(String headerName, String parameterName, String token) {}
}
