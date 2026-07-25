import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createTestDatabase, TestDatabase } from "../../test/pg.fixture";

// Probed by the global setup, before any suite is declared: "PostgreSQL only"
// (FEATURES §0) rules out testing the runner against anything else, so without a
// server there is nothing meaningful left to run here.
const available = inject("databaseAvailable");

describe.runIf(available)("PGRunner", () => {

    let db: TestDatabase;

    beforeAll(async () => {
        db = await createTestDatabase("pg_runner");
        await db.runner.run(`CREATE TABLE items (id SERIAL PRIMARY KEY, label TEXT NOT NULL, qty INTEGER)`);
    });

    afterAll(async () => {
        await db?.dispose();
    });

    it("runs a query and reads a single row back", async () => {
        const row = await db.runner.get<{ answer: number }>("SELECT 42 AS answer");
        expect(row?.answer).toBe(42);
    });

    it("returns null when a query matches no row", async () => {
        const row = await db.runner.get("SELECT 1 WHERE false");
        expect(row).toBeNull();
    });

    it("rejects when a query would return more than one row", async () => {
        await expect(db.runner.get("SELECT * FROM (VALUES (1), (2)) AS t")).rejects.toThrow();
    });

    it("passes parameters instead of interpolating them", async () => {
        // A value that would break the query if it were concatenated.
        const injected = "'; DROP TABLE items; --";
        const row = await db.runner.get<{ value: string }>("SELECT $1::text AS value", injected);
        expect(row?.value).toBe(injected);
        // The table is still there.
        await expect(db.runner.all("SELECT * FROM items")).resolves.toBeInstanceOf(Array);
    });

    it("returns the id of an inserted row", async () => {
        const first = await db.runner.insert(`INSERT INTO items (label, qty) VALUES ($1, $2)`, "first", 1);
        const second = await db.runner.insert(`INSERT INTO items (label, qty) VALUES ($1, $2)`, "second", 2);
        expect(first).toBeTypeOf("number");
        expect(second).toBe(first! + 1);
    });

    it("lists rows with all()", async () => {
        const rows = await db.runner.all<{ label: string }>(`SELECT label FROM items ORDER BY id`);
        expect(rows.map(r => r.label)).toEqual(["first", "second"]);
    });

    it("commits the work done inside a transaction", async () => {
        await db.runner.withTransaction(async (connection) => {
            await connection.run(`INSERT INTO items (label, qty) VALUES ($1, $2)`, "committed", 3);
        });
        const row = await db.runner.get(`SELECT * FROM items WHERE label = $1`, "committed");
        expect(row).not.toBeNull();
    });

    it("rolls back the whole transaction when the callback throws", async () => {
        await expect(db.runner.withTransaction(async (connection) => {
            await connection.run(`INSERT INTO items (label, qty) VALUES ($1, $2)`, "rolled-back", 4);
            throw new Error("boom");
        })).rejects.toThrow("boom");

        const row = await db.runner.get(`SELECT * FROM items WHERE label = $1`, "rolled-back");
        expect(row, "the failed insert must not have survived").toBeNull();
    });

    it("gives back the connection even when the callback throws", async () => {
        await expect(db.runner.withReservedConnection(async () => {
            throw new Error("boom");
        })).rejects.toThrow("boom");

        // If the connection had leaked, the pool would eventually starve. Ten
        // sequential reservations are enough to notice with the default pool size.
        for (let i = 0; i < 10; i++) {
            await db.runner.get("SELECT 1");
        }
    });

    it("isolates each test database in its own schema", async () => {
        const other = await createTestDatabase("pg_runner_other");
        try {
            expect(other.schema).not.toBe(db.schema);
            // `items` exists in the first schema and must not be visible from the second.
            await expect(other.runner.all("SELECT * FROM items")).rejects.toThrow();
        } finally {
            await other.dispose();
        }
    });

});
