package io.krait.fieldops.simulator;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.ConfigurableApplicationContext;

@SpringBootApplication(proxyBeanMethods = false)
public class FieldOpsSimulatorApplication {

    public static void main(String[] args) {
        ConfigurableApplicationContext context = SpringApplication.run(FieldOpsSimulatorApplication.class, args);
        if (!context.getEnvironment().matchesProfiles("b04-camera")) {
            int exitCode = SpringApplication.exit(context);
            System.exit(exitCode);
        }
    }
}
