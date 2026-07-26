import { TEST_MODEL } from "@dagda/shared/src/entities/_data";
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import { FRAMEWORK_MIGRATIONS } from "../sql/framework.migrations";
import { applyMigrations } from "../sql/migrations";
import { createTestDatabase, TestDatabase } from "../test/pg.fixture";
import { RoleStore } from "./roles";

const available = inject("databaseAvailable");

describe.runIf(available)("RoleStore", () => {

    let db: TestDatabase;
    let roles: RoleStore;

    beforeEach(async () => {
        db = await createTestDatabase("roles");
        await applyMigrations(db.runner, TEST_MODEL, FRAMEWORK_MIGRATIONS, "framework");
        roles = new RoleStore(db.runner, { "users.manage": { label: "Gérer les comptes" }, "roles.manage": { label: "Gérer les rôles" } });
    });

    afterEach(async () => {
        await db?.dispose();
    });

    describe("Creating", () => {

        it("creates a role with its permissions", async () => {
            const role = await roles.create({ name: "Support", permissions: ["users.manage"] });
            expect(role.name).toBe("Support");
            expect(role.permissions).toEqual(["users.manage"]);
            expect(role.id).toBeTypeOf("number");
        });

        it("accepts an empty permission set", async () => {
            const role = await roles.create({ name: "Observateur", permissions: [] });
            expect(role.permissions).toEqual([]);
        });

        it("refuses an empty name", async () => {
            await expect(roles.create({ name: "  ", permissions: [] })).rejects.toThrow(/name cannot be empty/);
        });

        it("refuses a permission that is not declared", async () => {
            await expect(roles.create({ name: "Support", permissions: ["not.a.permission"] }))
                .rejects.toThrow(/Unknown permission/);
        });

        it("refuses a second role with the same name, whatever the case", async () => {
            await roles.create({ name: "Support", permissions: [] });
            await expect(roles.create({ name: "SUPPORT", permissions: [] })).rejects.toThrow();
        });

    });

    describe("Reading", () => {

        it("lists roles alphabetically", async () => {
            await roles.create({ name: "Support", permissions: [] });
            await roles.create({ name: "Administration", permissions: [] });
            expect((await roles.list()).map(r => r.name)).toEqual(["Administration", "Support"]);
        });

        it("finds a role by id, and says so when there is none", async () => {
            const role = await roles.create({ name: "Support", permissions: [] });
            expect((await roles.getById(role.id))?.name).toBe("Support");
            expect(await roles.getById(999999)).toBeNull();
        });

    });

    describe("Updating", () => {

        it("renames a role, keeping its permissions", async () => {
            const role = await roles.create({ name: "Support", permissions: ["users.manage"] });
            const updated = await roles.update(role.id, { name: "Assistance" });
            expect(updated.name).toBe("Assistance");
            expect(updated.permissions).toEqual(["users.manage"]);
        });

        it("replaces the permissions, keeping the name", async () => {
            const role = await roles.create({ name: "Support", permissions: ["users.manage"] });
            const updated = await roles.update(role.id, { permissions: ["roles.manage"] });
            expect(updated.name).toBe("Support");
            expect(updated.permissions).toEqual(["roles.manage"]);
        });

        it("refuses an unknown permission on update too", async () => {
            const role = await roles.create({ name: "Support", permissions: [] });
            await expect(roles.update(role.id, { permissions: ["not.a.permission"] })).rejects.toThrow(/Unknown permission/);
        });

        it("throws when updating a role that does not exist", async () => {
            await expect(roles.update(999999, { name: "Ghost" })).rejects.toThrow(/No role/);
        });

    });

    describe("Deleting", () => {

        it("removes the role", async () => {
            const role = await roles.create({ name: "Support", permissions: [] });
            await roles.delete(role.id);
            expect(await roles.getById(role.id)).toBeNull();
        });

        it("does nothing when the role does not exist", async () => {
            await expect(roles.delete(999999)).resolves.toBeUndefined();
        });

    });

});
