package io.krait.fieldops.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(proxyBeanMethods = false)
public class DeviceGatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(DeviceGatewayApplication.class, args);
    }
}
