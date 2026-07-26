import { EntitiesModel } from "@dagda/shared/src/entities/model";
import { TEST_MODEL } from "@dagda/shared/src/entities/_data";
import { JSTypes } from "@dagda/shared/src/entities/tools/javascript.types";
import { PreferencesModel } from "@dagda/shared/src/preferences/model";
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import { RoleStore } from "../auth/roles";
import { UserStore } from "../auth/users";
import { applyMigrations } from "../sql/migrations";
import { FRAMEWORK_MIGRATIONS } from "../sql/framework.migrations";
import { createTestDatabase, TestDatabase } from "../test/pg.fixture";
import { PreferencesStore, PREFERENCES_TABLE } from "./store";

const available = inject("databaseAvailable");

const THEME = EntitiesModel.enum({
    LIGHT: { value: "light", label: "Clair" },
    DARK: { value: "dark", label: "Sombre" }
});

const MODEL = new PreferencesModel({
    "theme": {
        type: THEME,
        default: "light" as const
    },
    "pageSize": {
        type: JSTypes.number,
        default: 25
    }
});

/**
 * The declaration behind MODEL.
 * Typing the helper below `PreferencesStore<any>` would collapse every key to
 * `never` and silently drop the checks these tests are here to make.
 */
type TestPreferences = typeof MODEL extends PreferencesModel<infer D> ? D : never;

describe.runIf(available)("Preferences store", () => {

    let db: TestDatabase;
    let store: PreferencesStore<TestPreferences>;
    let users: UserStore;

    beforeEach(async () => {
        // A schema per test: the preferences are a state, and two tests
        // sharing one would read each other's writes.
        db = await createTestDatabase("preferences");
        await applyMigrations(db.runner, TEST_MODEL, FRAMEWORK_MIGRATIONS, "framework");
        store = new PreferencesStore<TestPreferences>(MODEL, db.runner);
        users = new UserStore(db.runner, new RoleStore(db.runner));
    });

    afterEach(async () => {
        await db?.dispose();
    });

    describe("Reading and writing", () => {

        it("answers the declared default when nothing is stored", async () => {
            const alice = await users.create({ login: "alice", password: "x" });
            expect(await store.get(alice.id, "theme")).toBe("light");
            expect(await store.get(alice.id, "pageSize")).toBe(25);
        });

        it("gives back what it stored", async () => {
            const alice = await users.create({ login: "alice", password: "x" });
            await store.set(alice.id, "theme", "dark");
            await store.set(alice.id, "pageSize", 50);

            expect(await store.get(alice.id, "theme")).toBe("dark");
            expect(await store.get(alice.id, "pageSize")).toBe(50);
        });

        it("overwrites a value already stored for the same user and key", async () => {
            const alice = await users.create({ login: "alice", password: "x" });
            await store.set(alice.id, "theme", "dark");
            await store.set(alice.id, "theme", "light");
            expect(await store.get(alice.id, "theme")).toBe("light");
        });

        it("getAll() resolves every declared key, stored values overriding the defaults", async () => {
            const alice = await users.create({ login: "alice", password: "x" });
            await store.set(alice.id, "theme", "dark");

            expect(await store.getAll(alice.id)).toEqual({ theme: "dark", pageSize: 25 });
        });

        it("refuses a value that does not match the declaration", async () => {
            const alice = await users.create({ login: "alice", password: "x" });
            await expect(store.set(alice.id, "pageSize", "50" as never)).rejects.toThrow(/expected a number/);
            await expect(store.set(alice.id, "theme", "purple" as never)).rejects.toThrow(/expected one of/);
            // And nothing was written.
            expect(await store.get(alice.id, "pageSize")).toBe(25);
        });

    });

    describe("Isolation between users", () => {

        it("does not leak one user's value into another's read", async () => {
            const alice = await users.create({ login: "alice", password: "x" });
            const bob = await users.create({ login: "bob", password: "x" });

            await store.set(alice.id, "theme", "dark");

            expect(await store.get(alice.id, "theme")).toBe("dark");
            expect(await store.get(bob.id, "theme")).toBe("light");
        });

        it("keeps getAll() scoped to the requested user", async () => {
            const alice = await users.create({ login: "alice", password: "x" });
            const bob = await users.create({ login: "bob", password: "x" });

            await store.set(alice.id, "theme", "dark");
            await store.set(bob.id, "pageSize", 100);

            expect(await store.getAll(alice.id)).toEqual({ theme: "dark", pageSize: 25 });
            expect(await store.getAll(bob.id)).toEqual({ theme: "light", pageSize: 100 });
        });

    });

    describe("Owning account deleted", () => {

        it("removes a user's preference rows when their account is deleted (ON DELETE CASCADE)", async () => {
            // Unlike system_users.roleId -> system_roles.id (ON DELETE SET
            // NULL), a preference genuinely has no meaning once its owner is
            // gone, so the migration declares CASCADE here instead.
            const alice = await users.create({ login: "alice", password: "x" });
            await store.set(alice.id, "theme", "dark");

            const before = await db.runner.all(`SELECT * FROM "${PREFERENCES_TABLE}" WHERE "userId" = $1`, alice.id);
            expect(before).toHaveLength(1);

            await db.runner.run(`DELETE FROM "system_users" WHERE "id" = $1`, alice.id);

            const after = await db.runner.all(`SELECT * FROM "${PREFERENCES_TABLE}" WHERE "userId" = $1`, alice.id);
            expect(after).toHaveLength(0);
        });

    });

});
