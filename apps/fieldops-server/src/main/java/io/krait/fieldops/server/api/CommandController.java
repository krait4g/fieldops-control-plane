package io.krait.fieldops.server.api;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import io.krait.fieldops.command.domain.CommandScenario;
import io.krait.fieldops.command.domain.CommandType;
import io.krait.fieldops.server.auth.ScopeService;
import io.krait.fieldops.server.command.DurableCommandService;
import io.krait.fieldops.server.command.DurableCommandService.CommandView;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("b05-command")
@RequestMapping("/api/v1/commands")
public class CommandController {
    private final ScopeService scopes;
    private final DurableCommandService commands;

    public CommandController(ScopeService scopes, DurableCommandService commands) {
        this.scopes = scopes;
        this.commands = commands;
    }

    @GetMapping
    CommandList list(@AuthenticationPrincipal OidcUser user, @RequestParam String tenantId,
            @RequestParam String siteId) {
        scopes.requireSiteWithAnyPermission(user, tenantId, siteId,
                "DEVICE_COMMAND_REQUEST", "DEVICE_COMMAND_APPROVE");
        return new CommandList(commands.list(tenantId, siteId));
    }

    @GetMapping("/{commandId}")
    CommandView get(@AuthenticationPrincipal OidcUser user, @PathVariable UUID commandId,
            @RequestParam String tenantId) {
        scopes.requireTenant(user, tenantId);
        CommandView command = commands.get(tenantId, commandId);
        scopes.requireSiteWithAnyPermission(user, tenantId, command.siteId(),
                "DEVICE_COMMAND_REQUEST", "DEVICE_COMMAND_APPROVE");
        return command;
    }

    @PostMapping
    ResponseEntity<CommandView> request(@AuthenticationPrincipal OidcUser user,
            @RequestParam String tenantId, @RequestHeader("Idempotency-Key") String key,
            @RequestBody CommandRequest request) {
        scopes.requireDeviceAtSite(user, tenantId, request.siteId(), request.deviceId(),
                "DEVICE_COMMAND_REQUEST");
        DurableCommandService.CreateResult result = commands.request(tenantId, request.siteId(),
                request.deviceId(), request.type(), request.scenario(), scopes.subject(user), key);
        if (!result.created()) return ResponseEntity.ok(result.command());
        return ResponseEntity.created(URI.create("/api/v1/commands/" + result.command().commandId()))
                .body(result.command());
    }

    @PostMapping("/{commandId}/approve")
    CommandView approve(@AuthenticationPrincipal OidcUser user, @PathVariable UUID commandId,
            @RequestParam String tenantId) {
        CommandView command = commands.get(tenantId, commandId);
        scopes.requireSite(user, tenantId, command.siteId(), "DEVICE_COMMAND_APPROVE");
        return commands.decide(tenantId, commandId, scopes.subject(user), true);
    }

    @PostMapping("/{commandId}/reject")
    CommandView reject(@AuthenticationPrincipal OidcUser user, @PathVariable UUID commandId,
            @RequestParam String tenantId) {
        CommandView command = commands.get(tenantId, commandId);
        scopes.requireSite(user, tenantId, command.siteId(), "DEVICE_COMMAND_APPROVE");
        return commands.decide(tenantId, commandId, scopes.subject(user), false);
    }

    record CommandRequest(String siteId, String deviceId, CommandType type, CommandScenario scenario) {}
    record CommandList(List<CommandView> items) {}
}
