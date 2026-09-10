import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const OPERATOR = process.env.B05_BROWSER_OPERATOR;
const APPROVER = process.env.B05_BROWSER_APPROVER;
const SYNTHETIC_CREDENTIAL = process.env.B02_BROWSER_PASSWORD;
const REPOSITORY = path.resolve(process.cwd(), "../..");
const SCREENSHOTS = path.join(REPOSITORY, "docs/assets/implementation");

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByLabel("Username or email", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(SYNTHETIC_CREDENTIAL!);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/overview\?tenant=tenant-a&site=site-a/);
}

async function csrf(request: APIRequestContext) {
  const response = await request.get("/api/v1/auth/csrf");
  expect(response.status()).toBe(200);
  const value = await response.json() as { headerName: string; token: string };
  return { [value.headerName]: value.token };
}

async function requestCommand(request: APIRequestContext, key: string, type: "OPEN" | "CLOSE" = "OPEN") {
  return request.post("/api/v1/commands?tenantId=tenant-a", {
    headers: { ...(await csrf(request)), "Idempotency-Key": key },
    data: { siteId: "site-a", deviceId: "valve-a-01", type, scenario: "SUCCESS" },
  });
}

test("B05 browser approval journey and API safety boundary", async ({ page, context, browser }) => {
  test.skip(!OPERATOR || !APPROVER || !SYNTHETIC_CREDENTIAL, "B05 synthetic credentials are required");
  mkdirSync(SCREENSHOTS, { recursive: true });
  const seriousErrors: string[] = [];
  page.on("console", (message) => { if (["error", "assert"].includes(message.type())) seriousErrors.push(message.text()); });
  page.on("pageerror", (error) => seriousErrors.push(error.message));
  await login(page, OPERATOR!);

  // G1: authenticated tenant/site/device scope is authoritative.
  expect((await context.request.get("/api/v1/commands?tenantId=tenant-b&siteId=site-b")).status()).toBe(403);

  // G2: same semantic request converges; a changed payload under the key conflicts.
  const key = `b05-idempotency-${Date.now()}`;
  const first = await requestCommand(context.request, key);
  expect(first.status()).toBe(201);
  const firstBody = await first.json() as { commandId: string };
  const repeat = await requestCommand(context.request, key);
  expect(repeat.status()).toBe(200);
  expect((await repeat.json()).commandId).toBe(firstBody.commandId);
  const mismatch = await requestCommand(context.request, key, "CLOSE");
  expect(mismatch.status()).toBe(409);
  expect((await mismatch.json()).code).toBe("IDEMPOTENCY_PAYLOAD_MISMATCH");

  // G3: request permission does not imply approval permission.
  expect((await context.request.post(`/api/v1/commands/${firstBody.commandId}/approve?tenantId=tenant-a`,
    { headers: await csrf(context.request), data: {} })).status()).toBe(403);
  // Chromium reports expected 4xx security probes as resource errors. They are
  // asserted above and are not UI runtime failures; start the visual journey's
  // serious-error window after those negative probes settle.
  await page.waitForTimeout(100);
  seriousErrors.length = 0;

  await page.goto("/commands?tenant=tenant-a&site=site-a");
  await expect(page.getByTestId("command-list-screen")).toBeVisible();
  const before = await context.request.get("/api/v1/commands?tenantId=tenant-a&siteId=site-a");
  const known = new Set(((await before.json()) as { items: Array<{ commandId: string }> }).items.map((item) => item.commandId));
  await page.getByRole("button", { name: "밸브 열기", exact: true }).click();
  let journeyId = "";
  await expect.poll(async () => {
    const response = await context.request.get("/api/v1/commands?tenantId=tenant-a&siteId=site-a");
    const items = ((await response.json()) as { items: Array<{ commandId: string; status: string }> }).items;
    journeyId = items.find((item) => !known.has(item.commandId) && item.status === "PENDING_APPROVAL")?.commandId ?? "";
    return Boolean(journeyId);
  }, { timeout: 10_000 }).toBe(true);
  const journeyCard = page.locator(`[data-testid="command-${journeyId}"]`);
  await expect(journeyCard.getByText("PENDING_APPROVAL", { exact: true }).first()).toBeVisible();
  await journeyCard.screenshot({ path: path.join(SCREENSHOTS, "command-pending-approval-ko.png") });

  const approverContext = await browser.newContext();
  const approverPage = await approverContext.newPage();
  approverPage.on("console", (message) => { if (["error", "assert"].includes(message.type())) seriousErrors.push(message.text()); });
  approverPage.on("pageerror", (error) => seriousErrors.push(error.message));
  await login(approverPage, APPROVER!);
  await approverPage.goto("/commands?tenant=tenant-a&site=site-a");
  // G4: an approver rejection is terminal and is never eligible for dispatch.
  const rejectedCard = approverPage.locator(`[data-testid="command-${firstBody.commandId}"]`);
  await rejectedCard.getByRole("button", { name: "거절", exact: true }).click();
  await expect(rejectedCard.getByText("REJECTED", { exact: true }).first()).toBeVisible();
  const approverCard = approverPage.locator(`[data-testid="command-${journeyId}"]`);
  await approverCard.getByRole("button", { name: "승인", exact: true }).click();

  // G7: ACKNOWLEDGED is observed as a distinct non-terminal state before SUCCEEDED.
  await expect.poll(async () => {
    const response = await approverContext.request.get(`/api/v1/commands/${journeyId}?tenantId=tenant-a`);
    return (await response.json()).status;
  }, { timeout: 10_000, intervals: [50, 50, 100, 100] }).toBe("ACKNOWLEDGED");
  await expect(approverCard.getByText("SUCCEEDED", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  const detail = await approverContext.request.get(`/api/v1/commands/${journeyId}?tenantId=tenant-a`);
  const transitions = (await detail.json()).transitions as Array<{ toStatus: string; occurredAt: string }>;
  expect(transitions.map((item) => item.toStatus)).toEqual([
    "PENDING_APPROVAL", "APPROVED", "DISPATCHING", "ACKNOWLEDGED", "SUCCEEDED",
  ]);
  expect(new Date(transitions[3].occurredAt).getTime()).toBeLessThan(new Date(transitions[4].occurredAt).getTime());
  await approverCard.screenshot({ path: path.join(SCREENSHOTS, "command-succeeded-timeline-ko.png") });
  await approverContext.close();
  expect(seriousErrors).toEqual([]);
});
