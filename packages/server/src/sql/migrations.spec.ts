import { TEST_MODEL } from "@dagda/shared/src/entities/_data";
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import { getSchemaDiscrepancies } from "./coherence";
import { applyMigrations, getAppliedMigrations, Migration, MIGRATIONS_TABLE } from "./migrations";
import { createTestDatabase, TestDatabase } from "../test/pg.fixture";

const available = inject("databaseAvailable");

/** The first migration an application writes: the whole model at once */
const INITIAL: Migration = {
    id: "0001-initial-schema",
    up: async (tools) => {
        await tools.createAllTables();
    }
};

describe.runIf(available)("Migrations", () => {

    let db: TestDatabase;

    beforeEach(async () => {
        // A schema per test: migrations are about a database's history, so two
        // tests sharing one would see each other's past.
        db = await createTestDatabase("migrations");
    });

    afterEach(async () => {
        await db?.dispose();
    });

    it("creates the tables of the model, prefixed", async () => {
        await applyMigrations(db.runner, TEST_MODEL, [INITIAL], "app");

        const rows = await db.runner.all<{ table_name: string }>(
            `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
            db.schema
        );
        const names = rows.map(r => r.table_name);
        expect(names).toContain("data_users");
        expect(names).toContain("data_posts");
        expect(names).toContain(MIGRATIONS_TABLE);
    });

    it("records what it applied", async () => {
        const applied = await applyMigrations(db.runner, TEST_MODEL, [INITIAL], "app");
        expect(applied).toEqual(["0001-initial-schema"]);
        expect(await getAppliedMigrations(db.runner, "app")).toEqual(["0001-initial-schema"]);
    });

    it("does not run a migration twice", async () => {
        await applyMigrations(db.runner, TEST_MODEL, [INITIAL], "app");
        // Would throw "relation already exists" if it ran again.
        const second = await applyMigrations(db.runner, TEST_MODEL, [INITIAL], "app");
        expect(second).toEqual([]);
    });

    it("picks up where it stopped when a new migration is added", async () => {
        await applyMigrations(db.runner, TEST_MODEL, [INITIAL], "app");

        const added: Migration = {
            id: "0002-add-index",
            up: async (tools) => {
                await tools.run(`CREATE INDEX "posts_author" ON "data_posts" ("author")`);
            }
        };
        const applied = await applyMigrations(db.runner, TEST_MODEL, [INITIAL, added], "app");
        expect(applied).toEqual(["0002-add-index"]);
    });

    it("keeps the two sources apart", async () => {
        // Same id on both sides must not make one hide the other.
        const framework: Migration = { id: "0001-initial-schema", up: async (tools) => { await tools.run(`SELECT 1`); } };
        await applyMigrations(db.runner, TEST_MODEL, [framework], "framework");
        const app = await applyMigrations(db.runner, TEST_MODEL, [INITIAL], "app");
        expect(app).toEqual(["0001-initial-schema"]);
        expect(await getAppliedMigrations(db.runner, "framework")).toEqual(["0001-initial-schema"]);
    });

    it("leaves nothing behind when a migration fails", async () => {
        const broken: Migration = {
            id: "0001-broken",
            up: async (tools) => {
                await tools.createTable("users");
                throw new Error("boom");
            }
        };
        await expect(applyMigrations(db.runner, TEST_MODEL, [broken], "app")).rejects.toThrow("boom");

        // Neither the table it had started to create...
        const tables = await db.runner.all<{ table_name: string }>(
            `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`, db.schema
        );
        expect(tables.map(r => r.table_name)).not.toContain("data_users");
        // ...nor the line saying it was applied.
        expect(await getAppliedMigrations(db.runner, "app")).toEqual([]);
    });

    it("keeps the migrations applied before a failing one", async () => {
        const broken: Migration = { id: "0002-broken", up: async () => { throw new Error("boom"); } };
        await expect(applyMigrations(db.runner, TEST_MODEL, [INITIAL, broken], "app")).rejects.toThrow("boom");
        expect(await getAppliedMigrations(db.runner, "app")).toEqual(["0001-initial-schema"]);
    });

    it("refuses two migrations sharing an id", async () => {
        // Otherwise the second would look already applied and be skipped in silence.
        const twin: Migration = { id: "0001-initial-schema", up: async () => { } };
        await expect(applyMigrations(db.runner, TEST_MODEL, [INITIAL, twin], "app"))
            .rejects.toThrow(/share the id/);
    });

    it("writes and reads an entity through the prefixed table", async () => {
        await applyMigrations(db.runner, TEST_MODEL, [INITIAL], "app");
        await db.runner.run(
            `INSERT INTO "data_users" ("name", "surname", "age") VALUES ($1, $2, $3)`,
            "John", "Doe", 42
        );
        const row = await db.runner.get<{ name: string }>(`SELECT "name" FROM "data_users"`);
        expect(row?.name).toBe("John");
    });

    it("enforces the foreign key it declared", async () => {
        await applyMigrations(db.runner, TEST_MODEL, [INITIAL], "app");
        await expect(db.runner.run(
            `INSERT INTO "data_posts" ("author", "title", "content", "status", "kind") VALUES ($1, $2, $3, $4, $5)`,
            999, "t", "c", 1, "note"
        )).rejects.toThrow();
    });

});

describe.runIf(available)("Schema coherence", () => {

    let db: TestDatabase;

    beforeEach(async () => {
        db = await createTestDatabase("coherence");
    });

    afterEach(async () => {
        await db?.dispose();
    });

    it("reports every declared table as missing on an empty database", async () => {
        const discrepancies = await getSchemaDiscrepancies(db.runner, TEST_MODEL);
        expect(discrepancies.map(d => d.table).sort()).toEqual(["posts", "users"]);
        expect(discrepancies[0].message).toContain("migration");
    });

    it("says nothing once the migrations have run", async () => {
        await applyMigrations(db.runner, TEST_MODEL, [INITIAL], "app");
        expect(await getSchemaDiscrepancies(db.runner, TEST_MODEL)).toEqual([]);
    });

    it("catches a column the model declares and the schema lacks", async () => {
        // Exactly what a forgotten migration looks like.
        await applyMigrations(db.runner, TEST_MODEL, [INITIAL], "app");
        await db.runner.run(`ALTER TABLE "data_users" DROP COLUMN "age"`);

        const discrepancies = await getSchemaDiscrepancies(db.runner, TEST_MODEL);
        expect(discrepancies).toHaveLength(1);
        expect(discrepancies[0].table).toBe("users");
        expect(discrepancies[0].field).toBe("age");
    });

    it("ignores a column the model no longer declares", async () => {
        // A migration may keep it while the data moves; dropping it is a decision.
        await applyMigrations(db.runner, TEST_MODEL, [INITIAL], "app");
        await db.runner.run(`ALTER TABLE "data_users" ADD COLUMN "legacy" TEXT`);
        expect(await getSchemaDiscrepancies(db.runner, TEST_MODEL)).toEqual([]);
    });

});
