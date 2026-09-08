package io.krait.fieldops.server;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(proxyBeanMethods = false)
@EnableKafka
@EnableScheduling
public class FieldOpsServerApplication {

    public static void main(String[] args) {
        SpringApplication.run(FieldOpsServerApplication.class, args);
    }
}
