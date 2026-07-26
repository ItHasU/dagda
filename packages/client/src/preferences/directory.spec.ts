import { Dagda, DagdaRegistry } from "@dagda/shared/src/dagda";
import { afterEach, describe, expect, it } from "vitest";
import { PreferencesDirectory } from "./directory";
import { PreferencesService } from "./service";

/**
 * The client-side preferences (ROADMAP tranche 3, FEATURES §11.6): loaded
 * once at `DagdaClient.start()`, read synchronously afterward — the same
 * shape as `UsersDirectory`, so a screen reading a preference during render
 * never has to await a lookup.
 */

describe("PreferencesDirectory", () => {

    afterEach(() => {
        Dagda.reset(new DagdaRegistry());
    });

    it("answers undefined before the initial load resolves", () => {
        const preferences = new PreferencesDirectory(async () => ({ theme: "light" }), async () => { });
        expect(preferences.get("theme")).toBeUndefined();
    });

    it("resolves a known key once loaded, already at its default", async () => {
        const preferences = new PreferencesDirectory(async () => ({ theme: "light" }), async () => { });
        await preferences.load();
        expect(preferences.get("theme")).toBe("light");
    });

    it("keeps answering undefined if the load fails, rather than throwing", async () => {
        const preferences = new PreferencesDirectory(async () => { throw new Error("no session"); }, async () => { });
        await expect(preferences.load()).resolves.toBeUndefined();
        expect(preferences.get("theme")).toBeUndefined();
    });

    it("loads once: the fetch is not called again by get()", async () => {
        let calls = 0;
        const preferences = new PreferencesDirectory(async () => {
            calls++;
            return { theme: "light" };
        }, async () => { });
        await preferences.load();
        preferences.get("theme");
        preferences.get("pageSize");
        expect(calls).toBe(1);
    });

    it("set() calls the update function with the key and value", async () => {
        const calls: [string, unknown][] = [];
        const preferences = new PreferencesDirectory(async () => ({ theme: "light" }), async (key, value) => {
            calls.push([key, value]);
        });
        await preferences.load();
        await preferences.set("theme", "dark");
        expect(calls).toEqual([["theme", "dark"]]);
    });

    it("set() updates the local cache, so the next get() reflects it without another round trip", async () => {
        const preferences = new PreferencesDirectory(async () => ({ theme: "light" }), async () => { });
        await preferences.load();
        await preferences.set("theme", "dark");
        expect(preferences.get("theme")).toBe("dark");
    });

    it("set() works even before load() resolved", async () => {
        const preferences = new PreferencesDirectory(async () => ({ theme: "light" }), async () => { });
        await preferences.set("compactView", true);
        expect(preferences.get("compactView")).toBe(true);
    });

    it("is reachable via Dagda.get(\"preferences\") once registered", async () => {
        const preferences = new PreferencesDirectory(async () => ({ theme: "dark" }), async () => { });
        await preferences.load();
        Dagda.init({ preferences });
        expect(Dagda.get<PreferencesService>("preferences").get("theme")).toBe("dark");
    });

});
