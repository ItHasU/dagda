import { EntitiesEvents } from "@dagda/shared/src/entities/events";
import { EventHandlerData, EventHandlerImpl, EventListener } from "@dagda/shared/src/tools/events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _setDagda } from "../../app/dagda";
import { showToast, ToastHost } from "./toast.component";

/**
 * The floor for surfacing a write failure (ROADMAP tranche 2): before this,
 * a failed submit() went to console.error alone.
 */

/** A fake "entities" service exposing only the state listeners a test needs */
function fakeEntities(): { service: { getHandler: () => { on: (name: string, listener: EventListener<any>) => void } }, fireWriteFailed: (error: unknown) => void } {
    const data: EventHandlerData<EntitiesEvents> = {};
    return {
        service: {
            getHandler: () => ({
                on: (name: string, cb: EventListener<any>): void => {
                    EventHandlerImpl.on(data as any, name as any, cb);
                }
            })
        },
        fireWriteFailed: (error: unknown): void => {
            EventHandlerImpl.fire<EntitiesEvents, "writeFailed">(data, "writeFailed", { error });
        }
    };
}

describe("ToastHost", () => {

    beforeEach(() => {
        document.body.replaceChildren();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("does nothing when called before any host has connected", () => {
        expect(() => showToast("too early")).not.toThrow();
    });

    it("shows a message passed to show()", async () => {
        _setDagda({} as any);
        const host = new ToastHost();
        document.body.appendChild(host);
        await host.refresh();

        host.show("something broke");

        expect(host.querySelector(".dagda-toast")?.textContent).toContain("something broke");
    });

    it("is reachable through showToast() once mounted, from anywhere", async () => {
        _setDagda({} as any);
        const host = new ToastHost();
        document.body.appendChild(host);
        await host.refresh();

        showToast("reached without a reference to the host");

        expect(host.querySelector(".dagda-toast")?.textContent).toContain("reached without a reference to the host");
    });

    it("dismisses on click of its close button", async () => {
        _setDagda({} as any);
        const host = new ToastHost();
        document.body.appendChild(host);
        await host.refresh();

        host.show("dismiss me");
        host.querySelector<HTMLButtonElement>(".dagda-toast button")!.click();

        expect(host.querySelector(".dagda-toast")).toBeNull();
    });

    it("dismisses itself after a delay", async () => {
        vi.useFakeTimers();
        _setDagda({} as any);
        const host = new ToastHost();
        document.body.appendChild(host);
        await host.refresh();

        host.show("fades on its own");
        expect(host.querySelector(".dagda-toast")).not.toBeNull();

        vi.advanceTimersByTime(10000);
        expect(host.querySelector(".dagda-toast")).toBeNull();
    });

    it("surfaces a writeFailed from the entities handler, unprompted", async () => {
        const entities = fakeEntities();
        _setDagda({ entities: entities.service } as any);
        const host = new ToastHost();
        document.body.appendChild(host);
        await host.refresh();

        entities.fireWriteFailed(new Error("the server is unreachable"));

        expect(host.querySelector(".dagda-toast")?.textContent).toContain("the server is unreachable");
    });

    it("defaults to the danger variant when none is passed — every untouched call site keeps its red toast", async () => {
        _setDagda({} as any);
        const host = new ToastHost();
        document.body.appendChild(host);
        await host.refresh();

        host.show("something broke");

        expect(host.querySelector(".dagda-toast")?.getAttribute("data-state")).toBe("danger");
    });

    it("shows a success toast when the caller asks for one, through showToast() too", async () => {
        _setDagda({} as any);
        const host = new ToastHost();
        document.body.appendChild(host);
        await host.refresh();

        showToast("saved", "success");

        expect(host.querySelector(".dagda-toast")?.getAttribute("data-state")).toBe("success");
    });

    it("shows an info toast when asked", async () => {
        _setDagda({} as any);
        const host = new ToastHost();
        document.body.appendChild(host);
        await host.refresh();

        host.show("heads up", "info");

        expect(host.querySelector(".dagda-toast")?.getAttribute("data-state")).toBe("info");
    });

    it("a write failure always renders as danger, never affected by whatever variant a caller last used", async () => {
        const entities = fakeEntities();
        _setDagda({ entities: entities.service } as any);
        const host = new ToastHost();
        document.body.appendChild(host);
        await host.refresh();

        entities.fireWriteFailed(new Error("the server is unreachable"));

        expect(host.querySelector(".dagda-toast")?.getAttribute("data-state")).toBe("danger");
    });

});
