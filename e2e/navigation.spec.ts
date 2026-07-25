import { expect, Page, test } from "@playwright/test";

/**
 * The SPA shell in a real browser (`specs/navigation.md` §3, §6.1).
 *
 * These journeys were impossible until local accounts existed: the shell sits
 * behind the authentication gate, so nothing here could be reached. They cover
 * what a component test cannot — that the application really does hand the
 * browser one element and get a whole shell back, and that the collapsed state
 * survives a reload.
 */

const ADMIN = { login: "admin", password: "admin" };

/** Sign in and wait for the shell to have drawn */
async function open(page: Page): Promise<void> {
    await page.goto("/login");
    await page.fill("#login", ADMIN.login);
    await page.fill("#password", ADMIN.password);
    await page.click("button[type=submit]");
    await expect(page.locator("dagda-app .shell")).toBeVisible();
}

test.describe("The shell", () => {

    test("is built from the single element the application wrote", async ({ page }) => {
        await open(page);
        // index.html holds `<dagda-app></dagda-app>` and nothing else; the
        // navigation column, the content area and the status indicator are all
        // the framework's doing (§6.1).
        await expect(page.locator("dagda-app > dagda-page-container")).toHaveCount(1);
        await expect(page.locator(".shell-nav")).toBeVisible();
        await expect(page.locator(".shell-content")).toBeVisible();
        await expect(page.locator("dagda-status")).toHaveCount(1);
    });

    test("opens a page by itself rather than showing an empty area", async ({ page }) => {
        await open(page);
        await expect(page.locator(".shell-content")).not.toBeEmpty();
        // The first entry of the menu is where an application lands until
        // routing by URL exists.
        await expect(page.locator(".shell-entry[aria-current=page]").first()).toBeVisible();
    });

    test("names the application in full while the column is deployed", async ({ page }) => {
        await open(page);
        await expect(page.locator(".shell-brand-full")).toBeVisible();
        await expect(page.locator(".shell-brand-full")).toHaveText("Dagda");
        await expect(page.locator(".shell-brand-compact")).toBeHidden();
    });

    test("lists the pages of a section under it", async ({ page }) => {
        await open(page);
        await expect(page.locator(".shell-entry", { hasText: "Démonstration" }).first()).toBeVisible();
        await expect(page.locator(".shell-pages .shell-entry")).toHaveCount(2);
    });

});

test.describe("Navigating", () => {

    test("changes the page and moves the mark", async ({ page }) => {
        await open(page);
        const goodbye = page.locator(".shell-pages .shell-entry", { hasText: "Goodbye" });
        await goodbye.click();
        await expect(goodbye).toHaveAttribute("aria-current", "page");

        // And the section holding it is marked too, which is what the rail
        // needs when the labels are gone.
        await expect(page.locator(".shell-group-primary > li > .shell-entry")).toHaveAttribute("aria-current", "page");
        await expect(page.locator("goodbye-page")).toHaveCount(1);
        await expect(page.locator("hello-page")).toHaveCount(0);
    });

    test("shows one page at a time", async ({ page }) => {
        await open(page);
        await page.locator(".shell-pages .shell-entry", { hasText: "Goodbye" }).click();
        await page.locator(".shell-pages .shell-entry", { hasText: "Hello" }).click();
        await expect(page.locator(".shell-content > *")).toHaveCount(1);
    });

});

test.describe("Collapsing the column", () => {

    test("hides the labels and swaps the brand for its compact rendering", async ({ page }) => {
        await open(page);
        await page.locator("[ref=toggle]").click();

        await expect(page.locator(".shell")).toHaveAttribute("data-nav", "collapsed");
        await expect(page.locator(".shell-brand-compact")).toBeVisible();
        await expect(page.locator(".shell-brand-full")).toBeHidden();
        // Including the labels of the pages of a section that is otherwise
        // expanded (§3.2).
        await expect(page.locator(".shell-pages")).toBeHidden();
        await expect(page.locator(".shell-group-primary .shell-label").first()).toBeHidden();
    });

    test("gives the width back to the content area", async ({ page }) => {
        await open(page);
        const deployed = (await page.locator(".shell-nav").boundingBox())!.width;
        await page.locator("[ref=toggle]").click();
        // The transition has to land before the width is read.
        await expect(page.locator(".shell")).toHaveAttribute("data-nav", "collapsed");
        await page.waitForTimeout(300);
        const collapsed = (await page.locator(".shell-nav").boundingBox())!.width;
        expect(collapsed).toBeLessThan(deployed);
    });

    test("is remembered across a reload, and applied before anything is drawn", async ({ page }) => {
        await open(page);
        await page.locator("[ref=toggle]").click();
        await expect(page.locator(".shell")).toHaveAttribute("data-nav", "collapsed");

        await page.reload();
        await expect(page.locator("dagda-app .shell")).toBeVisible();
        // Never deployed in between: the choice is read from the local mirror,
        // not waited for from the server.
        await expect(page.locator(".shell")).toHaveAttribute("data-nav", "collapsed");
    });

    test("navigates straight to the first page of a section from the rail", async ({ page }) => {
        // The decision of specs/navigation.md: no flyout, no temporary
        // redeployment, and the content is never pushed and put back.
        await open(page);
        await page.locator(".shell-pages .shell-entry", { hasText: "Goodbye" }).click();
        await page.locator("[ref=toggle]").click();

        await page.locator(".shell-group-primary > li > .shell-entry").click();
        await expect(page.locator("hello-page")).toHaveCount(1);
    });

    test("can be deployed again", async ({ page }) => {
        await open(page);
        await page.locator("[ref=toggle]").click();
        await expect(page.locator(".shell")).toHaveAttribute("data-nav", "collapsed");
        await page.locator("[ref=toggle]").click();
        await expect(page.locator(".shell")).toHaveAttribute("data-nav", "deployed");
        await expect(page.locator(".shell-brand-full")).toBeVisible();
    });

});

test.describe("The account", () => {

    test("is shown by its initials, and leads out", async ({ page }) => {
        await open(page);
        const badge = page.locator("dagda-login .shell-initials");
        await expect(badge).toHaveText("A");
        await expect(page.locator("dagda-login a")).toHaveAttribute("href", "/logout");
    });

    test("keeps its way out reachable from the rail", async ({ page }) => {
        await open(page);
        await page.locator("[ref=toggle]").click();
        // The label goes, the link and its accessible name stay.
        await expect(page.locator("dagda-login a")).toBeVisible();
        await expect(page.locator("dagda-login a")).toHaveAttribute("aria-label", /déconnecter/);
    });

});

test.describe("The theme", () => {

    test("paints the shell from its tokens, not from browser defaults", async ({ page }) => {
        await open(page);
        // The whole point of the token split: if this were transparent the
        // stylesheet would not have been applied at all.
        const background = await page.locator(".shell-nav").evaluate(
            element => getComputedStyle(element).backgroundColor
        );
        expect(background).not.toBe("rgba(0, 0, 0, 0)");

        const font = await page.locator("body").evaluate(element => getComputedStyle(element).fontFamily);
        expect(font).toContain("Inter");
    });

});
