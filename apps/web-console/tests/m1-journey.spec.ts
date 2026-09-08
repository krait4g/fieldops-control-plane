import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const TENANT = "tenant-demo";
const SITE = "site-green-valley";
const OTHER_SITE = "site-research-greenhouse";
const RANGE = "24h";

type RealtimeApi = {
  emit: (event: unknown) => void;
  error: () => void;
  open: () => void;
};

async function emitRealtime(page: Page, event: unknown) {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __fieldopsRealtime?: unknown }).__fieldopsRealtime),
  );
  await page.evaluate((nextEvent) => {
    (window as unknown as { __fieldopsRealtime: RealtimeApi }).__fieldopsRealtime.emit(nextEvent);
  }, event);
}

function stateEvent(version: number, value: number, siteId = SITE) {
  return {
    eventId: `evt-${version}`,
    eventType: "device.state.updated",
    tenantId: TENANT,
    siteId,
    resourceType: "DEVICE",
    resourceId: "device-soil-01",
    version,
    stateEpoch: "fixture:normalized:1",
    revision: version,
    occurredAt: "2026-09-03T04:31:00Z",
    payload: {
      connectivity: "ONLINE",
      readiness: "READY",
      freshness: "FRESH",
      source: "REDIS_REALTIME",
      observedAt: "2026-09-03T04:30:59Z",
      receivedAt: "2026-09-03T04:31:00Z",
      staleAt: "2026-09-03T04:31:30Z",
      metrics: [
        {
          code: "soil.moisture.pct",
          displayName: "Soil moisture",
          value,
          unit: "%",
          quality: "GOOD",
          observedAt: "2026-09-03T04:30:59Z",
        },
      ],
    },
  };
}

function snapshotRequiredEvent() {
  return {
    eventId: "evt-reset",
    eventType: "snapshot-required",
    tenantId: TENANT,
    siteId: SITE,
    resourceType: "SITE",
    resourceId: SITE,
    version: 0,
    stateEpoch: "fixture:control:1",
    revision: 0,
    occurredAt: "2026-09-03T04:32:00Z",
    payload: { reason: "REPLAY_WINDOW_EXPIRED", lastAvailableEventId: null },
  };
}

test.describe("Korean/English locale", () => {
  test("defaults to Korean and persists an accessible English switch across reload", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto(`/overview?tenant=${TENANT}&site=${SITE}&range=${RANGE}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "장비", exact: true })).toBeVisible();

    const userMenu = page.getByRole("button", { name: /사용자 메뉴 열기/ });
    await userMenu.click();
    const english = page.getByRole("menuitemradio", { name: "English" });
    await expect(english).toHaveAttribute("aria-checked", "false");
    await english.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("link", { name: "Devices", exact: true })).toBeVisible();

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("link", { name: "Devices", exact: true })).toBeVisible();

    await page.getByRole("button", { name: /Open user menu for/ }).click();
    await page.getByRole("menuitemradio", { name: "한국어" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  });
});

test.describe("M1 fixture product journey", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ name: "fieldops-locale", value: "en", url: "http://localhost:3000" }]);
  });

  test("login → overview → devices → device detail → members", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("fixture-session-selector")).toBeVisible();
    await page.getByRole("button", { name: /Tenant admin/ }).click();

    await expect(page).toHaveURL(/\/overview/);
    await expect(page.getByTestId("overview-page")).toBeVisible();
    await expect(page.getByTestId("kpi-card")).toHaveCount(4);
    await expect(page.getByTestId("live-indicator")).toContainText("Live", { timeout: 10_000 });

    await page.getByRole("link", { name: "Devices", exact: true }).click();
    await expect(page).toHaveURL(/\/devices\?/);
    await expect(page.getByTestId("device-table")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Devices" })).toBeFocused();
    await expect(page.getByRole("row")).toHaveCount(4);

    const deviceLink = page.locator('a[href*="/devices/device-soil-01"]').first();
    await deviceLink.press("Enter");
    await expect(page).toHaveURL(/\/devices\/device-soil-01/);
    await expect(page.getByTestId("device-detail-page")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
    await expect(page.getByText(/^18\.7/)).toBeVisible();

    await page.getByRole("link", { name: "Members & Access", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/members/);
    await expect(page.getByTestId("member-table")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Members & Access" })).toBeFocused();
    await expect(page.getByTestId("member-table")).toContainText("admin@fieldops.local");
    await expect(page.getByTestId("live-indicator")).toContainText("Snapshot");
  });

  test("viewer has no members navigation", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /Tenant viewer/ }).click();
    await expect(page).toHaveURL(/\/overview/);
    await expect(page.getByRole("link", { name: "Members & Access" })).toHaveCount(0);
  });

  test("initial snapshot completes before the stream can become live", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __fieldopsFixtureScenario?: string }).__fieldopsFixtureScenario =
        "overview-delay";
    });
    await page.goto(`/overview?tenant=${TENANT}&site=${SITE}&range=${RANGE}`);

    await expect(page.getByTestId("live-indicator")).toContainText("Snapshot");
    await expect(page.getByTestId("live-indicator")).not.toContainText("Live");
    await expect(page.getByTestId("overview-page")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("live-indicator")).toContainText("Live", { timeout: 10_000 });
  });

  test("higher version event updates device state and lower version is ignored", async ({ page }) => {
    await page.goto(`/devices/device-soil-01?tenant=${TENANT}&site=${SITE}&range=${RANGE}`);
    await expect(page.getByTestId("device-detail-page")).toBeVisible();
    await expect(page.getByTestId("live-indicator")).toContainText("Live", { timeout: 10_000 });
    await expect(page.getByText(/^18\.7/)).toBeVisible();

    await emitRealtime(page, stateEvent(1825, 19.2));
    await expect(page.getByText(/^19\.2/)).toBeVisible();

    await emitRealtime(page, stateEvent(1823, 17.8));
    await expect(page.getByText(/^19\.2/)).toBeVisible();
    await expect(page.getByText(/^17\.8/)).toHaveCount(0);
  });

  test("error reconnects and snapshot-required recovers only after REST succeeds", async ({ page }) => {
    await page.goto(`/overview?tenant=${TENANT}&site=${SITE}&range=${RANGE}`);
    await expect(page.getByTestId("overview-page")).toBeVisible();
    await expect(page.getByTestId("live-indicator")).toContainText("Live", { timeout: 10_000 });

    await page.evaluate(() => {
      (window as unknown as { __fieldopsRealtime: RealtimeApi }).__fieldopsRealtime.error();
    });
    await expect(page.getByTestId("live-indicator")).toContainText("Reconnecting");

    await page.evaluate(() => {
      (window as unknown as { __fieldopsRealtime: RealtimeApi }).__fieldopsRealtime.open();
    });
    await expect(page.getByTestId("live-indicator")).toContainText("Live", { timeout: 10_000 });

    await emitRealtime(page, snapshotRequiredEvent());
    await expect(page.getByTestId("live-indicator")).toContainText("Live", { timeout: 10_000 });
  });

  test("failed snapshot recovery retains stale data and Retry restores live", async ({ page }) => {
    await page.goto(`/overview?tenant=${TENANT}&site=${SITE}&range=${RANGE}`);
    await expect(page.getByTestId("live-indicator")).toContainText("Live", { timeout: 10_000 });
    await expect(page.getByTestId("kpi-card")).toHaveCount(4);

    await page.evaluate(() => {
      (window as unknown as { __fieldopsFixtureScenario?: string }).__fieldopsFixtureScenario =
        "overview-fail";
    });
    await emitRealtime(page, snapshotRequiredEvent());

    await expect(page.getByTestId("live-indicator")).toContainText("Disconnected");
    await expect(page.getByTestId("snapshot-stale-banner")).toBeVisible();
    await expect(page.getByTestId("kpi-card")).toHaveCount(4);

    await page.evaluate(() => {
      (window as unknown as { __fieldopsFixtureScenario?: string }).__fieldopsFixtureScenario = "normal";
    });
    await page.getByTestId("live-indicator").getByRole("button", { name: "Retry" }).click();
    await expect(page.getByTestId("live-indicator")).toContainText("Live", { timeout: 10_000 });
    await expect(page.getByTestId("snapshot-stale-banner")).toHaveCount(0);
  });

  test("browser offline closes realtime and online revalidates before live", async ({ page, context }) => {
    await page.goto(`/overview?tenant=${TENANT}&site=${SITE}&range=${RANGE}`);
    await expect(page.getByTestId("live-indicator")).toContainText("Live", { timeout: 10_000 });

    await context.setOffline(true);
    await expect(page.getByTestId("live-indicator")).toContainText("Disconnected");
    await expect(page.getByTestId("snapshot-stale-banner")).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByTestId("live-indicator")).toContainText("Live", { timeout: 10_000 });
    await expect(page.getByTestId("snapshot-stale-banner")).toHaveCount(0);
  });

  test("site change rejects an event from the previous site", async ({ page }) => {
    await page.goto(`/devices/device-soil-01?tenant=${TENANT}&site=${SITE}&range=${RANGE}`);
    await expect(page.getByTestId("live-indicator")).toContainText("Live", { timeout: 10_000 });
    await page.getByLabel("Site").selectOption(OTHER_SITE);
    await expect(page).toHaveURL(new RegExp(`site=${OTHER_SITE}`));
    await expect(page.getByTestId("live-indicator")).toContainText("Live", { timeout: 10_000 });
    await expect(page.getByText(/^18\.7/)).toBeVisible();

    await emitRealtime(page, stateEvent(9000, 99.9, SITE));
    await expect(page.getByText(/^18\.7/)).toBeVisible();
    await expect(page.getByText(/^99\.9/)).toHaveCount(0);
  });

  test("device text filters stay synchronized with clear and browser history", async ({ page }) => {
    await page.goto(`/devices?tenant=${TENANT}&site=${SITE}`);
    const search = page.getByRole("searchbox", { name: "Search" });
    await expect(search).toHaveValue("");

    await search.fill("Soil");
    await expect(page).toHaveURL(/query=Soil/);
    await expect(search).toBeFocused();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(search).toHaveValue("");
    await expect(page).not.toHaveURL(/query=/);
    await page.waitForTimeout(400);
    await expect(page).not.toHaveURL(/query=/);

    await page.evaluate(() => {
      window.history.pushState(
        null,
        "",
        "/devices?tenant=tenant-demo&site=site-green-valley&query=Weather",
      );
    });
    await expect(search).toHaveValue("Weather");
    await page.goBack();
    await expect(search).toHaveValue("");
    await page.waitForTimeout(400);
    await expect(page).not.toHaveURL(/query=/);

    await page.goForward();
    await expect(search).toHaveValue("Weather");
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/query=Weather/);

    await page.goBack();
    await expect(search).toHaveValue("");
    await search.fill("S");
    await page.evaluate(() => {
      window.history.pushState(
        null,
        "",
        "/devices/device-soil-01?tenant=tenant-demo&site=site-green-valley&range=24h",
      );
    });
    await expect(page).toHaveURL(/\/devices\/device-soil-01/);
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/\/devices\/device-soil-01/);
  });

  test("device permission failure does not expose same-scope placeholder rows", async ({ page }) => {
    await page.goto(`/devices?tenant=${TENANT}&site=${SITE}`);
    await expect(page.getByTestId("device-table")).toContainText("Soil Sensor #1");

    await page.evaluate(() => {
      (window as unknown as { __fieldopsFixtureScenario?: string }).__fieldopsFixtureScenario =
        "devices-forbidden";
    });
    await page.getByRole("searchbox", { name: "Search" }).fill("Weather");
    await expect(page).toHaveURL(/query=Weather/);
    await expect(page.getByText("Device access denied")).toBeVisible();
    await expect(page.getByTestId("device-table")).toHaveCount(0);
  });

  test("device filtering keeps only same-scope rows while the next snapshot loads", async ({ page }) => {
    await page.goto(`/devices?tenant=${TENANT}&site=${SITE}`);
    await expect(page.getByTestId("device-table")).toContainText("Soil Sensor #1");

    await page.evaluate(() => {
      (window as unknown as { __fieldopsFixtureScenario?: string }).__fieldopsFixtureScenario =
        "devices-delay";
    });
    await page.getByRole("searchbox", { name: "Search" }).fill("Weather");
    await expect(page).toHaveURL(/query=Weather/);
    await expect(page.getByTestId("device-table")).toContainText("Soil Sensor #1");
    await expect(page.getByTestId("device-table")).not.toContainText("Soil Sensor #1", {
      timeout: 5_000,
    });
    await expect(page.getByTestId("device-table")).toContainText("Weather Station #1");
  });

  test("mobile drawer, keyboard focus and horizontal table remain usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/devices?tenant=${TENANT}&site=${SITE}`);
    await expect(page.getByTestId("device-table")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Open user menu for/ })).toBeVisible();

    await page.getByRole("button", { name: "Open navigation" }).click();
    const drawer = page.getByRole("dialog", { name: "Navigation drawer" });
    const closeNavigation = page.getByRole("button", { name: "Close navigation", exact: true });
    await expect(drawer).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await expect(closeNavigation).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(drawer.getByRole("link", { name: "Members & Access" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(closeNavigation).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(drawer.getByRole("link", { name: "Overview" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();

    const deviceLink = page.locator('a[href*="/devices/device-soil-01"]').first();
    await deviceLink.focus();
    const focusStyle = await deviceLink.evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(focusStyle.style).not.toBe("none");
    expect(focusStyle.width).toBeGreaterThanOrEqual(2);

    const scrollContainer = page.getByRole("table", { name: "Devices" }).locator("..");
    expect(
      await scrollContainer.evaluate((element) => element.scrollWidth > element.clientWidth),
    ).toBe(true);

    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(drawer).toBeVisible();
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(drawer).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");
    await expect(page.getByTestId("app-shell-content")).not.toHaveAttribute("inert", "");
    await expect(page.getByTestId("app-shell-content")).not.toHaveAttribute("aria-hidden", "true");
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  });

  test("enabled axe WCAG A/AA rules have no critical or serious violations", async ({ browser }) => {
    test.slow();
    const routes = ["/login", "/overview", "/devices", "/devices/device-soil-01", "/admin/members"];
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      for (const path of routes) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        try {
          const range = path === "/overview" || path.startsWith("/devices/")
            ? `&range=${RANGE}`
            : "";
          const query = path === "/login" ? "" : `?tenant=${TENANT}&site=${SITE}${range}`;
          await page.goto(`${path}${query}`);
          await page.waitForLoadState("networkidle");
          const readyMarker = path === "/overview"
            ? "overview-page"
            : path === "/devices"
              ? "device-table"
              : path.startsWith("/devices/")
                ? "device-detail-page"
                : path === "/admin/members"
                  ? "member-table"
                  : null;
          if (readyMarker) {
            await expect(page.getByTestId(readyMarker)).toBeVisible();
          } else {
            await expect(page.getByTestId("fixture-session-selector")).toBeVisible();
          }
          await expect(page).toHaveTitle("FieldOps Console");
          const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
          expect(
            results.violations.filter((violation) =>
              ["critical", "serious"].includes(violation.impact ?? ""),
            ),
            `${viewport.width}x${viewport.height} ${path}`,
          ).toEqual([]);
        } finally {
          await context.close();
        }
      }
    }
  });
});
