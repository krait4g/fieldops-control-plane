import { describe, expect, it } from "vitest";
import { liveStatusView } from "./live-indicator";

describe("liveStatusView", () => {
  it("maps SNAPSHOT to a neutral non-live state", () => {
    expect(liveStatusView("SNAPSHOT")).toEqual({ label: "Snapshot", tone: "neutral", pulse: false });
  });

  it("maps CONNECTING / RECONNECTING as pre-live", () => {
    expect(liveStatusView("CONNECTING").tone).toBe("info");
    expect(liveStatusView("RECONNECTING").tone).toBe("warning");
  });

  it("maps LIVE as success", () => {
    expect(liveStatusView("LIVE").tone).toBe("success");
    expect(liveStatusView("LIVE").pulse).toBe(true);
  });

  it("maps DISCONNECTED as critical", () => {
    expect(liveStatusView("DISCONNECTED").tone).toBe("critical");
  });
});