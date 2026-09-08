package io.krait.fieldops.server.api;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import io.krait.fieldops.server.auth.ScopeService;
import io.krait.fieldops.server.query.ObserveQueryService;
import org.springframework.context.annotation.Profile;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@Profile("local-observe")
public class ObserveController {
    private final ScopeService scopes;
    private final ObserveQueryService queries;

    public ObserveController(ScopeService scopes, ObserveQueryService queries) {
        this.scopes = scopes;
        this.queries = queries;
    }

    @GetMapping("/dashboard/overview")
    Map<String, Object> overview(@AuthenticationPrincipal OidcUser user,
            @RequestParam String tenantId, @RequestParam String siteId,
            @RequestParam(defaultValue = "PT24H") String range) {
        scopes.requireSite(user, tenantId, siteId, "OVERVIEW_READ");
        return queries.overview(tenantId, siteId, range);
    }

    @GetMapping("/dashboard/environment-series")
    Map<String, Object> environmentSeries(@AuthenticationPrincipal OidcUser user,
            @RequestParam String tenantId, @RequestParam String siteId,
            @RequestParam(defaultValue = "PT24H") String range,
            @RequestParam(defaultValue = "PT5M") String bucket) {
        scopes.requireSite(user, tenantId, siteId, "OVERVIEW_READ", "TELEMETRY_READ");
        return queries.series(tenantId, siteId, null, range, bucket,
                List.of("soil.moisture.pct", "soil.temperature.c"));
    }

    @GetMapping("/devices")
    Map<String, Object> devices(@AuthenticationPrincipal OidcUser user,
            @RequestParam String tenantId, @RequestParam String siteId,
            @RequestParam(required = false) String query,
            @RequestParam(required = false) String deviceType,
            @RequestParam(required = false) String protocol,
            @RequestParam(required = false) String connectivity,
            @RequestParam(required = false) String readiness,
            @RequestParam(required = false) String freshness,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "50") int pageSize) {
        scopes.requireSite(user, tenantId, siteId, "DEVICE_READ");
        if (pageSize < 1 || pageSize > 100) throw new ObserveQueryService.InvalidQueryException("Invalid pageSize");
        validateLength(query, 100, "query");
        validateLength(deviceType, 64, "deviceType");
        validateEnum(protocol, "protocol", "MQTT", "TCP_BINARY", "HTTP_POLLING", "ONVIF");
        validateEnum(connectivity, "connectivity", "ONLINE", "OFFLINE", "DEGRADED", "UNKNOWN");
        validateEnum(readiness, "readiness", "READY", "NOT_READY", "FAULTED", "MAINTENANCE", "UNKNOWN");
        validateEnum(freshness, "freshness", "FRESH", "STALE", "UNKNOWN");
        return queries.listDevices(tenantId, siteId, query, deviceType, protocol, connectivity,
                readiness, freshness, cursor, pageSize);
    }

    @GetMapping("/devices/{deviceId}")
    Map<String, Object> device(@AuthenticationPrincipal OidcUser user,
            @PathVariable String deviceId, @RequestParam String tenantId) {
        scopes.requireDevice(user, tenantId, deviceId, "DEVICE_READ");
        return queries.device(tenantId, deviceId);
    }

    @GetMapping("/devices/{deviceId}/state")
    Map<String, Object> deviceState(@AuthenticationPrincipal OidcUser user,
            @PathVariable String deviceId, @RequestParam String tenantId) {
        scopes.requireDevice(user, tenantId, deviceId, "DEVICE_READ", "TELEMETRY_READ");
        return queries.deviceState(tenantId, deviceId);
    }

    @GetMapping("/devices/{deviceId}/telemetry/series")
    Map<String, Object> deviceSeries(@AuthenticationPrincipal OidcUser user,
            @PathVariable String deviceId, @RequestParam String tenantId,
            @RequestParam(defaultValue = "PT24H") String range,
            @RequestParam(defaultValue = "PT5M") String bucket,
            @RequestParam(required = false) String metrics) {
        scopes.requireDevice(user, tenantId, deviceId, "DEVICE_READ", "TELEMETRY_READ");
        String siteId = queries.siteIdForDevice(tenantId, deviceId);
        List<String> metricCodes = metrics == null || metrics.isBlank() ? null
                : Arrays.stream(metrics.split(",")).map(String::trim).filter(value -> !value.isEmpty()).toList();
        validateLength(metrics, 300, "metrics");
        if (metricCodes != null && metricCodes.size() > 4) {
            throw new ObserveQueryService.InvalidQueryException("At most four metrics are allowed");
        }
        return queries.series(tenantId, siteId, deviceId, range, bucket, metricCodes);
    }

    @GetMapping("/members")
    Map<String, Object> members(@AuthenticationPrincipal OidcUser user,
            @RequestParam String tenantId, @RequestParam(required = false) String query,
            @RequestParam(required = false) String role, @RequestParam(required = false) String status,
            @RequestParam(required = false) String siteId, @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "50") int pageSize) {
        scopes.requireTenant(user, tenantId, "MEMBER_READ");
        if (pageSize < 1 || pageSize > 100) throw new ObserveQueryService.InvalidQueryException("Invalid pageSize");
        validateLength(query, 100, "query");
        validateEnum(role, "role", "TENANT_VIEWER", "SITE_OPERATOR", "COMMAND_APPROVER",
                "TENANT_ADMIN", "PLATFORM_ADMIN");
        validateEnum(status, "status", "ACTIVE", "INVITED", "SUSPENDED");
        if (siteId != null && siteId.isBlank()) {
            throw new ObserveQueryService.InvalidQueryException("Invalid siteId");
        }
        return queries.members(tenantId, query, role, status, siteId, cursor, pageSize);
    }

    private static void validateLength(String value, int maximum, String name) {
        if (value != null && value.length() > maximum) {
            throw new ObserveQueryService.InvalidQueryException(name + " exceeds its maximum length");
        }
    }

    private static void validateEnum(String value, String name, String... allowed) {
        if (value != null && Arrays.stream(allowed).noneMatch(value::equals)) {
            throw new ObserveQueryService.InvalidQueryException("Invalid " + name);
        }
    }
}
