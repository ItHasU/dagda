import { describe, expect, it, vi } from "vitest";
import { buildMenu, isActive, MenuPageSource, SectionInfo } from "./menu";

/**
 * The menu tree (`specs/navigation.md` §5).
 *
 * These are the tests that matter for permissions: the four renderings all
 * consume this one tree, so what it refuses to emit is what no layout can
 * leak — including the collapsed rail, where an icon alone would still
 * announce that a forbidden section exists.
 */

const SECTIONS: Record<string, SectionInfo> = {
    monitoring: { label: "Supervision", icon: "ph-gauge", order: 1 },
    admin: { label: "Administration", icon: "ph-lock", order: 2, permission: "admin" }
};

const PAGES: MenuPageSource[] = [
    { uid: "topics", title: "Topics", menu: { section: "monitoring", order: 2 } },
    { uid: "dashboard", title: "Tableau de bord", menu: { section: "monitoring", order: 1 } },
    { uid: "users", title: "Comptes", permission: "admin", menu: { section: "admin" } },
    { uid: "detail", title: "Détail d'un topic" }
];

describe("buildMenu", () => {

    it("nests pages under their section, in the declared order", () => {
        const menu = buildMenu(PAGES, SECTIONS);
        const monitoring = menu.find(node => node.uid === "monitoring");
        expect(monitoring?.label).toBe("Supervision");
        expect(monitoring?.pages.map(page => page.uid)).toEqual(["dashboard", "topics"]);
    });

    it("leaves out a page that declared no menu placement", () => {
        // Registering in the menu is optional (FEATURES §8): a page opened from
        // another page is reachable without being listed.
        const menu = buildMenu(PAGES, SECTIONS);
        const uids = menu.flatMap(node => [node.uid, ...node.pages.map(page => page.uid)]);
        expect(uids).not.toContain("detail");
    });

    it("makes a page with no section an entry of its own", () => {
        const menu = buildMenu([{ uid: "status", title: "Statut", menu: {} }], {});
        expect(menu).toHaveLength(1);
        expect(menu[0]).toMatchObject({ uid: "status", label: "Statut", target: "status", pages: [] });
    });

    it("points a section at its first page, which is where the collapsed rail goes", () => {
        // The decision recorded in specs/navigation.md: a click on a section
        // badge navigates, it does not open a flyout.
        const menu = buildMenu(PAGES, SECTIONS);
        expect(menu.find(node => node.uid === "monitoring")?.target).toBe("dashboard");
    });

    it("sorts sections and standalone entries together", () => {
        const menu = buildMenu(PAGES, SECTIONS);
        // "detail" is unlisted; what remains is monitoring (1), admin (2).
        expect(menu.map(node => node.uid)).toEqual(["monitoring", "admin"]);
    });

    it("falls back to the label, then the uid, when orders tie", () => {
        const menu = buildMenu([
            { uid: "b", title: "Alpha", menu: {} },
            { uid: "a", title: "Alpha", menu: {} },
            { uid: "c", title: "Beta", menu: {} }
        ], {});
        expect(menu.map(node => node.uid)).toEqual(["a", "b", "c"]);
    });

    describe("permissions", () => {

        const deny = (permission: string | undefined): boolean => permission == null;

        it("drops a forbidden section entirely, label and badge alike", () => {
            const menu = buildMenu(PAGES, SECTIONS, deny);
            expect(menu.map(node => node.uid)).toEqual(["monitoring"]);
            // The point of the requirement: nothing anywhere in the tree names
            // it, so no rendering can show it — a rail draws icons from these
            // same nodes.
            expect(JSON.stringify(menu)).not.toContain("Administration");
            expect(JSON.stringify(menu)).not.toContain("ph-lock");
        });

        it("drops a forbidden page but keeps its section when others remain", () => {
            const menu = buildMenu([
                { uid: "public", title: "Public", menu: { section: "monitoring" } },
                { uid: "secret", title: "Secret", permission: "admin", menu: { section: "monitoring" } }
            ], { monitoring: SECTIONS["monitoring"]! }, deny);
            expect(menu[0]?.pages.map(page => page.uid)).toEqual(["public"]);
            expect(JSON.stringify(menu)).not.toContain("Secret");
        });

        it("drops a section whose every page is forbidden, rather than leaving a badge that leads nowhere", () => {
            const menu = buildMenu([
                { uid: "secret", title: "Secret", permission: "admin", menu: { section: "monitoring" } }
            ], { monitoring: SECTIONS["monitoring"]! }, deny);
            expect(menu).toEqual([]);
        });

        it("drops an empty section even when it is allowed", () => {
            // A badge with no target is a badge that cannot be clicked, and a
            // section that names itself while holding nothing.
            const menu = buildMenu([], SECTIONS);
            expect(menu).toEqual([]);
        });

    });

    it("reports a page pointing at a section nobody declared", () => {
        // Silence here would surface only as a page mysteriously absent from
        // the menu, which is a much longer walk back to the cause.
        const error = vi.spyOn(console, "error").mockImplementation(() => { });
        const menu = buildMenu([{ uid: "orphan", title: "Orphelin", menu: { section: "nowhere" } }], {});
        expect(menu).toEqual([]);
        expect(error).toHaveBeenCalledWith(expect.stringContaining("nowhere"));
        error.mockRestore();
    });

    describe("groups", () => {

        const SETTINGS: Record<string, SectionInfo> = {
            settings: { label: "Paramètres", group: "secondary" }
        };
        const pages: MenuPageSource[] = [
            { uid: "config", title: "Configuration", menu: { section: "settings" } },
            { uid: "topics", title: "Topics", menu: {} }
        ];

        it("keeps the two lists apart", () => {
            // They are never merged into one sub-menu, in any layout
            // (specs/navigation.md §2).
            expect(buildMenu(pages, SETTINGS, undefined, "primary").map(node => node.uid)).toEqual(["topics"]);
            expect(buildMenu(pages, SETTINGS, undefined, "secondary").map(node => node.uid)).toEqual(["settings"]);
        });

        it("gives a page the group of its section", () => {
            // Declaring the group on both would be two places to disagree.
            const secondary = buildMenu(pages, SETTINGS, undefined, "secondary");
            expect(secondary[0]?.pages.map(page => page.uid)).toEqual(["config"]);
        });

    });

});

describe("isActive", () => {

    const node = { uid: "monitoring", label: "Supervision", target: "dashboard", pages: [{ uid: "dashboard", title: "Tableau de bord" }] };

    it("marks a section holding the current page", () => {
        expect(isActive(node, "dashboard")).toBe(true);
    });

    it("marks a standalone entry that is the current page", () => {
        expect(isActive({ uid: "status", label: "Statut", target: "status", pages: [] }, "status")).toBe(true);
    });

    it("marks nothing before a page is opened", () => {
        expect(isActive(node, null)).toBe(false);
    });

    it("does not mark an unrelated section", () => {
        expect(isActive(node, "users")).toBe(false);
    });

});
