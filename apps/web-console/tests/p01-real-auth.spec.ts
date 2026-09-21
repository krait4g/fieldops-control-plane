import { expect, test } from "@playwright/test";

const USERNAME = process.env.B02_BROWSER_USERNAME;
const SYNTHETIC_CREDENTIAL = process.env.B02_BROWSER_PASSWORD;

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "fieldops-locale", value: "en", url: "http://localhost:3000" }]);
});

test("real Keycloak login preserves scoped CSRF logout", async ({ page, context }) => {
  test.skip(!USERNAME || !SYNTHETIC_CREDENTIAL, "B02 synthetic browser credentials are required");

  await page.goto("/login");
  await expect(page.getByTestId("fixture-session-selector")).toHaveCount(0);

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

  await page.getByRole("button", { name: /Open user menu for/ }).click();
  await expect(page.getByRole("menuitem", { name: "Switch demo user" })).toHaveCount(0);
  const logoutResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/v1/auth/logout"
      && response.request().method() === "POST",
  );
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  expect((await logoutResponse).status()).toBe(204);
  await expect(page).toHaveURL(/\/login/);

  const sessionAfterLogout = await context.request.get("/api/v1/session");
  expect(sessionAfterLogout.status()).toBe(401);
});
