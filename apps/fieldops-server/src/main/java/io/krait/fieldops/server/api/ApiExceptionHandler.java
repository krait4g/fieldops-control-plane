package io.krait.fieldops.server.api;

import java.net.URI;
import java.time.Instant;

import io.krait.fieldops.server.auth.ScopeDeniedException;
import io.krait.fieldops.server.query.ObserveQueryService.InvalidQueryException;
import io.krait.fieldops.server.query.ObserveQueryService.StateUnavailableException;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(ScopeDeniedException.class)
    ProblemDetail scopeDenied(ScopeDeniedException error) {
        return problem(HttpStatus.FORBIDDEN, "SCOPE_DENIED", "Access denied", error.getMessage());
    }

    @ExceptionHandler(InvalidQueryException.class)
    ProblemDetail invalidQuery(InvalidQueryException error) {
        return problem(HttpStatus.valueOf(422), "INVALID_QUERY", "Invalid query", error.getMessage());
    }

    @ExceptionHandler(StateUnavailableException.class)
    ProblemDetail stateUnavailable(StateUnavailableException error) {
        return problem(HttpStatus.SERVICE_UNAVAILABLE, "REALTIME_STATE_UNAVAILABLE",
                "Realtime state unavailable", error.getMessage());
    }

    @ExceptionHandler(EmptyResultDataAccessException.class)
    ProblemDetail notFound(EmptyResultDataAccessException error) {
        return problem(HttpStatus.NOT_FOUND, "DEVICE_NOT_FOUND", "Device not found",
                "The requested resource does not exist in the authorized scope.");
    }

    private static ProblemDetail problem(HttpStatus status, String code, String title, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setType(URI.create("https://fieldops.dev/problems/" + code.toLowerCase().replace('_', '-')));
        problem.setTitle(title);
        problem.setProperty("code", code);
        problem.setProperty("traceId", "b02-local");
        problem.setProperty("timestamp", Instant.now());
        return problem;
    }
}
