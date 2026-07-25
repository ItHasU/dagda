import { expect, test } from "@playwright/test";

/**
 * The trivial journey of the first slice: the application boots, reaches its
 * database, serves its files, and refuses anonymous access.
 *
 * It is deliberately thin. The bootstrap application only knows how to
 * authenticate through Google today, so no browser can get past the login page
 * without a real account. Local accounts arrive with the authentication slice,
 * and that is when the journeys become worth writing.
 *
 * What matters here is that the chain — build, server, database, browser — is
 * wired and runs in continuous integration.
 */
test.describe("Bootstrap application", () => {

    test("redirects an anonymous visitor to the login page", async ({ page }) => {
        await page.goto("/");
        await expect(page).toHaveURL(/\/login$/);
    });

    test("states that no authentication strategy is registered", async ({ page }) => {
        // Started without Google credentials on purpose (see playwright.config.ts).
        await page.goto("/login");
        await expect(page.locator("body")).toContainText("No login strategy registered");
    });

    test("refuses an anonymous API call", async ({ request }) => {
        // Hiding a screen is not access control: the check has to hold on the
        // route itself, called directly. APIs are registered as POST routes
        // named after the API, with no prefix.
        const response = await request.post("/getSystemInfo", { maxRedirects: 0, data: [] });
        expect(response.status()).toBe(302);
        expect(response.headers()["location"]).toBe("/login");
    });

});
