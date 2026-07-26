import { TEST_MODEL } from "@dagda/shared/src/entities/_data";
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import { RoleStore } from "../auth/roles";
import { UserStore } from "../auth/users";
import { applyMigrations } from "../sql/migrations";
import { FRAMEWORK_MIGRATIONS } from "../sql/framework.migrations";
import { createTestDatabase, TestDatabase } from "../test/pg.fixture";
import { AuditLogStore, AUDIT_LOG_TABLE } from "./store";

const available = inject("databaseAvailable");

interface AuditLogRow {
    id: number;
    userId: number | null;
    kind: string;
    name: string | null;
    details: string | null;
}

describe.runIf(available)("Audit log store", () => {

    let db: TestDatabase;
    let store: AuditLogStore;
    let users: UserStore;

    beforeEach(async () => {
        db = await createTestDatabase("audit-log");
        await applyMigrations(db.runner, TEST_MODEL, FRAMEWORK_MIGRATIONS, "framework");
        store = new AuditLogStore(db.runner);
        users = new UserStore(db.runner, new RoleStore(db.runner));
    });

    afterEach(async () => {
        await db?.dispose();
    });

    it("records a row for a successful action", async () => {
        const alice = await users.create({ login: "alice", password: "x" });
        await store.record(alice.id, "action", "setUserEnabled", { id: alice.id, enabled: false });

        const rows = await db.runner.all<AuditLogRow>(`SELECT * FROM "${AUDIT_LOG_TABLE}"`);
        expect(rows).toHaveLength(1);
        expect(rows[0].userId).toBe(alice.id);
        expect(rows[0].kind).toBe("action");
        expect(rows[0].name).toBe("setUserEnabled");
        expect(JSON.parse(rows[0].details!)).toEqual({ id: alice.id, enabled: false });
    });

    it("accepts a null user id, for a server-initiated submit", async () => {
        await store.record(null, "submit", null, { operations: [] });

        const rows = await db.runner.all<AuditLogRow>(`SELECT * FROM "${AUDIT_LOG_TABLE}"`);
        expect(rows).toHaveLength(1);
        expect(rows[0].userId).toBeNull();
        expect(rows[0].name).toBeNull();
    });

    it("keeps the row when its user is deleted, unlinking rather than cascading", async () => {
        const alice = await users.create({ login: "alice", password: "x" });
        await store.record(alice.id, "action", "listUsers", []);

        await db.runner.run(`DELETE FROM "system_users" WHERE "id" = $1`, alice.id);

        const rows = await db.runner.all<AuditLogRow>(`SELECT * FROM "${AUDIT_LOG_TABLE}"`);
        expect(rows).toHaveLength(1);
        expect(rows[0].userId).toBeNull();
    });

});
