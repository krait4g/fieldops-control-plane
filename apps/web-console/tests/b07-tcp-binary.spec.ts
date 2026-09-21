import { expect, test } from "@playwright/test";

const USERNAME = process.env.B02_BROWSER_USERNAME;
const SYNTHETIC_CREDENTIAL = process.env.B02_BROWSER_PASSWORD;

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "fieldops-locale", value: "ko", url: "http://localhost:3000" }]);
});

test("actual TCP/Binary telemetry is visible in the existing Device Detail", async ({ page, context }) => {
  test.skip(!USERNAME || !SYNTHETIC_CREDENTIAL, "B07 synthetic browser credentials are required");
  const seriousErrors: string[] = [];
  page.on("console", (message) => { if (["error", "assert"].includes(message.type())) seriousErrors.push(message.text()); });
  page.on("pageerror", (error) => seriousErrors.push(error.message));

  await page.goto("/login");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByLabel("Username or email", { exact: true }).fill(USERNAME!);
  await page.getByLabel("Password", { exact: true }).fill(SYNTHETIC_CREDENTIAL!);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/overview\?tenant=tenant-a&site=site-a/);

  const scoped = await context.request.get(
    "/api/v1/devices?tenantId=tenant-a&siteId=site-a&protocol=TCP_BINARY&pageSize=20",
  );
  expect(scoped.status()).toBe(200);
  const body = await scoped.json() as { items: Array<{ id: string; protocol: string }> };
  expect(body.items).toHaveLength(1);
  expect(body.items[0]).toMatchObject({ id: "device-a-soil-tcp-01", protocol: "TCP_BINARY" });

  await page.goto("/devices?tenant=tenant-a&site=site-a&protocol=TCP_BINARY");
  await expect(page.getByTestId("device-table")).toContainText("A Soil Sensor TCP 01");
  await page.getByRole("link", { name: /A Soil Sensor TCP 01/ }).click();
  await expect(page.getByTestId("device-detail-page")).toBeVisible();
  await expect(page.getByTestId("device-detail-page")).toContainText("TCP/Binary");
  await expect(page.getByTestId("device-detail-page")).toContainText("토양 수분");
  await expect(page.getByTestId("device-detail-page")).toContainText("토양 온도");
  await expect(page.getByTestId("live-indicator")).toContainText("실시간", { timeout: 15_000 });
  const before = await page.getByTestId("device-detail-page").innerText();
  await expect.poll(() => page.getByTestId("device-detail-page").innerText(), { timeout: 15_000 }).not.toBe(before);
  expect(seriousErrors).toEqual([]);
});
