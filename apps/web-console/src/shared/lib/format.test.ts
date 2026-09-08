import { afterEach, describe, expect, it, vi } from "vitest";
import { formatMetricValue, formatRatio } from "./format";
import { formatRelativeTime, toViewTimestamp } from "./time";

describe("locale formatters", () => {
  afterEach(() => vi.useRealTimers());
  it("formats numbers and percentages for both locales", () => {
    expect(formatMetricValue(1234.5, "ko")).toBe("1,234.5");
    expect(formatMetricValue(1234.5, "en")).toBe("1,234.5");
    expect(formatRatio(0.187, "ko")).toBe("18.7%");
    expect(formatRatio(0.187, "en")).toBe("18.7%");
  });

  it("formats Korean and English timestamps without changing timezone semantics", () => {
    const iso = "2026-09-08T00:40:00Z";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:40:00Z"));
    const ko = toViewTimestamp(iso, "Asia/Seoul", "ko");
    const en = toViewTimestamp(iso, "Asia/Seoul", "en");
    expect(ko?.absoluteLabel).toContain("2026");
    expect(en?.absoluteLabel).toContain("2026");
    expect(ko?.relativeLabel).toBe("2일 전");
    expect(en?.relativeLabel).toBe("2 days ago");
  });

  it.each([
    ["2026-09-08T12:00:00Z", "방금 전", "Just now"],
    ["2026-09-08T11:59:55Z", "방금 전", "Just now"],
    ["2026-09-08T12:00:05Z", "방금 전", "Just now"],
    ["2026-09-08T11:59:15Z", "45초 전", "45 seconds ago"],
    ["2026-09-08T12:00:45Z", "45초 후", "in 45 seconds"],
    ["2026-09-08T11:55:00Z", "5분 전", "5 minutes ago"],
  ])("formats relative direction for %s", (iso, korean, english) => {
    const now = new Date("2026-09-08T12:00:00Z");
    expect(formatRelativeTime(iso, "ko", now)).toBe(korean);
    expect(formatRelativeTime(iso, "en", now)).toBe(english);
  });

  it("keeps invalid relative timestamps as an em dash", () => {
    expect(formatRelativeTime("invalid", "ko")).toBe("—");
    expect(formatRelativeTime("invalid", "en")).toBe("—");
  });
});
