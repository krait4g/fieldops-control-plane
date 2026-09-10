package io.krait.fieldops.command.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

public record CommandPayload(String tenantId, String deviceId, CommandType type,
        CommandScenario scenario) {
    public CommandPayload {
        requireToken(tenantId, "tenantId");
        requireToken(deviceId, "deviceId");
        if (type == null) throw new IllegalArgumentException("type is required");
        if (scenario == null) throw new IllegalArgumentException("scenario is required");
    }

    public String canonicalHash() {
        String canonical = tenantId + "\n" + deviceId + "\n" + type.name() + "\n" + scenario.name();
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 is unavailable", error);
        }
    }

    private static void requireToken(String value, String name) {
        if (value == null || value.isBlank() || value.length() > 64) {
            throw new IllegalArgumentException(name + " must contain 1 to 64 characters");
        }
    }
}
