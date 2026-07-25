import { expect, Page, test } from "@playwright/test";

/**
 * The journeys of the first slice, now that local accounts exist (FEATURES §7).
 *
 * The bootstrap application starts on an empty database, so the framework
 * creates admin/admin and a browser can actually get in — which is what turns
 * these from "the server answers" into real journeys.
 */

const ADMIN = { login: "admin", password: "admin" };

/** Fill the login form and submit it */
async function login(page: Page, credentials = ADMIN): Promise<void> {
    await page.goto("/login");
    await page.fill("#login", credentials.login);
    await page.fill("#password", credentials.password);
    await page.click("button[type=submit]");
}

test.describe("Anonymous visitor", () => {

    test("is redirected to the login page", async ({ page }) => {
        await page.goto("/");
        await expect(page).toHaveURL(/\/login$/);
    });

    test("is offered a form, not a list of providers", async ({ page }) => {
        // Local accounts are the only mode: one form, one password (§7).
        await page.goto("/login");
        await expect(page.locator("input#login")).toBeVisible();
        await expect(page.locator("input#password")).toHaveAttribute("type", "password");
    });

    test("cannot fetch the client bundle either", async ({ request }) => {
        // The gate sits in front of the static folder: hiding a screen is not
        // access control, and neither is withholding only the screen.
        const response = await request.get("/main.js", { maxRedirects: 0 });
        expect(response.status()).toBe(302);
        expect(response.headers()["location"]).toBe("/login");
    });

    test("is refused on an API call", async ({ request }) => {
        // The check has to hold on the route itself, called directly. APIs are
        // registered as POST routes named after the API, with no prefix.
        const response = await request.post("/getSystemInfo", { maxRedirects: 0, data: [] });
        expect(response.status()).toBe(302);
        expect(response.headers()["location"]).toBe("/login");
    });

});

test.describe("Signing in", () => {

    test("refuses a wrong password without saying which part was wrong", async ({ page }) => {
        await login(page, { login: "admin", password: "wrong" });
        await expect(page.locator("[role=alert]")).toContainText("Identifiant ou mot de passe incorrect");

        // The same message for an unknown account: naming the difference would
        // tell whoever is probing which logins exist.
        await login(page, { login: "nobody", password: "whatever" });
        await expect(page.locator("[role=alert]")).toContainText("Identifiant ou mot de passe incorrect");
    });

    test("keeps the login typed after a failure", async ({ page }) => {
        await login(page, { login: "admin", password: "wrong" });
        await expect(page.locator("#login")).toHaveValue("admin");
    });

    test("lets the bootstrap account in and lands on the application", async ({ page }) => {
        // admin/admin is created by the framework on an empty database, since
        // before an account exists nobody can be invited (§7.1).
        await login(page);
        await expect(page).toHaveURL(/\/$/);
        await expect(page.locator("input#password")).toHaveCount(0);
    });

    test("serves the client bundle once signed in", async ({ page }) => {
        await login(page);
        const response = await page.request.get("/main.js", { maxRedirects: 0 });
        expect(response.status()).toBe(200);
    });

    test("answers an API call with the account behind it", async ({ page }) => {
        await login(page);
        const response = await page.request.post("/getSystemInfo", { data: [] });
        expect(response.status()).toBe(200);
        const info = await response.json() as { user: { login: string, isSuperAdmin: boolean } };
        expect(info.user.login).toBe("admin");
        // The first account holds every permission implicitly (§7.1).
        expect(info.user.isSuperAdmin).toBe(true);
    });

    test("never sends the stored password to the browser", async ({ page }) => {
        await login(page);
        const response = await page.request.post("/getSystemInfo", { data: [] });
        expect(await response.text()).not.toContain("scrypt:");
    });

});

test.describe("Signing out", () => {

    test("returns to the login page and closes the session", async ({ page }) => {
        await login(page);
        await page.goto("/logout");
        await expect(page).toHaveURL(/\/login$/);

        // And the session is really gone, not merely redirected away from.
        await page.goto("/");
        await expect(page).toHaveURL(/\/login$/);
    });

});
