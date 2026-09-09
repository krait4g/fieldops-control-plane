package io.krait.fieldops.server.camera;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import io.krait.fieldops.camera.control.ControlLease;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

@Service
@Profile("b04-camera")
public class RedisCameraLeaseService {
    private static final DefaultRedisScript<Long> ACQUIRE = new DefaultRedisScript<>("""
            if redis.call('exists', KEYS[1]) == 1 then return -1 end
            local generation = redis.call('incr', KEYS[2])
            redis.call('psetex', KEYS[1], ARGV[2], ARGV[1] .. '|' .. generation)
            return generation
            """, Long.class);
    private static final DefaultRedisScript<Long> RENEW = new DefaultRedisScript<>("""
            if redis.call('get', KEYS[1]) ~= ARGV[1] then return 0 end
            redis.call('pexpire', KEYS[1], ARGV[2])
            return 1
            """, Long.class);
    private static final DefaultRedisScript<Long> RELEASE = new DefaultRedisScript<>("""
            if redis.call('get', KEYS[1]) ~= ARGV[1] then return 0 end
            redis.call('del', KEYS[1])
            return 1
            """, Long.class);

    private final StringRedisTemplate redis;
    private final Duration ttl;

    public RedisCameraLeaseService(StringRedisTemplate redis,
            @Value("${fieldops.b04.lease.ttl:5s}") Duration ttl) {
        this.redis = redis;
        this.ttl = ttl;
    }

    public ControlLease acquire(String cameraId, String ownerId) {
        String sessionId = UUID.randomUUID().toString();
        String prefix = ownerId + "|" + sessionId;
        Long generation = redis.execute(ACQUIRE,
                List.of(leaseKey(cameraId), generationKey(cameraId)), prefix, Long.toString(ttl.toMillis()));
        if (generation == null || generation < 1) {
            throw new ControlLeaseException("CONTROL_LEASE_HELD", "Another operator holds camera control.");
        }
        return new ControlLease(cameraId, ownerId, sessionId, generation, Instant.now().plus(ttl));
    }

    public ControlLease renew(String cameraId, String ownerId, String sessionId, long generation) {
        ControlLease lease = candidate(cameraId, ownerId, sessionId, generation);
        Long renewed = redis.execute(RENEW, List.of(leaseKey(cameraId)),
                lease.fenceValue(), Long.toString(ttl.toMillis()));
        if (renewed == null || renewed != 1) throw stale();
        return new ControlLease(cameraId, ownerId, sessionId, generation, Instant.now().plus(ttl));
    }

    public void release(String cameraId, String ownerId, String sessionId, long generation) {
        ControlLease lease = candidate(cameraId, ownerId, sessionId, generation);
        Long released = redis.execute(RELEASE, List.of(leaseKey(cameraId)), lease.fenceValue());
        if (released == null || released != 1) throw stale();
    }

    public boolean valid(String cameraId, String ownerId, String sessionId, long generation) {
        return candidate(cameraId, ownerId, sessionId, generation).fenceValue()
                .equals(redis.opsForValue().get(leaseKey(cameraId)));
    }

    public boolean held(String cameraId) {
        return Boolean.TRUE.equals(redis.hasKey(leaseKey(cameraId)));
    }

    public Optional<String> currentFence(String cameraId) {
        return Optional.ofNullable(redis.opsForValue().get(leaseKey(cameraId)));
    }

    static String leaseKey(String cameraId) {
        return "b04:camera:" + cameraId + ":lease";
    }

    private static String generationKey(String cameraId) {
        return "b04:camera:" + cameraId + ":generation";
    }

    private ControlLease candidate(String cameraId, String ownerId, String sessionId, long generation) {
        return new ControlLease(cameraId, ownerId, sessionId, generation, Instant.now().plus(ttl));
    }

    private static ControlLeaseException stale() {
        return new ControlLeaseException("CONTROL_SESSION_STALE", "Control session is expired or fenced out.");
    }
}
