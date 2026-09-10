package io.krait.fieldops.gateway;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.data.redis.autoconfigure.DataRedisAutoConfiguration;
import org.springframework.boot.data.redis.autoconfigure.DataRedisReactiveAutoConfiguration;
import org.springframework.boot.data.redis.autoconfigure.health.DataRedisReactiveHealthContributorAutoConfiguration;
import org.springframework.boot.data.redis.health.DataRedisReactiveHealthIndicator;
import org.springframework.boot.health.contributor.Status;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class GatewayRedisHealthProfileTests {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withConfiguration(AutoConfigurations.of(
                    DataRedisAutoConfiguration.class,
                    DataRedisReactiveAutoConfiguration.class,
                    DataRedisReactiveHealthContributorAutoConfiguration.class
            ));

    @Test
    void localObserveDoesNotTreatCameraRedisAsAHealthDependency() {
        contextRunner
                .withPropertyValues("spring.profiles.active=local-observe")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getEnvironment()
                            .getProperty("management.health.redis.enabled", Boolean.class))
                            .isFalse();
                    assertThat(context).doesNotHaveBean(DataRedisReactiveHealthIndicator.class);
                });
    }

    @Test
    void cameraProfileKeepsRedisHealthEnabledAndReportsDownWhenUnavailable() {
        contextRunner
                .withPropertyValues(
                        "spring.profiles.active=local-observe,b04-camera",
                        "B02_REDIS_PASSWORD=test-only",
                        "spring.data.redis.host=127.0.0.1",
                        "spring.data.redis.port=1",
                        "spring.data.redis.connect-timeout=100ms",
                        "spring.data.redis.timeout=100ms"
                )
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getEnvironment()
                            .getProperty("management.health.redis.enabled", Boolean.class))
                            .isTrue();
                    assertThat(context).hasSingleBean(DataRedisReactiveHealthIndicator.class);
                    assertThat(context.getBean(DataRedisReactiveHealthIndicator.class)
                            .health()
                            .block())
                            .isNotNull()
                            .extracting(health -> health.getStatus())
                            .isEqualTo(Status.DOWN);
                });
    }
}
