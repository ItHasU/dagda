import { TEST_MODEL } from "@dagda/shared/src/entities/_data";
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import { RoleStore } from "./roles";
import { FRAMEWORK_MIGRATIONS } from "../sql/framework.migrations";
import { applyMigrations } from "../sql/migrations";
import { createTestDatabase, TestDatabase } from "../test/pg.fixture";
import { BOOTSTRAP_LOGIN, BOOTSTRAP_PASSWORD, USERS_TABLE, UserStore } from "./users";

const available = inject("databaseAvailable");

describe.runIf(available)("Accounts", () => {

    let db: TestDatabase;
    let roles: RoleStore;
    let users: UserStore;
    let logged: string[];

    beforeEach(async () => {
        db = await createTestDatabase("users");
        logged = [];
        await applyMigrations(db.runner, TEST_MODEL, FRAMEWORK_MIGRATIONS, "framework");
        roles = new RoleStore(db.runner);
        users = new UserStore(db.runner, roles, (m: string) => logged.push(m));
    });

    afterEach(async () => {
        await db?.dispose();
    });

    describe("Creating", () => {

        it("creates an account that can then log in", async () => {
            const created = await users.create({ login: "alice", password: "hunter2" });
            expect(created.login).toBe("alice");
            expect(created.enabled).toBe(true);
            expect(created.isSuperAdmin).toBe(false);

            const authenticated = await users.authenticate("alice", "hunter2");
            expect(authenticated?.id).toBe(created.id);
        });

        it("falls back to the login as display name", async () => {
            expect((await users.create({ login: "alice", password: "x" })).displayName).toBe("alice");
            expect((await users.create({ login: "bob", password: "x", displayName: "Bob L." })).displayName).toBe("Bob L.");
        });

        it("never keeps the password in what it hands out", async () => {
            const created = await users.create({ login: "alice", password: "hunter2" });
            expect(JSON.stringify(created)).not.toContain("hunter2");
            expect(created).not.toHaveProperty("password");
        });

        it("stores the password hashed", async () => {
            await users.create({ login: "alice", password: "hunter2" });
            const row = await db.runner.get<{ password: string }>(`SELECT "password" FROM "${USERS_TABLE}"`);
            expect(row?.password).not.toContain("hunter2");
            expect(row?.password.startsWith("scrypt:")).toBe(true);
        });

        it("refuses a second account on the same login, whatever the case", async () => {
            // "Admin" and "admin" must not be two accounts: the login form
            // matches without regard to case, so one would shadow the other.
            await users.create({ login: "alice", password: "x" });
            await expect(users.create({ login: "Alice", password: "y" })).rejects.toThrow();
        });

        it("refuses an empty login or password", async () => {
            await expect(users.create({ login: "  ", password: "x" })).rejects.toThrow(/login cannot be empty/);
            await expect(users.create({ login: "alice", password: "" })).rejects.toThrow(/password cannot be empty/);
        });

    });

    describe("Authenticating", () => {

        beforeEach(async () => {
            await users.create({ login: "alice", password: "hunter2" });
        });

        it("accepts the login whatever its case", async () => {
            expect(await users.authenticate("ALICE", "hunter2")).not.toBeNull();
        });

        it("refuses a wrong password", async () => {
            expect(await users.authenticate("alice", "wrong")).toBeNull();
        });

        it("answers the same for an unknown account as for a wrong password", async () => {
            // Distinguishing them tells whoever is probing which logins exist.
            expect(await users.authenticate("nobody", "hunter2")).toBeNull();
            expect(await users.authenticate("alice", "wrong")).toBeNull();
        });

        it("takes comparable time on an unknown account", async () => {
            // An unknown login must not answer instantly while a known one pays
            // for a hash: the difference alone enumerates the accounts.
            const time = async (login: string): Promise<number> => {
                const start = process.hrtime.bigint();
                await users.authenticate(login, "hunter2");
                return Number(process.hrtime.bigint() - start) / 1e6;
            };
            // Warm up, so the first scrypt call does not skew the comparison.
            await time("alice");

            const known = await time("alice");
            const unknown = await time("nobody");
            // Generous on purpose: the assertion is "same order of magnitude",
            // not a benchmark, and a loaded machine must not make it flaky.
            expect(unknown).toBeGreaterThan(known / 4);
        });

        it("refuses a disabled account", async () => {
            const alice = await users.authenticate("alice", "hunter2");
            await users.setEnabled(alice!.id, false);
            expect(await users.authenticate("alice", "hunter2")).toBeNull();
        });

        it("lets a re-enabled account back in", async () => {
            const alice = (await users.list())[0]!;
            await users.setEnabled(alice.id, false);
            await users.setEnabled(alice.id, true);
            expect(await users.authenticate("alice", "hunter2")).not.toBeNull();
        });

    });

    describe("Changing a password", () => {

        it("replaces it when the current one is right", async () => {
            const alice = await users.create({ login: "alice", password: "hunter2" });
            expect(await users.changePassword(alice.id, "hunter2", "next")).toBe(true);
            expect(await users.authenticate("alice", "next")).not.toBeNull();
            expect(await users.authenticate("alice", "hunter2")).toBeNull();
        });

        it("changes nothing when the current one is wrong", async () => {
            const alice = await users.create({ login: "alice", password: "hunter2" });
            expect(await users.changePassword(alice.id, "wrong", "next")).toBe(false);
            expect(await users.authenticate("alice", "hunter2")).not.toBeNull();
        });

        it("lets an administrator set one without knowing the old", async () => {
            const alice = await users.create({ login: "alice", password: "hunter2" });
            await users.setPassword(alice.id, "reset");
            expect(await users.authenticate("alice", "reset")).not.toBeNull();
        });

        it("refuses an empty password", async () => {
            const alice = await users.create({ login: "alice", password: "hunter2" });
            await expect(users.setPassword(alice.id, "")).rejects.toThrow(/cannot be empty/);
        });

    });

    describe("Bootstrap account", () => {

        it("creates admin/admin on an empty database", async () => {
            // Before an account exists nobody can be invited, so this first one
            // escapes the normal path (FEATURES §7.1).
            const admin = await users.ensureBootstrapAdmin();
            expect(admin?.login).toBe(BOOTSTRAP_LOGIN);
            expect(admin?.isSuperAdmin).toBe(true);
            expect(await users.authenticate(BOOTSTRAP_LOGIN, BOOTSTRAP_PASSWORD)).not.toBeNull();
        });

        it("says out loud what it just created", async () => {
            await users.ensureBootstrapAdmin();
            expect(logged.join("\n")).toMatch(/Created the first account "admin"/);
        });

        it("creates nothing when an account already exists", async () => {
            await users.create({ login: "alice", password: "hunter2" });
            expect(await users.ensureBootstrapAdmin()).toBeNull();
            expect(await users.count()).toBe(1);
        });

        it("does not recreate itself once the admin was renamed away", async () => {
            await users.ensureBootstrapAdmin();
            expect(await users.ensureBootstrapAdmin()).toBeNull();
            expect(await users.count()).toBe(1);
        });

        it("warns at every start while the default password still works", async () => {
            await users.ensureBootstrapAdmin();
            logged = [];
            await users.ensureBootstrapAdmin();
            expect(logged.join("\n")).toMatch(/WARNING.*still uses its default password/);
        });

        it("stops warning once the password was changed", async () => {
            const admin = await users.ensureBootstrapAdmin();
            await users.setPassword(admin!.id, "something else");
            logged = [];
            await users.ensureBootstrapAdmin();
            expect(logged.join("\n")).not.toMatch(/WARNING/);
        });

        it("stops warning once the account was disabled", async () => {
            const admin = await users.ensureBootstrapAdmin();
            await users.setEnabled(admin!.id, false);
            logged = [];
            await users.ensureBootstrapAdmin();
            expect(logged.join("\n")).not.toMatch(/WARNING/);
        });

    });

    describe("Invitations", () => {

        describe("Inviting", () => {

            it("creates a disabled account nobody can log into yet", async () => {
                const { user } = await users.invite({ login: "alice" });
                expect(user.enabled).toBe(false);
                // Not even by guessing there is no password: the row still
                // needs one, so it is filled with something unusable.
                expect(await users.authenticate("alice", "")).toBeNull();
            });

            it("returns a token that resolves back to the account", async () => {
                const { user, token } = await users.invite({ login: "alice" });
                const found = await users.getByInvitationToken(token);
                expect(found?.id).toBe(user.id);
            });

            it("sets an expiry in the future", async () => {
                const before = Date.now();
                const { expiresAt } = await users.invite({ login: "alice" });
                expect(expiresAt).toBeGreaterThan(before);
            });

            it("carries the same optional fields as create()", async () => {
                const { user } = await users.invite({ login: "alice", displayName: "Alice L.", isSuperAdmin: true });
                expect(user.displayName).toBe("Alice L.");
                expect(user.isSuperAdmin).toBe(true);
            });

        });

        describe("Accepting", () => {

            it("sets the password, enables the account, and lets it log in", async () => {
                const { token } = await users.invite({ login: "alice" });
                const accepted = await users.acceptInvitation(token, "hunter2");
                expect(accepted?.enabled).toBe(true);
                expect(await users.authenticate("alice", "hunter2")).not.toBeNull();
            });

            it("burns the token, so the link cannot be replayed", async () => {
                const { token } = await users.invite({ login: "alice" });
                await users.acceptInvitation(token, "hunter2");
                expect(await users.acceptInvitation(token, "again")).toBeNull();
            });

            it("returns null for a token that never existed", async () => {
                expect(await users.acceptInvitation("nonsense", "hunter2")).toBeNull();
            });

            it("refuses an empty password", async () => {
                const { token } = await users.invite({ login: "alice" });
                await expect(users.acceptInvitation(token, "")).rejects.toThrow(/cannot be empty/);
            });

        });

        describe("Reinviting (password reset, FEATURES §7)", () => {

            it("issues a fresh token for an existing, already-enabled account", async () => {
                const alice = await users.create({ login: "alice", password: "hunter2" });
                const { token } = await users.reinvite(alice.id);
                expect(await users.getByInvitationToken(token)).not.toBeNull();
            });

            it("leaves the old password working until the link is used", async () => {
                const alice = await users.create({ login: "alice", password: "hunter2" });
                await users.reinvite(alice.id);
                // Deliberate (FEATURES §7): this only adds a second way in,
                // it never removes the first — no mail service confirms the
                // link was even received.
                expect(await users.authenticate("alice", "hunter2")).not.toBeNull();
            });

            it("replaces the old password once the new link is used", async () => {
                const alice = await users.create({ login: "alice", password: "hunter2" });
                const { token } = await users.reinvite(alice.id);
                await users.acceptInvitation(token, "newpass");
                expect(await users.authenticate("alice", "hunter2")).toBeNull();
                expect(await users.authenticate("alice", "newpass")).not.toBeNull();
            });

            it("invalidates a previous, unused link", async () => {
                const alice = await users.create({ login: "alice", password: "hunter2" });
                const first = await users.reinvite(alice.id);
                await users.reinvite(alice.id);
                expect(await users.getByInvitationToken(first.token)).toBeNull();
            });

        });

    });

    describe("Reading", () => {

        it("lists the accounts by login, disabled ones included", async () => {
            // The administration screen has to show a disabled account, since
            // disabling is how an account is retired (FEATURES §11.4).
            await users.create({ login: "carol", password: "x" });
            const bob = await users.create({ login: "bob", password: "x" });
            await users.setEnabled(bob.id, false);

            expect((await users.list()).map(u => u.login)).toEqual(["bob", "carol"]);
        });

        it("finds an account by id, and says so when there is none", async () => {
            const alice = await users.create({ login: "alice", password: "x" });
            expect((await users.getById(alice.id))?.login).toBe("alice");
            expect(await users.getById(999999)).toBeNull();
        });

    });

    describe("Roles (FEATURES §7.1)", () => {

        it("carries no role and no permission by default", async () => {
            const alice = await users.create({ login: "alice", password: "x" });
            expect(alice.roleId).toBeNull();
            expect(alice.permissions).toEqual([]);
        });

        it("resolves the permissions of the role it is given", async () => {
            const role = await roles.create({ name: "Support", permissions: ["users.manage"] });
            const alice = await users.create({ login: "alice", password: "x" });
            await users.setRole(alice.id, role.id);

            const updated = await users.getById(alice.id);
            expect(updated?.roleId).toBe(role.id);
            expect(updated?.permissions).toEqual(["users.manage"]);
        });

        it("goes back to no permission once the role is cleared", async () => {
            const role = await roles.create({ name: "Support", permissions: ["users.manage"] });
            const alice = await users.create({ login: "alice", password: "x" });
            await users.setRole(alice.id, role.id);
            await users.setRole(alice.id, null);

            const updated = await users.getById(alice.id);
            expect(updated?.roleId).toBeNull();
            expect(updated?.permissions).toEqual([]);
        });

        it("does not enumerate permissions for a super-admin, its flag is the whole check", async () => {
            const role = await roles.create({ name: "Support", permissions: ["users.manage"] });
            const admin = await users.create({ login: "root", password: "x", isSuperAdmin: true });
            await users.setRole(admin.id, role.id);

            const updated = await users.getById(admin.id);
            expect(updated?.isSuperAdmin).toBe(true);
            expect(updated?.permissions).toEqual([]);
        });

        it("follows a role's permissions being edited, without reassigning it", async () => {
            const role = await roles.create({ name: "Support", permissions: ["users.manage"] });
            const alice = await users.create({ login: "alice", password: "x" });
            await users.setRole(alice.id, role.id);

            await roles.update(role.id, { permissions: ["roles.manage"] });

            expect((await users.getById(alice.id))?.permissions).toEqual(["roles.manage"]);
        });

        it("unassigns a deleted role from every account that carried it", async () => {
            // The framework migration's ON DELETE SET NULL, not application
            // code: deleting a role must never leave an account referencing
            // one that no longer exists.
            const role = await roles.create({ name: "Support", permissions: ["users.manage"] });
            const alice = await users.create({ login: "alice", password: "x" });
            await users.setRole(alice.id, role.id);

            await roles.delete(role.id);

            const updated = await users.getById(alice.id);
            expect(updated?.roleId).toBeNull();
            expect(updated?.permissions).toEqual([]);
        });

    });

});
