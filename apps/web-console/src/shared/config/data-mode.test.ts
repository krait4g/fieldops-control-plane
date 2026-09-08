import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertProductionMode,
  resolveApiMode,
  shouldUseMock,
} from "./data-mode";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveApiMode", () => {
  it("defaults to mock when the env is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_FIELDOPS_DATA_MODE", "");
    expect(resolveApiMode()).toBe("mock");
  });

  it("returns remote when configured", () => {
    vi.stubEnv("NEXT_PUBLIC_FIELDOPS_DATA_MODE", "remote");
    expect(resolveApiMode()).toBe("remote");
  });

  it("ignores an unknown value and falls back to mock", () => {
    vi.stubEnv("NEXT_PUBLIC_FIELDOPS_DATA_MODE", "bogus");
    expect(resolveApiMode()).toBe("mock");
  });
});

describe("assertProductionMode", () => {
  it("rejects mock mode in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertProductionMode("mock")).toThrow(/mock is not allowed/i);
  });

  it("allows remote mode in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertProductionMode("remote")).not.toThrow();
  });

  it("allows mock mode outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(() => assertProductionMode("mock")).not.toThrow();
  });
});

describe("shouldUseMock", () => {
  it("is true for mock in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(shouldUseMock("mock")).toBe(true);
  });

  it("is false for remote", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(shouldUseMock("remote")).toBe(false);
  });

  it("is false for mock in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(shouldUseMock("mock")).toBe(false);
  });
});