import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreferencesDirectory } from "../preferences/directory";
import { DAGDA_THEMES, THEME_STORAGE_KEY, ThemeRegistry } from "./service";

/** A preferences directory with a controllable, already-loaded value */
function buildPreferences(initial?: Record<string, unknown>): { preferences: PreferencesDirectory, setCalls: [string, unknown][] } {
    const setCalls: [string, unknown][] = [];
    const preferences = new PreferencesDirectory(
        () => Promise.resolve(initial ?? {}),
        (key, value) => { setCalls.push([key, value]); return Promise.resolve(); }
    );
    return { preferences, setCalls };
}

describe("ThemeRegistry", () => {

    beforeEach(() => {
        window.localStorage.clear();
        delete document.documentElement.dataset["theme"];
    });

    afterEach(() => {
        delete document.documentElement.dataset["theme"];
    });

    it("lists the framework's own themes by default", () => {
        const { preferences } = buildPreferences();
        const themes = new ThemeRegistry(DAGDA_THEMES, preferences);
        expect(themes.list().map((t) => t.id)).toEqual(["nocturne", "aurore", "frenchy"]);
    });

    it("current falls back to the first declared theme before anything is applied", () => {
        const { preferences } = buildPreferences();
        const themes = new ThemeRegistry(DAGDA_THEMES, preferences);
        expect(themes.current).toBe("nocturne");
    });

    it("set() applies the root attribute and the storage mirror", async () => {
        const { preferences } = buildPreferences();
        const themes = new ThemeRegistry(DAGDA_THEMES, preferences);

        await themes.set("aurore");

        expect(document.documentElement.dataset["theme"]).toBe("aurore");
        expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("aurore");
        expect(themes.current).toBe("aurore");
    });

    it("set() does not write through to preferences when no key was declared", async () => {
        const { preferences, setCalls } = buildPreferences();
        const themes = new ThemeRegistry(DAGDA_THEMES, preferences);

        await themes.set("aurore");

        expect(setCalls).toEqual([]);
    });

    it("set() writes through to the declared preference key", async () => {
        const { preferences, setCalls } = buildPreferences();
        const themes = new ThemeRegistry(DAGDA_THEMES, preferences, "ui.theme");

        await themes.set("aurore");

        expect(setCalls).toEqual([["ui.theme", "aurore"]]);
    });

    it("reconcile() applies the stored preference over a mismatched mirror", async () => {
        const { preferences } = buildPreferences({ "ui.theme": "aurore" });
        await preferences.load();
        document.documentElement.dataset["theme"] = "nocturne"; // what boot.ts's mirror had applied
        const themes = new ThemeRegistry(DAGDA_THEMES, preferences, "ui.theme");

        themes.reconcile();

        expect(themes.current).toBe("aurore");
    });

    it("reconcile() is a no-op when the mirror already agrees", async () => {
        const { preferences } = buildPreferences({ "ui.theme": "aurore" });
        await preferences.load();
        document.documentElement.dataset["theme"] = "aurore";
        const themes = new ThemeRegistry(DAGDA_THEMES, preferences, "ui.theme");

        const spy = vi.spyOn(window.localStorage, "setItem");
        themes.reconcile();

        expect(spy).not.toHaveBeenCalled();
    });

    it("reconcile() does nothing when no preference key was declared", async () => {
        const { preferences } = buildPreferences({ "ui.theme": "aurore" });
        await preferences.load();
        document.documentElement.dataset["theme"] = "nocturne";
        const themes = new ThemeRegistry(DAGDA_THEMES, preferences);

        themes.reconcile();

        expect(themes.current).toBe("nocturne");
    });

    it("currentInfo resolves the full declaration of the current theme, dark flag included", async () => {
        const { preferences } = buildPreferences();
        const themes = new ThemeRegistry(DAGDA_THEMES, preferences);

        expect(themes.currentInfo).toEqual({ id: "nocturne", label: "Nocturne", dark: true });
        await themes.set("aurore");
        expect(themes.currentInfo).toEqual({ id: "aurore", label: "Aurore", dark: false });
    });

    it("onChange() fires after set() and stops firing once unsubscribed", async () => {
        const { preferences } = buildPreferences();
        const themes = new ThemeRegistry(DAGDA_THEMES, preferences);
        const listener = vi.fn();
        const unsubscribe = themes.onChange(listener);

        await themes.set("aurore");
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
        await themes.set("nocturne");
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("onChange() also fires on reconcile() applying a different preference", async () => {
        const { preferences } = buildPreferences({ "ui.theme": "aurore" });
        await preferences.load();
        document.documentElement.dataset["theme"] = "nocturne";
        const themes = new ThemeRegistry(DAGDA_THEMES, preferences, "ui.theme");
        const listener = vi.fn();
        themes.onChange(listener);

        themes.reconcile();

        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("carries on when storage is denied", async () => {
        const { preferences } = buildPreferences();
        const themes = new ThemeRegistry(DAGDA_THEMES, preferences);
        const original = Object.getOwnPropertyDescriptor(window, "localStorage");
        Object.defineProperty(window, "localStorage", {
            configurable: true,
            get() { throw new Error("denied"); }
        });
        try {
            await expect(themes.set("aurore")).resolves.toBeUndefined();
            expect(document.documentElement.dataset["theme"]).toBe("aurore");
        } finally {
            if (original != null) {
                Object.defineProperty(window, "localStorage", original);
            }
        }
    });

});
