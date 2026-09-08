import { describe, expect, it } from "vitest";
import { catalogs, copyKeys, defaultLocale, formatCopy, isLocale } from "./copy";

describe("locale catalogs", () => {
  it("uses Korean as the default locale", () => {
    expect(defaultLocale).toBe("ko");
  });

  it("keeps Korean and English keys in exact parity", () => {
    expect(copyKeys(catalogs.ko).sort()).toEqual(copyKeys(catalogs.en).sort());
  });

  it("accepts only supported locales and interpolates named values", () => {
    expect(isLocale("ko")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("ja")).toBe(false);
    expect(formatCopy(catalogs.ko.overview.ofDevices, { count: 3 })).toContain("3");
  });
});
