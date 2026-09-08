package io.krait.fieldops.telemetry.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;

import org.junit.jupiter.api.Test;

class SourceOrderTests {
    @Test
    void comparesFractionalInstantsNumericallyRatherThanLexically() {
        SourceOrder earlier = new SourceOrder(Instant.parse("2026-09-08T00:00:00Z"), 99);
        SourceOrder later = new SourceOrder(Instant.parse("2026-09-08T00:00:00.001Z"), 0);

        assertThat(earlier).isLessThan(later);
        assertThat(earlier.sessionStartedAtMillis()).isLessThan(later.sessionStartedAtMillis());
    }

    @Test
    void rejectsASequenceRedisCannotCompareExactly() {
        assertThatThrownBy(() -> new SourceOrder(Instant.EPOCH, SourceOrder.MAX_SAFE_INTEGER + 1))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
