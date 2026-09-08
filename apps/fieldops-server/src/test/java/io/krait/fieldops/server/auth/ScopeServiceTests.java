package io.krait.fieldops.server.auth;

import java.net.URI;
import java.net.URL;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUserAuthority;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class ScopeServiceTests {
    private static final String ISSUER = "http://localhost:28080/realms/fieldops-local";
    private static final String ADMIN_A = "00000000-0000-0000-0000-0000000000a1";
    private static final String MULTI = "00000000-0000-0000-0000-0000000000b2";

    @Autowired
    private ScopeService scopes;

    @Autowired
    private JdbcClient jdbc;

    @Test
    void mapsAdminIdentityToDatabaseMembershipWithoutEmailRoleInference() {
        ScopeService.SessionView session = scopes.session(user(ADMIN_A, "attacker@example.invalid"));

        assertThat(session.user().email()).isEqualTo("b02-admin-a@example.invalid");
        assertThat(session.memberships()).singleElement().satisfies(membership -> {
            assertThat(membership.tenant().id()).isEqualTo("tenant-a");
            assertThat(membership.permissions()).contains("MEMBER_READ", "TELEMETRY_READ");
        });
        assertThatThrownBy(() -> scopes.requireTenant(user(ADMIN_A, "ignored"), "tenant-b", "DEVICE_READ"))
                .isInstanceOf(ScopeDeniedException.class);
    }

    @Test
    void keepsMultiTenantPermissionsSeparatePerTenantAndDevice() {
        ScopeService.SessionView session = scopes.session(user(MULTI, "ignored"));

        assertThat(session.memberships()).extracting(membership -> membership.tenant().id())
                .containsExactly("tenant-a", "tenant-b");
        assertThatThrownBy(() -> scopes.requireTenant(user(MULTI, "ignored"), "tenant-a", "MEMBER_READ"))
                .isInstanceOf(ScopeDeniedException.class);
        assertThat(scopes.requireTenant(user(MULTI, "ignored"), "tenant-b", "MEMBER_READ").role())
                .isEqualTo("TENANT_ADMIN");
        assertThatThrownBy(() -> scopes.requireDevice(
                user(MULTI, "ignored"), "tenant-a", "device-b-soil-01", "DEVICE_READ"))
                .isInstanceOf(ScopeDeniedException.class);
    }

    @Test
    void rejectsUnregisteredOidcSubject() {
        assertThatThrownBy(() -> scopes.session(user("unknown-subject", "b02-admin-a@example.invalid")))
                .isInstanceOf(ScopeDeniedException.class);
    }

    @Test
    @Transactional
    void enforcesDeviceSiteScopeWithinTheSameTenantAndAfterRevocation() {
        jdbc.sql("INSERT INTO b02_site VALUES ('tenant-a', 'site-a-restricted', 'Restricted A', 'Asia/Seoul')")
                .update();
        jdbc.sql("""
                INSERT INTO b02_device VALUES (
                  'tenant-a', 'site-a-restricted', 'device-a-restricted-01', 'A-RESTRICTED-01',
                  'Restricted Sensor', 'SOIL_SENSOR', 'Soil sensor', 'zone-r', 'Restricted Bed',
                  'MQTT', '2026-09-07T00:00:00Z', '2026-09-07T00:00:00Z', 1)
                """).update();

        // The explicit all-sites membership policy allows the new site independently of the role label.
        scopes.requireDevice(user(ADMIN_A, "ignored"), "tenant-a", "device-a-restricted-01", "DEVICE_READ");

        jdbc.sql("""
                UPDATE b02_membership SET all_sites = FALSE
                WHERE issuer = :issuer AND subject = :subject AND tenant_id = 'tenant-a'
                """).param("issuer", ISSUER).param("subject", ADMIN_A).update();
        assertThatThrownBy(() -> scopes.requireDevice(
                user(ADMIN_A, "ignored"), "tenant-a", "device-a-restricted-01", "DEVICE_READ"))
                .isInstanceOf(ScopeDeniedException.class);

        jdbc.sql("""
                INSERT INTO b02_membership_site(issuer, subject, tenant_id, site_id)
                VALUES (:issuer, :subject, 'tenant-a', 'site-a-restricted')
                """).param("issuer", ISSUER).param("subject", ADMIN_A).update();
        scopes.requireDevice(user(ADMIN_A, "ignored"), "tenant-a", "device-a-restricted-01", "DEVICE_READ");

        jdbc.sql("""
                DELETE FROM b02_membership_site
                WHERE issuer = :issuer AND subject = :subject
                  AND tenant_id = 'tenant-a' AND site_id = 'site-a-restricted'
                """).param("issuer", ISSUER).param("subject", ADMIN_A).update();
        assertThatThrownBy(() -> scopes.requireDevice(
                user(ADMIN_A, "ignored"), "tenant-a", "device-a-restricted-01", "DEVICE_READ"))
                .isInstanceOf(ScopeDeniedException.class);

        assertThatThrownBy(() -> scopes.requireDevice(
                user(ADMIN_A, "ignored"), "tenant-b", "device-b-soil-01", "DEVICE_READ"))
                .isInstanceOf(ScopeDeniedException.class);
    }

    private static OidcUser user(String subject, String email) {
        Instant now = Instant.parse("2026-09-07T00:00:00Z");
        Map<String, Object> claims = new HashMap<>();
        claims.put("iss", url(ISSUER));
        claims.put("sub", subject);
        claims.put("email", email);
        OidcIdToken token = new OidcIdToken("synthetic-test-token", now, now.plusSeconds(300), claims);
        return new DefaultOidcUser(List.of(new OidcUserAuthority(token)), token);
    }

    private static URL url(String value) {
        try {
            return URI.create(value).toURL();
        } catch (java.net.MalformedURLException error) {
            throw new IllegalArgumentException(error);
        }
    }
}
