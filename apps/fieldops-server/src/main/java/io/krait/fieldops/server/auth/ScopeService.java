package io.krait.fieldops.server.auth;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;

@Service
public class ScopeService {
    private final JdbcClient jdbc;
    private final Clock clock;

    @Autowired
    public ScopeService(JdbcClient jdbc) {
        this(jdbc, Clock.systemUTC());
    }

    ScopeService(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    public SessionView session(OidcUser user) {
        PrincipalRef principal = principal(user);
        SessionUser sessionUser = jdbc.sql("""
                SELECT subject, display_name, email
                FROM b02_principal
                WHERE issuer = :issuer AND subject = :subject
                """)
                .param("issuer", principal.issuer())
                .param("subject", principal.subject())
                .query((row, ignored) -> new SessionUser(
                        row.getString("subject"), row.getString("display_name"), row.getString("email")))
                .optional()
                .orElseThrow(() -> new ScopeDeniedException("OIDC identity is not registered"));

        List<MembershipView> memberships = jdbc.sql("""
                SELECT m.tenant_id, t.name, t.timezone, m.role_code
                FROM b02_membership m
                JOIN b02_tenant t ON t.tenant_id = m.tenant_id
                WHERE m.issuer = :issuer AND m.subject = :subject AND m.status = 'ACTIVE'
                ORDER BY m.tenant_id
                """)
                .param("issuer", principal.issuer())
                .param("subject", principal.subject())
                .query((row, ignored) -> membership(principal, row.getString("tenant_id"),
                        row.getString("name"), row.getString("timezone"), row.getString("role_code")))
                .list();
        if (memberships.isEmpty()) {
            throw new ScopeDeniedException("OIDC identity has no active membership");
        }
        MembershipView first = memberships.getFirst();
        String firstSite = first.sites().isEmpty() ? null : first.sites().getFirst().id();
        return new SessionView(sessionUser, memberships,
                new ActiveContext(first.tenant().id(), firstSite), clock.instant());
    }

    public MembershipView requireTenant(OidcUser user, String tenantId, String... requiredPermissions) {
        PrincipalRef principal = principal(user);
        MembershipView membership = jdbc.sql("""
                SELECT m.tenant_id, t.name, t.timezone, m.role_code
                FROM b02_membership m
                JOIN b02_tenant t ON t.tenant_id = m.tenant_id
                WHERE m.issuer = :issuer AND m.subject = :subject
                  AND m.tenant_id = :tenantId AND m.status = 'ACTIVE'
                """)
                .param("issuer", principal.issuer())
                .param("subject", principal.subject())
                .param("tenantId", tenantId)
                .query((row, ignored) -> membership(principal, row.getString("tenant_id"),
                        row.getString("name"), row.getString("timezone"), row.getString("role_code")))
                .optional()
                .orElseThrow(() -> new ScopeDeniedException("Tenant is outside the authenticated membership"));
        Set<String> granted = Set.copyOf(membership.permissions());
        for (String permission : requiredPermissions) {
            if (!granted.contains(permission)) {
                throw new ScopeDeniedException("Required permission is missing: " + permission);
            }
        }
        return membership;
    }

    public void requireSite(OidcUser user, String tenantId, String siteId, String... permissions) {
        MembershipView membership = requireTenant(user, tenantId, permissions);
        boolean allowed = membership.sites().stream().anyMatch(site -> site.id().equals(siteId));
        if (!allowed) {
            throw new ScopeDeniedException("Site is outside the authenticated membership");
        }
    }

    public void requireDevice(OidcUser user, String tenantId, String deviceId, String... permissions) {
        requireTenant(user, tenantId, permissions);
        PrincipalRef principal = principal(user);
        boolean exists = jdbc.sql("""
                SELECT COUNT(*)
                FROM b02_device d
                JOIN b02_membership m ON m.tenant_id = d.tenant_id
                  AND m.issuer = :issuer AND m.subject = :subject AND m.status = 'ACTIVE'
                WHERE d.tenant_id = :tenantId AND d.device_id = :deviceId
                  AND (m.all_sites = TRUE OR EXISTS (
                    SELECT 1 FROM b02_membership_site ms
                    WHERE ms.issuer = m.issuer AND ms.subject = m.subject
                      AND ms.tenant_id = m.tenant_id AND ms.site_id = d.site_id
                  ))
                """)
                .param("issuer", principal.issuer())
                .param("subject", principal.subject())
                .param("tenantId", tenantId)
                .param("deviceId", deviceId)
                .query(Integer.class)
                .single() > 0;
        if (!exists) {
            throw new ScopeDeniedException("Device is outside the authenticated site scope");
        }
    }

    private MembershipView membership(PrincipalRef principal, String tenantId, String tenantName,
            String timezone, String role) {
        List<String> permissions = jdbc.sql("""
                SELECT permission_code FROM b02_membership_permission
                WHERE issuer = :issuer AND subject = :subject AND tenant_id = :tenantId
                ORDER BY permission_code
                """)
                .param("issuer", principal.issuer())
                .param("subject", principal.subject())
                .param("tenantId", tenantId)
                .query(String.class)
                .list();
        List<SiteOption> sites = jdbc.sql("""
                SELECT s.site_id, s.name, s.timezone
                FROM b02_membership_site ms
                JOIN b02_site s ON s.tenant_id = ms.tenant_id AND s.site_id = ms.site_id
                WHERE ms.issuer = :issuer AND ms.subject = :subject AND ms.tenant_id = :tenantId
                ORDER BY s.site_id
                """)
                .param("issuer", principal.issuer())
                .param("subject", principal.subject())
                .param("tenantId", tenantId)
                .query((row, ignored) -> new SiteOption(
                        row.getString("site_id"), row.getString("name"), row.getString("timezone")))
                .list();
        return new MembershipView(new TenantOption(tenantId, tenantName, timezone), role, permissions, sites);
    }

    private static PrincipalRef principal(OidcUser user) {
        if (user == null || user.getIdToken() == null || user.getIdToken().getIssuer() == null) {
            throw new ScopeDeniedException("Authenticated OIDC identity is required");
        }
        return new PrincipalRef(user.getIdToken().getIssuer().toString(), user.getSubject());
    }

    private record PrincipalRef(String issuer, String subject) {}

    public record SessionView(SessionUser user, List<MembershipView> memberships,
            ActiveContext activeContext, Instant issuedAt) {}
    public record SessionUser(String id, String displayName, String email) {}
    public record MembershipView(TenantOption tenant, String role, List<String> permissions,
            List<SiteOption> sites) {}
    public record TenantOption(String id, String name, String timezone) {}
    public record SiteOption(String id, String name, String timezone) {}
    public record ActiveContext(String tenantId, String siteId) {}
}
