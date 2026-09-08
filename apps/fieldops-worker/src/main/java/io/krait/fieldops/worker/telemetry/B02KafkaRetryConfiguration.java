package io.krait.fieldops.worker.telemetry;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.kafka.listener.ContainerPausingBackOffHandler;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.kafka.listener.ListenerContainerPauseService;
import org.springframework.kafka.listener.ListenerContainerRegistry;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.util.backoff.ExponentialBackOff;

/**
 * Keeps a transient store or broker outage from hot-looping a listener while
 * preserving the record for later redelivery. Each delivery cycle has a
 * finite retry budget; exhaustion raises a payload-free exception so the
 * container can seek and begin a new bounded cycle after its pause.
 */
@Configuration(proxyBeanMethods = false)
@Profile("local-observe")
public class B02KafkaRetryConfiguration {
    @Bean(destroyMethod = "shutdown")
    ThreadPoolTaskScheduler b02KafkaPauseScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("b02-kafka-pause-");
        scheduler.initialize();
        return scheduler;
    }

    @Bean
    ListenerContainerPauseService b02ListenerPauseService(
            ListenerContainerRegistry registry, TaskScheduler taskScheduler) {
        return new ListenerContainerPauseService(registry, taskScheduler);
    }

    @Bean
    DefaultErrorHandler b02KafkaErrorHandler(ListenerContainerPauseService pauseService) {
        ExponentialBackOff backOff = new ExponentialBackOff(250L, 2.0);
        backOff.setMaxInterval(2_000L);
        backOff.setMaxAttempts(4);
        DefaultErrorHandler handler = new DefaultErrorHandler(
                (record, error) -> {
                    throw new IllegalStateException("B02 listener retry cycle exhausted at "
                            + record.topic() + "-" + record.partition() + "@" + record.offset()
                            + "; cause=" + error.getClass().getSimpleName() + ": " + error.getMessage(), error);
                },
                backOff,
                new ContainerPausingBackOffHandler(pauseService));
        handler.setAckAfterHandle(false);
        handler.setCommitRecovered(false);
        return handler;
    }
}
