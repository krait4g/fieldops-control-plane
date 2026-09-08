package io.krait.fieldops.worker;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.kafka.annotation.EnableKafka;

@SpringBootApplication(proxyBeanMethods = false)
@EnableKafka
public class FieldOpsWorkerApplication {

    public static void main(String[] args) {
        SpringApplication.run(FieldOpsWorkerApplication.class, args);
    }
}
