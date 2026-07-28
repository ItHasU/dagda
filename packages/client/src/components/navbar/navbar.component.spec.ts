import { beforeEach, describe, expect, it } from "vitest";
import { BrandInfo } from "../../app/brand";
import { dagda, _setDagda } from "../../app/dagda";
import { AbstractPageElement } from "../../pages/abstract.page.element";
import { PageHandler } from "../../pages/handler";
import { PermissionPredicate } from "../../pages/menu";
import { Navbar } from "./navbar.component";
// Registers <dagda-status> and <dagda-login>, which the navbar's own template
// places in the secondary group.
import "../login/login.component";
import "../status/status.component";

/**
 * The navigation column, deployed and collapsed (`specs/navigation.md` §3).
 *
 * Both states are exercised against the same tree, because that is the claim
 * being tested: collapsing is a stylesheet concern, not a second rendering
 * that could drift. The leak test is the important one — a rail that draws
 * badges from the tree would announce a forbidden section by its icon alone.
 */

class StubPage extends AbstractPageElement {
    // Public, unlike the protected constructor it inherits: a page is
    // registered by its constructor, so the framework has to be able to call it.
    public constructor() { super({}); }
    protected override async _refresh(): Promise<void> { }
}
customElements.define("stub-page", StubPage);

const BRAND: BrandInfo = { label: "MQTT Toolbox", icon: "ph-broadcast" };

/** Build a navbar wired to a handler, in the requested state */
async function mount(options: { canAccess?: PermissionPredicate, collapsed?: boolean, currentPage?: string } = {}): Promise<Navbar> {
    const pages = new PageHandler<{ [name: string]: AbstractPageElement }>();
    pages.registerSections({
        monitoring: { label: "Supervision", icon: "ph-gauge", order: 1 },
        admin: { label: "Administration", icon: "ph-lock", order: 2, permission: "admin" },
        settings: { label: "Paramètres", icon: "ph-gear", group: "secondary" }
    });
    pages.registerPage("dashboard", { title: "Tableau de bord", constructor: StubPage, icon: "ph-chart-line", menu: { section: "monitoring", order: 1 } });
    pages.registerPage("topics", { title: "Topics", constructor: StubPage, menu: { section: "monitoring", order: 2 } });
    pages.registerPage("users", { title: "Comptes", constructor: StubPage, permission: "admin", menu: { section: "admin" } });
    pages.registerPage("config", { title: "Configuration", constructor: StubPage, menu: { section: "settings" } });
    pages.registerPage("detail", { title: "Détail", constructor: StubPage });
    if (options.canAccess != null) {
        pages.canAccess = options.canAccess;
    }

    // Before opening a page, not after: a page waits on `dagdaReady` to
    // render, and it never settles without a dagda instance.
    _setDagda({ pages, brand: BRAND, log: { handleError: (): void => { } } } as any);

    if (options.currentPage != null) {
        await pages.setPage(options.currentPage);
    }

    // The navbar reads the state from the element that owns it, exactly as the
    // container sets it — no attribute of its own to get out of step.
    const shell = document.createElement("div");
    shell.setAttribute("data-nav", options.collapsed === true ? "collapsed" : "deployed");
    document.body.appendChild(shell);

    const navbar = new Navbar();
    shell.appendChild(navbar);
    await navbar.refresh();
    return navbar;
}

/** Labels of the rows, in order, as the reader would meet them */
function labels(navbar: Navbar): string[] {
    return Array.from(navbar.querySelectorAll(".shell-entry"))
        .map(entry => entry.querySelector(".shell-label")?.textContent ?? "")
        .filter(label => label !== "");
}

describe("Navbar", () => {

    beforeEach(() => {
        document.body.replaceChildren();
    });

    describe("deployed", () => {

        it("lists the sections and the pages under them", async () => {
            const navbar = await mount();
            expect(labels(navbar)).toEqual(
                expect.arrayContaining(["Supervision", "Tableau de bord", "Topics"])
            );
        });

        it("indents the pages of a section", async () => {
            const navbar = await mount();
            const nested = Array.from(navbar.querySelectorAll(".shell-pages .shell-entry"))
                .map(entry => entry.getAttribute("aria-label"));
            expect(nested).toContain("Tableau de bord");
            expect(nested).not.toContain("Supervision");
        });

        it("keeps the secondary group out of the primary one", async () => {
            // Two lists in every layout, never one sub-menu (§2).
            const navbar = await mount();
            const primary = navbar.querySelector(".shell-group-primary")!;
            expect(primary.textContent).not.toContain("Paramètres");
            expect(navbar.querySelector(".shell-group-secondary")!.textContent).toContain("Paramètres");
        });

        it("omits a page that asked for no place in the menu", async () => {
            const navbar = await mount();
            expect(labels(navbar)).not.toContain("Détail");
        });

        it("spells the brand out in full", async () => {
            const navbar = await mount();
            expect(navbar.querySelector(".shell-brand-label")?.textContent).toBe("MQTT Toolbox");
            expect(navbar.querySelector(".shell-brand-icon")?.className).toContain("ph-broadcast");
        });

    });

    describe("collapsed", () => {

        it("still renders every badge, with its icon", async () => {
            const navbar = await mount({ collapsed: true });
            const icons = Array.from(navbar.querySelectorAll(".shell-badge .ph")).map(icon => icon.className);
            expect(icons.some(name => name.includes("ph-gauge"))).toBe(true);
        });

        it("names each badge, since the label is not rendered to the eye", async () => {
            // Hidden by CSS means hidden to sighted users only; without a name
            // the rail is a column of unlabelled buttons.
            const navbar = await mount({ collapsed: true });
            const names = Array.from(navbar.querySelectorAll(".shell-entry")).map(entry => entry.getAttribute("aria-label"));
            expect(names).toContain("Supervision");
        });

        it("names the brand for a hover or a screen reader, since the label is hidden", async () => {
            const navbar = await mount({ collapsed: true });
            expect(navbar.querySelector(".shell-brand")?.getAttribute("title")).toBe("MQTT Toolbox");
        });

        it("points a section badge at the first page of the section", async () => {
            const navbar = await mount({ collapsed: true });
            const badge = Array.from(navbar.querySelectorAll<HTMLButtonElement>(".shell-group-primary > li > .shell-entry"))
                .find(entry => entry.getAttribute("aria-label") === "Supervision");
            badge!.click();
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(dagda.pages.currentPageUID).toBe("dashboard");
        });

    });

    describe("the current page", () => {

        it("is marked, and so is the section holding it", async () => {
            const navbar = await mount({ currentPage: "topics" });
            const marked = Array.from(navbar.querySelectorAll("[aria-current=page]")).map(entry => entry.getAttribute("aria-label"));
            expect(marked).toEqual(expect.arrayContaining(["Topics", "Supervision"]));
        });

        it("is marked the same way whether the column is deployed or collapsed", async () => {
            // One convention for all four renderings (§5): the state is
            // computed once and the stylesheet decides how it looks.
            const deployed = await mount({ currentPage: "topics" });
            const deployedMarks = Array.from(deployed.querySelectorAll("[aria-current=page]")).map(e => e.getAttribute("aria-label"));
            document.body.replaceChildren();
            const collapsed = await mount({ currentPage: "topics", collapsed: true });
            const collapsedMarks = Array.from(collapsed.querySelectorAll("[aria-current=page]")).map(e => e.getAttribute("aria-label"));
            expect(collapsedMarks).toEqual(deployedMarks);
        });

        it("marks nothing before a page is opened", async () => {
            const navbar = await mount();
            expect(navbar.querySelectorAll("[aria-current=page]")).toHaveLength(0);
        });

    });

    describe("permissions", () => {

        const deny: PermissionPredicate = (permission) => permission == null;

        it("leaves a forbidden section out of the deployed column", async () => {
            const navbar = await mount({ canAccess: deny });
            expect(navbar.textContent).not.toContain("Administration");
            expect(navbar.textContent).not.toContain("Comptes");
        });

        it("leaks neither its label nor its icon into the collapsed rail", async () => {
            // The requirement of the slice: a rail shows icons only, and an
            // icon is still an announcement that the section exists.
            const navbar = await mount({ canAccess: deny, collapsed: true });
            expect(navbar.innerHTML).not.toContain("Administration");
            expect(navbar.innerHTML).not.toContain("ph-lock");
            const names = Array.from(navbar.querySelectorAll(".shell-entry")).map(entry => entry.getAttribute("aria-label"));
            expect(names).not.toContain("Administration");
            expect(names).not.toContain("Comptes");
        });

        it("keeps the sections the account may open", async () => {
            const navbar = await mount({ canAccess: deny, collapsed: true });
            expect(navbar.innerHTML).toContain("ph-gauge");
        });

    });

    describe("the collapse control", () => {

        it("says what it will do, not what the state is", async () => {
            const deployed = await mount();
            expect(deployed.querySelector("[ref=toggle]")?.getAttribute("aria-label")).toBe("Rétracter le menu");
            document.body.replaceChildren();
            const collapsed = await mount({ collapsed: true });
            expect(collapsed.querySelector("[ref=toggle]")?.getAttribute("aria-label")).toBe("Déployer le menu");
        });

        it("asks rather than decides, so the state stays in one place", async () => {
            const navbar = await mount();
            let asked = 0;
            navbar.addEventListener("dagda-nav-toggle", () => asked++);
            navbar.querySelector<HTMLButtonElement>("[ref=toggle]")!.click();
            expect(asked).toBe(1);
            // The navbar did not collapse anything on its own.
            expect(navbar.closest("[data-nav]")?.getAttribute("data-nav")).toBe("deployed");
        });

    });

    it("renders a page title as text, never as markup", async () => {
        // A title is data. The menu is not a place to interpret it.
        const pages = new PageHandler<{ [name: string]: AbstractPageElement }>();
        pages.registerPage("evil", { title: "<img src=x onerror=alert(1)>", constructor: StubPage, menu: {} });
        _setDagda({ pages, brand: BRAND, log: { handleError: (): void => { } } } as any);

        const navbar = new Navbar();
        document.body.appendChild(navbar);
        await navbar.refresh();

        expect(navbar.querySelector("img")).toBeNull();
        expect(navbar.querySelector(".shell-label")?.textContent).toBe("<img src=x onerror=alert(1)>");
    });

});
