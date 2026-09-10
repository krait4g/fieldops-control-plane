import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

const ADMIN = process.env.B02_BROWSER_USERNAME;
const VIEWER = process.env.B04_BROWSER_VIEWER;
const DEMO_PASSCODE = process.env.B02_BROWSER_PASSWORD;
const GATEWAY_PROOF = process.env.B04_INTERNAL_TOKEN;
const REPOSITORY = path.resolve(process.cwd(), "../..");
const SCREENSHOTS = path.join(REPOSITORY, ".fieldops-b04", "screenshots");
const PYTHON = process.platform === "win32"
  ? { executable: "py", prefix: ["-3"] }
  : { executable: "python3", prefix: [] };

async function login(page: Page, username: string): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByLabel("Username or email", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(DEMO_PASSCODE!);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/overview\?tenant=tenant-a&site=site-a/);
}

async function csrf(request: APIRequestContext): Promise<Record<string, string>> {
  const response = await request.get("/api/v1/auth/csrf");
  expect(response.status()).toBe(200);
  const body = await response.json() as { headerName: string; token: string };
  return { [body.headerName]: body.token };
}

async function acquire(request: APIRequestContext) {
  return request.post("/api/v1/cameras/camera-a-01/control-sessions?tenantId=tenant-a", {
    headers: await csrf(request),
  });
}

async function release(request: APIRequestContext, lease: { sessionId: string; generation: number }) {
  return request.delete(
    `/api/v1/cameras/camera-a-01/control-sessions/${lease.sessionId}?tenantId=tenant-a&generation=${lease.generation}`,
    { headers: await csrf(request) },
  );
}

async function openPtz(page: Page, lease: { websocketUrl: string }) {
  await page.evaluate((url) => new Promise<void>((resolve, reject) => {
    const state = window as typeof window & { __b04Socket?: WebSocket; __b04Messages?: unknown[] };
    state.__b04Messages = [];
    const socket = new WebSocket(url);
    state.__b04Socket = socket;
    socket.onmessage = (event) => state.__b04Messages!.push(JSON.parse(String(event.data)));
    socket.onopen = () => resolve();
    socket.onerror = () => reject(new Error("PTZ WebSocket failed to open"));
  }), lease.websocketUrl);
}

async function sendPtz(page: Page, lease: { sessionId: string; generation: number },
  message: Record<string, unknown>) {
  await page.evaluate(({ leaseValue, payload }) => {
    const state = window as typeof window & { __b04Socket?: WebSocket };
    state.__b04Socket?.send(JSON.stringify({ sessionId: leaseValue.sessionId,
      generation: leaseValue.generation, ...payload }));
  }, { leaseValue: lease, payload: message });
}

async function waitForMessage(page: Page, predicate: (message: Record<string, unknown>) => boolean) {
  await expect.poll(async () => page.evaluate(() =>
    ((window as typeof window & { __b04Messages?: Record<string, unknown>[] }).__b04Messages ?? [])),
  { timeout: 10_000 }).toContainEqual(expect.objectContaining({ type: expect.any(String) }));
  const messages = await page.evaluate(() =>
    ((window as typeof window & { __b04Messages?: Record<string, unknown>[] }).__b04Messages ?? []));
  await expect.poll(async () => {
    const current = await page.evaluate(() =>
      ((window as typeof window & { __b04Messages?: Record<string, unknown>[] }).__b04Messages ?? []));
    return current.some(predicate);
  }, { timeout: 10_000 }).toBe(true);
  return messages;
}

function fault(component: "ffmpeg" | "onvif", state: "down" | "up") {
  execFileSync(PYTHON.executable, [...PYTHON.prefix, "scripts/b04_camera.py", "fault", "--component", component,
    "--state", state], { cwd: REPOSITORY, stdio: "pipe", timeout: 60_000 });
}

async function expectLivePreview(page: Page): Promise<void> {
  const video = page.frameLocator("iframe[title='실시간 카메라 미리보기']").locator("video");
  await expect(video).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => video.evaluate((element) => {
    const value = element as HTMLVideoElement;
    return value.readyState >= 2 && value.videoWidth === 1280 && value.videoHeight === 720
      && value.currentTime > 0.5;
  }), { timeout: 20_000 }).toBe(true);
}

test("B04 G1-G9 camera safety matrix and browser journey", async ({ page, context, browser }) => {
  test.skip(!ADMIN || !VIEWER || !DEMO_PASSCODE || !GATEWAY_PROOF, "B04 synthetic credentials are required");
  mkdirSync(SCREENSHOTS, { recursive: true });
  await login(page, ADMIN!);

  // G1: REST scope and permission checks, including WebSocket handshake revalidation.
  expect((await context.request.get("/api/v1/cameras?tenantId=tenant-a&siteId=site-b")).status()).toBe(403);
  expect((await context.request.get("/api/v1/cameras?tenantId=tenant-b&siteId=site-b")).status()).toBe(403);
  const viewerContext: BrowserContext = await browser.newContext();
  const viewerPage = await viewerContext.newPage();
  await login(viewerPage, VIEWER!);
  expect((await viewerContext.request.get("/api/v1/cameras?tenantId=tenant-a&siteId=site-a")).status()).toBe(200);
  expect((await viewerContext.request.get("/api/v1/cameras?tenantId=tenant-b&siteId=site-b")).status()).toBe(403);
  expect((await acquire(viewerContext.request)).status()).toBe(403);
  await viewerPage.goto("/cameras/camera-a-01?tenant=tenant-a&site=site-a");
  await expect(viewerPage.getByText("이 계정은 카메라를 조회할 수 있지만 제어 권한은 없습니다.")).toBeVisible();
  const viewerSocketOpened = await viewerPage.evaluate(() => new Promise<boolean>((resolve) => {
    const socket = new WebSocket("ws://localhost:28082/api/v1/cameras/camera-a-01/ptz?tenantId=tenant-a&sessionId=00000000-0000-0000-0000-000000000000&generation=1");
    socket.onopen = () => { socket.close(); resolve(true); };
    socket.onerror = () => resolve(false);
    socket.onclose = () => resolve(false);
    window.setTimeout(() => resolve(false), 3000);
  }));
  expect(viewerSocketOpened).toBe(false);
  await viewerContext.close();

  await page.getByRole("link", { name: "카메라", exact: true }).click();
  await expect(page.getByTestId("camera-list-screen")).toBeVisible();
  await expect(page.getByText("Greenhouse Camera 01")).toBeVisible();
  await page.screenshot({ path: path.join(SCREENSHOTS, "B04-01-camera-list.png"), fullPage: true });
  await page.getByRole("link", { name: /Greenhouse Camera 01/ }).click();
  await expect(page.getByTestId("camera-detail-screen")).toBeVisible();
  await expectLivePreview(page);
  await page.screenshot({ path: path.join(SCREENSHOTS, "B04-02-webrtc-preview.png"), fullPage: true });

  // G2: one owner, conflict, release, and reacquire.
  const firstResponse = await acquire(context.request);
  expect(firstResponse.status()).toBe(201);
  const first = await firstResponse.json() as { sessionId: string; generation: number; websocketUrl: string };
  const conflict = await acquire(context.request);
  expect(conflict.status()).toBe(409);
  expect((await conflict.json()).code).toBe("CONTROL_LEASE_HELD");
  expect((await release(context.request, first)).status()).toBe(204);
  const secondResponse = await acquire(context.request);
  expect(secondResponse.status()).toBe(201);
  const second = await secondResponse.json() as { sessionId: string; generation: number; websocketUrl: string };
  expect(second.generation).toBeGreaterThan(first.generation);

  // G3: delayed MOVE and delayed STOP from the fenced generation are rejected at the gateway.
  for (const type of ["MOVE", "STOP"] as const) {
    const response = await context.request.post(
      "http://127.0.0.1:28081/internal/v1/cameras/camera-a-01/ptz",
      { headers: { "X-FieldOps-Internal-Token": GATEWAY_PROOF! }, data: {
        type, ownerId: "00000000-0000-0000-0000-0000000000a1", sessionId: first.sessionId,
        generation: first.generation, sequence: 20, pan: 0.8, tilt: 0, zoom: 0,
        timeoutMs: type === "MOVE" ? 500 : 0, reason: type === "STOP" ? "INPUT_RELEASED" : null,
      } },
    );
    expect(response.status()).toBe(200);
    expect((await response.json()).accepted).toBe(false);
  }

  // G4/G5: monotonic sequence, latest command, 400ms dead-man, and IDLE convergence.
  await openPtz(page, second);
  await sendPtz(page, second, { type: "MOVE", seq: 12, pan: 0.8, tilt: 0, zoom: 0, timeoutMs: 500 });
  await waitForMessage(page, (message) => message.type === "ACK" && message.seq === 12);
  await sendPtz(page, second, { type: "MOVE", seq: 11, pan: 0.2, tilt: 0, zoom: 0, timeoutMs: 500 });
  await sendPtz(page, second, { type: "MOVE", seq: 12, pan: 0.2, tilt: 0, zoom: 0, timeoutMs: 500 });
  await sendPtz(page, second, { type: "MOVE", seq: 13, pan: -0.5, tilt: 0, zoom: 0, timeoutMs: 500 });
  await waitForMessage(page, (message) => message.type === "ERROR" && message.code === "NON_MONOTONIC_SEQUENCE");
  await waitForMessage(page, (message) => message.type === "ACK" && message.seq === 13);
  await waitForMessage(page, (message) => message.type === "POSE" && message.moving === false);

  // G6: close while moving invokes best-effort STOP; lease can then be released and reacquired.
  await sendPtz(page, second, { type: "MOVE", seq: 14, pan: 0, tilt: 0.8, zoom: 0, timeoutMs: 500 });
  await waitForMessage(page, (message) => message.type === "ACK" && message.seq === 14);
  await page.evaluate(() => (window as typeof window & { __b04Socket?: WebSocket }).__b04Socket?.close());
  await expect.poll(async () => {
    const response = await context.request.get("/api/v1/cameras/camera-a-01/status?tenantId=tenant-a");
    return response.status() === 200 ? (await response.json()).pose.moving : true;
  }, { timeout: 3000 }).toBe(false);
  expect((await release(context.request, second)).status()).toBe(204);
  const thirdResponse = await acquire(context.request);
  expect(thirdResponse.status()).toBe(201);
  const third = await thirdResponse.json() as { sessionId: string; generation: number; websocketUrl: string };
  await release(context.request, third);

  // G7: ONVIF command failure is surfaced as ERROR, never as ACK/success.
  const failureLeaseResponse = await acquire(context.request);
  const failureLease = await failureLeaseResponse.json() as { sessionId: string; generation: number; websocketUrl: string };
  await openPtz(page, failureLease);
  try {
    fault("onvif", "down");
    await sendPtz(page, failureLease, { type: "MOVE", seq: 1, pan: 0.6, tilt: 0, zoom: 0, timeoutMs: 500 });
    await waitForMessage(page, (message) => message.type === "ERROR" && message.code === "DEVICE_UNAVAILABLE");
    const messages = await page.evaluate(() =>
      ((window as typeof window & { __b04Messages?: Record<string, unknown>[] }).__b04Messages ?? []));
    expect(messages.some((message) => message.type === "ACK" && message.seq === 1)).toBe(false);
  } finally {
    fault("onvif", "up");
  }
  await release(context.request, failureLease);

  // UI control proof and the third screenshot use the real application WebSocket.
  await page.reload();
  await page.getByRole("button", { name: "제어권 획득", exact: true }).click();
  await expect(page.getByText("제어 연결됨", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expectLivePreview(page);
  await page.getByRole("button", { name: "오른쪽으로 이동", exact: true }).dispatchEvent("pointerdown", { pointerId: 1 });
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "오른쪽으로 이동", exact: true }).dispatchEvent("pointerup", { pointerId: 1 });
  await page.screenshot({ path: path.join(SCREENSHOTS, "B04-03-control-active.png"), fullPage: true });
  await page.getByRole("button", { name: "제어권 해제", exact: true }).click();

  // G8: preview outage does not disable PTZ status/control or B02 Observe.
  try {
    fault("ffmpeg", "down");
    await page.reload();
    await expect(page.getByText("WebRTC 미리보기를 사용할 수 없습니다.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "제어권 획득", exact: true })).toBeEnabled();
    expect((await context.request.get("/api/v1/devices?tenantId=tenant-a&siteId=site-a&pageSize=1")).status()).toBe(200);
  } finally {
    fault("ffmpeg", "up");
  }

  // G9: ONVIF outage disables control while the independent WebRTC preview remains live.
  try {
    fault("onvif", "down");
    await page.reload();
    await expect(page.getByTestId("camera-preview")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "제어권 획득", exact: true })).toBeDisabled();
    expect((await context.request.get("/api/v1/cameras/camera-a-01/status?tenantId=tenant-a")).status()).toBe(503);
  } finally {
    fault("onvif", "up");
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByTestId("camera-detail-screen")).toBeVisible();
  await expectLivePreview(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: path.join(SCREENSHOTS, "B04-04-mobile-390.png"), fullPage: true });
});
