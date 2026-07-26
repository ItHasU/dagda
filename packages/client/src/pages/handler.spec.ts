import { Dagda, DagdaRegistry } from "@dagda/shared/src/dagda";
import { Event, EventListener } from "@dagda/shared/src/tools/events";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AbstractPageElement } from "./abstract.page.element";
import { PageHandler } from "./handler";

/**
 * `PageHandler` outside of any rendering: current page bookkeeping and the
 * `autoRefresh` convention (FEATURES §8) that lets a page catch up on a
 * websocket change itself instead of waiting on the "à rafraîchir" indicator.
 */

interface EntitiesState { downloading: number; uploading: number; dirty: boolean; }

class CountingPage extends AbstractPageElement {
    public static refreshCount = 0;
    // Public, unlike the protected constructor it inherits: the framework
    // instantiates a page by its constructor, not through a factory.
    public constructor() { super({}); }
    protected override async _refresh(): Promise<void> { CountingPage.refreshCount++; }
}
customElements.define("counting-page", CountingPage);

class OtherPage extends AbstractPageElement {
    public constructor() { super({}); }
    protected override async _refresh(): Promise<void> { }
}
customElements.define("other-page", OtherPage);

/** A fake "entities" service exposing only what a state listener needs */
function fakeEntities(): { service: { getHandler: () => { on: (name: string, listener: EventListener<EntitiesState>) => void } }, fire: (dirty: boolean) => void } {
    let listener: EventListener<EntitiesState> | null = null;
    return {
        service: {
            getHandler: () => ({
                on: (_name: string, cb: EventListener<EntitiesState>): void => { listener = cb; }
            })
        },
        fire: (dirty: boolean): void => {
            listener?.(new Event({ downloading: 0, uploading: 0, dirty }));
        }
    };
}

describe("PageHandler", () => {

    afterEach(() => {
        Dagda.reset(new DagdaRegistry());
    });

    beforeEach(() => {
        CountingPage.refreshCount = 0;
    });

    describe("isCurrentPageAutoRefresh", () => {

        it("is false before any page is open", () => {
            const pages = new PageHandler<{ counting: CountingPage }>();
            pages.registerPage("counting", { title: "Counting", constructor: CountingPage, autoRefresh: true });
            expect(pages.isCurrentPageAutoRefresh()).toBe(false);
        });

        it("reflects the flag declared by the current page", async () => {
            // Reset before construction: PageHandler captures Dagda.loaded at
            // that point, and it must be the registry init() is about to settle.
            Dagda.reset(new DagdaRegistry());
            const pages = new PageHandler<{ counting: CountingPage, other: OtherPage }>();
            pages.registerPage("counting", { title: "Counting", constructor: CountingPage, autoRefresh: true });
            pages.registerPage("other", { title: "Other", constructor: OtherPage });
            Dagda.init({ pages });

            await pages.setPage("counting");
            expect(pages.isCurrentPageAutoRefresh()).toBe(true);

            await pages.setPage("other");
            expect(pages.isCurrentPageAutoRefresh()).toBe(false);
        });

    });

    describe("auto-refresh on a dirty cache", () => {

        it("refreshes the current page when it declared autoRefresh", async () => {
            Dagda.reset(new DagdaRegistry());
            const pages = new PageHandler<{ counting: CountingPage }>();
            pages.registerPage("counting", { title: "Counting", constructor: CountingPage, autoRefresh: true });
            const entities = fakeEntities();
            Dagda.init({ pages, entities: entities.service });
            await Dagda.loaded;

            await pages.setPage("counting");
            const before = CountingPage.refreshCount;

            entities.fire(true);
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(CountingPage.refreshCount).toBeGreaterThan(before);
        });

        it("leaves a page without autoRefresh to the indicator", async () => {
            Dagda.reset(new DagdaRegistry());
            const pages = new PageHandler<{ other: OtherPage }>();
            pages.registerPage("other", { title: "Other", constructor: OtherPage });
            const entities = fakeEntities();
            Dagda.init({ pages, entities: entities.service });
            await Dagda.loaded;

            await pages.setPage("other");
            entities.fire(true);
            await new Promise(resolve => setTimeout(resolve, 0));

            // Nothing to assert on OtherPage directly; the guarantee under test
            // is that isCurrentPageAutoRefresh stays false, which is what the
            // status indicator relies on to keep showing the alert.
            expect(pages.isCurrentPageAutoRefresh()).toBe(false);
        });

        it("does not refresh again while the cache is still dirty", async () => {
            Dagda.reset(new DagdaRegistry());
            const pages = new PageHandler<{ counting: CountingPage }>();
            pages.registerPage("counting", { title: "Counting", constructor: CountingPage, autoRefresh: true });
            const entities = fakeEntities();
            Dagda.init({ pages, entities: entities.service });
            await Dagda.loaded;

            await pages.setPage("counting");
            entities.fire(true);
            await new Promise(resolve => setTimeout(resolve, 0));
            const afterFirst = CountingPage.refreshCount;

            // Same state repeated, e.g. a second field of the event changing:
            // no new false→true edge, so nothing to react to a second time.
            entities.fire(true);
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(CountingPage.refreshCount).toBe(afterFirst);
        });

    });

});
