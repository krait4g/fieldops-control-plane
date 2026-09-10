package io.krait.fieldops.worker;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(proxyBeanMethods = false)
@EnableKafka
@EnableScheduling
public class FieldOpsWorkerApplication {

    public static void main(String[] args) {
        SpringApplication.run(FieldOpsWorkerApplication.class, args);
    }
}
