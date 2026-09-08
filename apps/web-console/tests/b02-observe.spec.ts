import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const USERNAME = process.env.B02_BROWSER_USERNAME;
const SYNTHETIC_CREDENTIAL = process.env.B02_BROWSER_PASSWORD;
const REPOSITORY = path.resolve(process.cwd(), "../..");

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "fieldops-locale", value: "en", url: "http://localhost:3000" }]);
});

async function login(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Username or email", { exact: true }).fill(USERNAME!);
  await page.getByLabel("Password", { exact: true }).fill(SYNTHETIC_CREDENTIAL!);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/overview\?tenant=tenant-a&site=site-a/);
}

test("Keycloak login → Remote Observe journey → scoped logout", async ({ page, context }) => {
  test.skip(!USERNAME || !SYNTHETIC_CREDENTIAL, "B02 synthetic browser credentials are required");

  await page.goto("/login");
  const authorization = page.waitForRequest((request) =>
    request.url().includes("/protocol/openid-connect/auth"),
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const authorizationUrl = new URL((await authorization).url());
  expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
  expect(authorizationUrl.searchParams.get("code_challenge")).toBeTruthy();

  await page.getByLabel("Username or email", { exact: true }).fill(USERNAME!);
  await page.getByLabel("Password", { exact: true }).fill(SYNTHETIC_CREDENTIAL!);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/overview\?tenant=tenant-a&site=site-a/);
  await expect(page.getByTestId("overview-page")).toBeVisible();
  await expect(page.getByText("Demo data", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("live-indicator")).toContainText("Live", { timeout: 15_000 });

  const crossTenant = await context.request.get(
    "/api/v1/dashboard/overview?tenantId=tenant-b&siteId=site-b&range=PT24H",
  );
  expect(crossTenant.status()).toBe(403);
  const crossTenantStream = await context.request.get(
    "/api/v1/events/stream?tenantId=tenant-b&siteId=site-b",
    { timeout: 10_000 },
  );
  expect(crossTenantStream.status()).toBe(403);

  const filteredDevices = await context.request.get(
    "/api/v1/devices?tenantId=tenant-a&siteId=site-a&deviceType=soil&protocol=MQTT&pageSize=1",
  );
  expect(filteredDevices.status()).toBe(200);
  const firstDevicePage = await filteredDevices.json() as {
    items: unknown[]; total: number; page: { hasNext: boolean; nextCursor: string };
  };
  expect(firstDevicePage.items).toHaveLength(1);
  expect(firstDevicePage.total).toBe(3);
  expect(firstDevicePage.page.hasNext).toBe(true);
  const nextDevices = await context.request.get(
    `/api/v1/devices?tenantId=tenant-a&siteId=site-a&deviceType=soil&protocol=MQTT&pageSize=1&cursor=${encodeURIComponent(firstDevicePage.page.nextCursor)}`,
  );
  expect(nextDevices.status()).toBe(200);
  expect((await nextDevices.json()).items).toHaveLength(1);

  const members = await context.request.get(
    "/api/v1/members?tenantId=tenant-a&siteId=site-a&status=ACTIVE&pageSize=1",
  );
  expect(members.status()).toBe(200);
  const firstMemberPage = await members.json() as {
    items: unknown[]; total: number; page: { hasNext: boolean; nextCursor: string };
  };
  expect(firstMemberPage.items).toHaveLength(1);
  expect(firstMemberPage.total).toBe(2);
  expect(firstMemberPage.page.nextCursor).toBeTruthy();

  await page.getByRole("link", { name: "Devices", exact: true }).click();
  await expect(page.getByTestId("device-table")).toBeVisible();
  const chartRequest = page.waitForRequest((request) =>
    request.url().includes("/devices/device-a-soil-01/telemetry/series"),
  );
  await page.getByRole("link", { name: /A Soil Sensor 01/ }).click();
  const chartUrl = new URL((await chartRequest).url());
  expect(chartUrl.searchParams.get("range")).toBe("PT24H");
  expect(chartUrl.searchParams.get("bucket")).toBe("PT5M");
  await expect(page.getByTestId("device-detail-page")).toBeVisible();
  const before = await page.getByTestId("device-detail-page").innerText();
  const nextStateEvent = page.evaluate(() => new Promise<Record<string, unknown>>((resolve, reject) => {
    (window as typeof window & { __b02SseReady?: boolean }).__b02SseReady = false;
    const source = new EventSource("/api/v1/events/stream?tenantId=tenant-a&siteId=site-a");
    source.onopen = () => {
      (window as typeof window & { __b02SseReady?: boolean }).__b02SseReady = true;
    };
    const timer = window.setTimeout(() => {
      source.close();
      reject(new Error("Timed out waiting for the actual state SSE event"));
    }, 15_000);
    source.addEventListener("device.state.updated", (message) => {
      window.clearTimeout(timer);
      source.close();
      resolve(JSON.parse((message as MessageEvent<string>).data) as Record<string, unknown>);
    });
  }));
  await page.waitForFunction(() =>
    (window as typeof window & { __b02SseReady?: boolean }).__b02SseReady === true,
  );

  execFileSync("py", ["-3", "scripts/b02_observe.py", "demo", "--device", "device-a-soil-01",
    "--count", "1", "--seed", Date.now().toString(), "--interval-ms", "0"],
  { cwd: REPOSITORY, stdio: "pipe", timeout: 20_000 });

  const stateEvent = await nextStateEvent;
  expect(stateEvent.eventType).toBe("device.state.updated");
  expect(stateEvent.tenantId).toBe("tenant-a");
  expect(stateEvent.resourceId).toBe("device-a-soil-01");
  const emittedMetrics = (stateEvent.payload as {
    metrics: Array<{ code: string; value: number; unit: string }>;
  }).metrics;
  expect(emittedMetrics).toHaveLength(2);

  await expect.poll(async () => page.getByTestId("device-detail-page").innerText(), {
    timeout: 20_000,
  }).not.toBe(before);
  const renderedDetail = await page.getByTestId("device-detail-page").innerText();
  for (const metric of emittedMetrics) {
    const formatted = metric.value.toLocaleString("en-US", { maximumFractionDigits: 1 });
    expect(renderedDetail).toContain(metric.code === "soil.moisture.pct" ? "Soil moisture" : "Soil temperature");
    expect(renderedDetail).toContain(formatted);
  }
  await expect(page.getByTestId("live-indicator")).toContainText("Live");
  await expect(page.getByTestId("device-detail-page")).toContainText("Realtime state");
  await expect(page.getByText("Telemetry trend")).toBeVisible();
  const bucketedSeries = await context.request.get(
    "/api/v1/devices/device-a-soil-01/telemetry/series?tenantId=tenant-a&range=PT1H&bucket=PT1M&metrics=soil.moisture.pct",
  );
  expect(bucketedSeries.status()).toBe(200);
  const bucketedBody = await bucketedSeries.json();
  expect(bucketedBody.context.bucket).toBe("PT1M");
  expect(bucketedBody.series[0].aggregation).toBe("AVG");

  await page.getByRole("link", { name: "Members & Access", exact: true }).click();
  await expect(page.getByTestId("member-table")).toContainText("Alicia Admin");

  const secondTab = await context.newPage();
  await secondTab.goto("/overview?tenant=tenant-a&site=site-a&range=PT24H");
  await expect(secondTab.getByTestId("overview-page")).toBeVisible();
  await secondTab.close();

  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.getByTestId("overview-page")).toBeVisible();
  await expect(page.getByTestId("live-indicator")).toContainText("Live", { timeout: 15_000 });
  const screenshotDir = path.resolve(REPOSITORY, "test-results/local-observe");
  mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, "B02-overview.png"), fullPage: true });

  await page.getByRole("button", { name: /Open user menu/ }).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  const sessionAfterLogout = await context.request.get("/api/v1/session");
  expect(sessionAfterLogout.status()).toBe(401);
});

test("Redis outage serves an explicit stale PostgreSQL snapshot", async ({ page, context }) => {
  test.skip(process.env.B02_REDIS_OUTAGE !== "1", "Run only while the task-owned Redis is stopped");
  test.skip(!USERNAME || !SYNTHETIC_CREDENTIAL, "B02 synthetic browser credentials are required");

  await login(page);
  const response = await context.request.get(
    "/api/v1/devices/device-a-soil-02/state?tenantId=tenant-a",
  );
  expect(response.status()).toBe(200);
  const state = await response.json();
  expect(state.source).toBe("POSTGRES_SNAPSHOT");
  expect(state.freshness).toBe("STALE");

  await page.goto("/devices/device-a-soil-02?tenant=tenant-a&site=site-a&range=PT24H");
  await expect(page.getByTestId("device-detail-page")).toContainText("Database snapshot");
  await expect(page.getByTestId("device-detail-page")).toContainText("Stale");
});
