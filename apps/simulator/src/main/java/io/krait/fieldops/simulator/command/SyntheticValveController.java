package io.krait.fieldops.simulator.command;

import java.util.UUID;

import io.krait.fieldops.command.domain.CommandScenario;
import io.krait.fieldops.command.domain.CommandType;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("b05-command")
@RequestMapping("/synthetic/v1/valves")
public class SyntheticValveController {
    private final SyntheticValveService valves;

    public SyntheticValveController(SyntheticValveService valves) {
        this.valves = valves;
    }

    @PostMapping("/{deviceId}/commands")
    SyntheticValveService.Delivery command(@PathVariable String deviceId,
            @RequestBody ValveCommand command) {
        return valves.deliver(deviceId, command.commandId(), command.type(), command.scenario());
    }

    @GetMapping("/{deviceId}/commands/{commandId}")
    SyntheticValveService.Delivery status(@PathVariable String deviceId, @PathVariable UUID commandId) {
        return valves.status(deviceId, commandId);
    }

    @GetMapping("/{deviceId}")
    SyntheticValveService.ValveState valveState(@PathVariable String deviceId) {
        return valves.valveState(deviceId);
    }

    public record ValveCommand(UUID commandId, CommandType type, CommandScenario scenario) {}

    @ResponseStatus(HttpStatus.NOT_FOUND)
    @org.springframework.web.bind.annotation.ExceptionHandler(SyntheticValveService.ValveDeliveryNotFoundException.class)
    void notFound() {}
}
