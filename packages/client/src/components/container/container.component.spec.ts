import { Dagda, DagdaRegistry } from "@dagda/shared/src/dagda";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AbstractPageElement } from "../../pages/abstract.page.element";
import { PageHandler } from "../../pages/handler";
import { NAV_COLLAPSED_KEY, PageContainer, PORTRAIT_MAX_WIDTH_PX } from "./container.component";
// The container's template names them, so they have to be defined.
import "../login/login.component";
import "../navbar/navbar.component";
import "../status/status.component";

/**
 * The landscape layout and its one piece of state (`specs/navigation.md` §3).
 *
 * Collapsing is a manual, remembered choice — no width threshold in landscape.
 * These tests are about the remembering: applying it late is what makes the
 * column flash open before snapping shut, which is the thing the local mirror
 * exists to prevent.
 */

class StubPage extends AbstractPageElement {
    // Public, unlike the protected constructor it inherits: a page is
    // registered by its constructor, so the framework has to be able to call it.
    public constructor() { super({}); }
    protected override async _refresh(): Promise<void> {
        this.textContent = "page";
    }
}
customElements.define("container-stub-page", StubPage);

/** A container attached to the document, with a page handler behind it */
async function mount(): Promise<{ container: PageContainer, pages: PageHandler<any> }> {
    const pages = new PageHandler<{ [name: string]: AbstractPageElement }>();
    pages.registerPage("home", { title: "Accueil", constructor: StubPage, menu: {} });

    Dagda.reset(new DagdaRegistry());
    Dagda.init({ pages, brand: { label: "Test" }, log: { handleError: (): void => { } } });

    const container = new PageContainer();
    document.body.appendChild(container);
    await container.refresh();
    return { container, pages };
}

describe("PageContainer", () => {

    beforeEach(() => {
        document.body.replaceChildren();
        window.localStorage.clear();
    });

    afterEach(() => {
        Dagda.reset(new DagdaRegistry());
    });

    it("starts deployed when nothing has been remembered", async () => {
        const { container } = await mount();
        expect(container.collapsed).toBe(false);
        expect(container.querySelector(".shell")?.getAttribute("data-nav")).toBe("deployed");
    });

    it("remembers the choice", async () => {
        const { container } = await mount();
        container.collapsed = true;
        expect(window.localStorage.getItem(NAV_COLLAPSED_KEY)).toBe("true");
    });

    it("remembers through the document, not through Node's own global", async () => {
        // `globalThis.localStorage` and `window.localStorage` are one object in
        // a browser. Under Node 24 they are not: Node ships a `localStorage`
        // global of its own, unavailable without a flag, and it shadows the
        // document's. Reading the wrong one silently forgets everything, and
        // silently is the operative word — nothing throws.
        window.localStorage.setItem(NAV_COLLAPSED_KEY, "true");
        expect(PageContainer.readCollapsed()).toBe(true);
    });

    it("applies the remembered choice on the very first render", async () => {
        // Not after a round trip: the column must never be seen deployed and
        // then collapse in front of the user.
        window.localStorage.setItem(NAV_COLLAPSED_KEY, "true");
        const { container } = await mount();
        expect(container.querySelector(".shell")?.getAttribute("data-nav")).toBe("collapsed");
    });

    it("collapses when the navbar asks, without the two knowing each other", async () => {
        const { container } = await mount();
        container.querySelector("dagda-navbar")!
            .dispatchEvent(new CustomEvent("dagda-nav-toggle", { bubbles: true }));
        expect(container.collapsed).toBe(true);
    });

    it("shows the page it is told about, replacing the previous one", async () => {
        const { container, pages } = await mount();
        await pages.setPage("home");
        const area = container.querySelector(".shell-content")!;
        expect(area.textContent).toContain("page");
        expect(area.children).toHaveLength(1);

        await pages.setPage("home");
        expect(area.children).toHaveLength(1);
    });

    it("carries on when storage is denied", async () => {
        // Private browsing and blocked cookies both make this throw. A menu
        // that forgets beats a menu that fails to start.
        const original = Object.getOwnPropertyDescriptor(window, "localStorage");
        Object.defineProperty(window, "localStorage", {
            configurable: true,
            get() { throw new Error("denied"); }
        });
        try {
            expect(PageContainer.readCollapsed()).toBe(false);
            expect(() => PageContainer.writeCollapsed(true)).not.toThrow();
        } finally {
            if (original != null) {
                Object.defineProperty(window, "localStorage", original);
            }
        }
    });

    /**
     * The portrait layout: bar and overlay drawer (`specs/navigation.md`
     * §4, ROADMAP tranche 4). `setInnerWidth()` drives the same
     * `matchMedia` the component itself listens to (`src/test/
     * matchmedia.setup.ts`), so these tests exercise the real switch, not a
     * stand-in for it.
     */
    describe("portrait", () => {

        function setInnerWidth(width: number): void {
            Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
        }

        afterEach(() => {
            setInnerWidth(1024);
        });

        it("starts closed even when landscape remembered deployed", async () => {
            setInnerWidth(480);
            window.localStorage.setItem(NAV_COLLAPSED_KEY, "false");
            const { container } = await mount();
            expect(container.querySelector(".shell")?.getAttribute("data-layout")).toBe("portrait");
            expect(container.collapsed).toBe(true);
        });

        it("does not persist its open/closed state to storage", async () => {
            setInnerWidth(480);
            const { container } = await mount();
            container.collapsed = false;
            expect(window.localStorage.getItem(NAV_COLLAPSED_KEY)).toBeNull();
        });

        it("closes on a backdrop click", async () => {
            setInnerWidth(480);
            const { container } = await mount();
            container.collapsed = false;
            container.querySelector<HTMLElement>(".shell-backdrop")!.click();
            expect(container.collapsed).toBe(true);
        });

        it("closes when a page is selected", async () => {
            setInnerWidth(480);
            const { container, pages } = await mount();
            container.collapsed = false;
            await pages.setPage("home");
            expect(container.collapsed).toBe(true);
        });

        it("does not close on page selection in landscape", async () => {
            const { container, pages } = await mount();
            container.collapsed = false;
            await pages.setPage("home");
            expect(container.collapsed).toBe(false);
        });

        it("switches back to landscape and restores the remembered state", async () => {
            window.localStorage.setItem(NAV_COLLAPSED_KEY, "true");
            setInnerWidth(480);
            const { container } = await mount();
            expect(container.querySelector(".shell")?.getAttribute("data-layout")).toBe("portrait");

            setInnerWidth(1024);
            window.matchMedia(`(max-width: ${PORTRAIT_MAX_WIDTH_PX}px)`).dispatchEvent(new Event("change"));
            // The stub's "change" listener is registered via addEventListener,
            // triggered here directly rather than through a resize event —
            // there is no real viewport to resize under jsdom.

            expect(container.querySelector(".shell")?.getAttribute("data-layout")).toBe("landscape");
            expect(container.collapsed).toBe(true);
        });

    });

});
