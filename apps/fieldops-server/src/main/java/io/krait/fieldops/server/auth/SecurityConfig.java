package io.krait.fieldops.server.auth;

import java.io.IOException;
import java.time.Instant;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.session.HttpSessionEventPublisher;

@Configuration(proxyBeanMethods = false)
public class SecurityConfig {
    @Bean
    SecurityFilterChain fieldOpsSecurity(HttpSecurity http,
            @Value("${fieldops.b02.browser-origin}") String browserOrigin,
            CsrfTokenRepository csrfTokenRepository) throws Exception {
        http.authorizeHttpRequests(authorize -> authorize
                        .requestMatchers("/actuator/health/**", "/actuator/info").permitAll()
                        .requestMatchers("/api/v1/oauth2/authorization/**", "/api/v1/login/oauth2/code/**")
                        .permitAll()
                        .anyRequest().authenticated())
                .csrf(csrf -> csrf.csrfTokenRepository(csrfTokenRepository))
                .oauth2Login(oauth -> oauth
                        .authorizationEndpoint(endpoint -> endpoint
                                .baseUri("/api/v1/oauth2/authorization"))
                        .redirectionEndpoint(endpoint -> endpoint
                                .baseUri("/api/v1/login/oauth2/code/*"))
                        .successHandler((request, response, authentication) ->
                                response.sendRedirect(browserOrigin + "/overview")))
                .logout(logout -> logout
                        .logoutUrl("/api/v1/auth/logout")
                        .invalidateHttpSession(true)
                        .clearAuthentication(true)
                        .deleteCookies("FIELDOPS_SESSION")
                        .logoutSuccessHandler((request, response, authentication) ->
                                response.setStatus(HttpServletResponse.SC_NO_CONTENT)))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint((request, response, error) ->
                                writeProblem(response, 401, "SESSION_REQUIRED", "Authentication is required."))
                        .accessDeniedHandler((request, response, error) ->
                                writeProblem(response, 403, "ACCESS_DENIED", "The request is outside the session scope.")))
                .requestCache(Customizer.withDefaults());
        return http.build();
    }

    @Bean
    CsrfTokenRepository csrfTokenRepository() {
        HttpSessionCsrfTokenRepository repository = new HttpSessionCsrfTokenRepository();
        repository.setHeaderName("X-XSRF-TOKEN");
        return repository;
    }

    @Bean
    HttpSessionEventPublisher httpSessionEventPublisher() {
        return new HttpSessionEventPublisher();
    }

    private static void writeProblem(HttpServletResponse response, int status, String code, String detail)
            throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.getWriter().write("""
                {"type":"https://fieldops.dev/problems/%s","title":"Request denied","status":%d,"code":"%s","detail":"%s","traceId":"security-filter","timestamp":"%s"}
                """.formatted(code.toLowerCase().replace('_', '-'), status, code, detail, Instant.now()));
    }
}
