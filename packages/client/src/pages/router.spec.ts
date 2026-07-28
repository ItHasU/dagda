import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { _setDagda } from "../app/dagda";
import { AbstractPageElement } from "./abstract.page.element";
import { PageHandler } from "./handler";
import { Router } from "./router";

class FirstPage extends AbstractPageElement {
    public constructor() { super({}); }
    protected override async _refresh(): Promise<void> { }
}
customElements.define("router-spec-first-page", FirstPage);

class SecondPage extends AbstractPageElement {
    public constructor() { super({}); }
    protected override async _refresh(): Promise<void> { }
}
customElements.define("router-spec-second-page", SecondPage);

type TestPages = { first: FirstPage, second: SecondPage };

function buildPages(): PageHandler<TestPages> {
    const pages = new PageHandler<TestPages>();
    pages.registerPage("first", { title: "First", constructor: FirstPage, menu: { order: 1 } });
    pages.registerPage("second", { title: "Second", constructor: SecondPage });
    // AbstractWebComponent.refresh() (called from setPage()) awaits
    // dagdaReady, which only resolves once a dagda instance is set.
    _setDagda({ pages } as any);
    return pages;
}

/** Resets jsdom's URL/history between tests, so one test's navigation cannot leak into the next */
function resetLocation(): void {
    window.history.replaceState({}, "", "/");
}

describe("Router", () => {

    beforeEach(() => {
        resetLocation();
    });

    afterEach(() => {
        resetLocation();
    });

    describe("start()", () => {

        it("opens the page the URL names", async () => {
            window.history.replaceState({}, "", "/?page=second");
            const pages = buildPages();
            const router = new Router(pages);

            await router.start();

            expect(pages.currentPageUID).toBe("second");
        });

        it("falls back to the default page when the URL names none", async () => {
            const pages = buildPages();
            const router = new Router(pages);

            await router.start();

            expect(pages.currentPageUID).toBe("first");
            expect(window.location.search).toBe("?page=first");
        });

        it("falls back to the default page for an unknown page name, without throwing", async () => {
            window.history.replaceState({}, "", "/?page=nonexistent");
            const pages = buildPages();
            const router = new Router(pages);

            await expect(router.start()).resolves.toBeUndefined();
            expect(pages.currentPageUID).toBe("first");
        });

        it("falls back to the default page when canAccess refuses the URL's page", async () => {
            window.history.replaceState({}, "", "/?page=second");
            const pages = buildPages();
            pages.canAccess = (permission) => permission == null; // "second" has none declared here, so allow — flip below
            pages.registerPage("second", { title: "Second", constructor: SecondPage, permission: "secret" });
            const router = new Router(pages);

            await router.start();

            expect(pages.currentPageUID).toBe("first");
        });

        it("carries params through from the URL", async () => {
            window.history.replaceState({}, "", "/?page=second&topic-id=42");
            const pages = buildPages();
            const router = new Router(pages);

            await router.start();

            expect(pages.currentPageParams).toEqual({ "topic-id": "42" });
        });

        it("replaces, rather than pushes, the initial history entry", async () => {
            const before = window.history.length;
            const pages = buildPages();
            const router = new Router(pages);

            await router.start();

            expect(window.history.length).toBe(before);
        });

    });

    describe("navigation after start()", () => {

        it("pushes a history entry when the page changes", async () => {
            const pages = buildPages();
            const router = new Router(pages);
            await router.start();
            const before = window.history.length;

            await pages.setPage("second");

            expect(window.history.length).toBe(before + 1);
            expect(window.location.search).toBe("?page=second");
        });

        it("replaces, not pushes, on replaceParams()", async () => {
            const pages = buildPages();
            const router = new Router(pages);
            await router.start();
            await pages.setPage("second");
            const before = window.history.length;

            pages.replaceParams({ "dashboard-id": "3" });

            expect(window.history.length).toBe(before);
            expect(window.location.search).toBe("?page=second&dashboard-id=3");
        });

        it("does not push a second entry for the setPage() a popstate itself triggers", async () => {
            const pages = buildPages();
            const router = new Router(pages);
            await router.start();
            await pages.setPage("second");
            const before = window.history.length;

            window.history.replaceState({}, "", "/?page=first");
            window.dispatchEvent(new PopStateEvent("popstate"));
            // popstate handling is async (setPage() is async); let it settle.
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(pages.currentPageUID).toBe("first");
            expect(window.history.length).toBe(before);
        });

    });

});
