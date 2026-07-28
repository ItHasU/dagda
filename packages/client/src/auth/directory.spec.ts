import { describe, expect, it } from "vitest";
import { UsersDirectory } from "./directory";

/**
 * The client-side user directory (ROADMAP tranche 3): loaded once at
 * `DagdaClient.start()`, read synchronously afterward — the whole point being
 * that a screen rendering "published by X" never has to await a lookup.
 */

describe("UsersDirectory", () => {

    it("answers null before the initial load resolves", () => {
        const directory = new UsersDirectory(async () => [{ id: 1, displayName: "Alice" }]);
        expect(directory.getDisplayName(1)).toBeNull();
    });

    it("resolves a known id once loaded", async () => {
        const directory = new UsersDirectory(async () => [{ id: 1, displayName: "Alice" }]);
        await directory.load();
        expect(directory.getDisplayName(1)).toBe("Alice");
    });

    it("answers null for an id no account carries", async () => {
        const directory = new UsersDirectory(async () => [{ id: 1, displayName: "Alice" }]);
        await directory.load();
        expect(directory.getDisplayName(2)).toBeNull();
    });

    it("loads once: the fetch is not called again by getDisplayName", async () => {
        let calls = 0;
        const directory = new UsersDirectory(async () => {
            calls++;
            return [{ id: 1, displayName: "Alice" }];
        });
        await directory.load();
        directory.getDisplayName(1);
        directory.getDisplayName(2);
        expect(calls).toBe(1);
    });

    it("keeps answering null if the load fails, rather than throwing", async () => {
        const directory = new UsersDirectory(async () => { throw new Error("no session"); });
        await expect(directory.load()).resolves.toBeUndefined();
        expect(directory.getDisplayName(1)).toBeNull();
    });

});
