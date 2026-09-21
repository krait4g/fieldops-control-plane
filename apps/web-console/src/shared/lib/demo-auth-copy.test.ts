import { describe, expect, it } from "vitest";
import { demoAuthCopy } from "./demo-auth-copy";

describe("demo auth copy", () => {
  it("distinguishes demo user switching from real logout in both locales", () => {
    expect(demoAuthCopy.ko.switchUser).toBe("데모 사용자 변경");
    expect(demoAuthCopy.en.switchUser).toBe("Switch demo user");
    expect(demoAuthCopy.ko.switchUser).not.toContain("로그아웃");
    expect(demoAuthCopy.en.switchUser.toLowerCase()).not.toContain("sign out");
  });
});
