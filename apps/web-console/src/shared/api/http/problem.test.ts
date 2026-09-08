import { describe, expect, it } from "vitest";
import { HttpError, isRetryableError } from "./problem";

function httpError(
  status: number,
  options: { code?: string; retryAfterSeconds?: number } = {},
): HttpError {
  return new HttpError(status, {
    type: "about:blank",
    title: "test",
    status,
    code: options.code ?? "TEST",
    retryAfterSeconds: options.retryAfterSeconds,
  });
}

describe("isRetryableError", () => {
  it("does not retry 401/403/404/409/422", () => {
    for (const status of [401, 403, 404, 409, 422]) {
      expect(isRetryableError(httpError(status))).toBe(false);
    }
  });

  it("does not retry 400", () => {
    expect(isRetryableError(httpError(400))).toBe(false);
  });

  it("retries server errors", () => {
    expect(isRetryableError(httpError(500))).toBe(true);
    expect(isRetryableError(httpError(503))).toBe(true);
  });

  it("retries 429 only with a short Retry-After", () => {
    expect(isRetryableError(httpError(429, { retryAfterSeconds: 5 }))).toBe(true);
    expect(isRetryableError(httpError(429, { retryAfterSeconds: 10 }))).toBe(true);
    expect(isRetryableError(httpError(429, { retryAfterSeconds: 60 }))).toBe(false);
    expect(isRetryableError(httpError(429))).toBe(false);
  });

  it("retries non-HTTP transport errors", () => {
    expect(isRetryableError(new Error("network down"))).toBe(true);
  });
});