import { EntitiesModel, SYSTEM_TABLE_PREFIX } from "@dagda/shared/src/entities/model";
import { getCreateTableStatement, getTableCreationOrder, qi } from "./schema";
import { AbstractSQLRunner, SQLConnection, SQLValue } from "./runner";

/** Table holding what has already been applied */
export const MIGRATIONS_TABLE = `${SYSTEM_TABLE_PREFIX}migrations`;

/**
 * Who owns a migration.
 *
 * The two sets are distinct (FEATURES §2): the framework ships its own and
 * applies them itself, the application writes the ones for its business tables.
 * Keeping the source in the ledger means the two numbering schemes can never
 * collide, and that adding a framework migration does not renumber anything.
 */
export type MigrationSource = "framework" | "app";

/** What a migration is handed to do its work */
export interface MigrationTools {
    /** The connection of the surrounding transaction */
    connection: SQLConnection;

    /**
     * Create a table as the model declares it.
     * Spares hand-typing the DDL of a table already described; the migration
     * stays explicit about *when* it happens.
     */
    createTable(table: string): Promise<void>;

    /** Create every table of the model, in foreign-key order. For a first migration. */
    createAllTables(): Promise<void>;

    /** Anything the model cannot express */
    run(query: string, ...params: SQLValue[]): Promise<void>;
}

/** One step of schema evolution */
export interface Migration {
    /**
     * Stable identifier, recorded once applied.
     * Never rename an applied migration: the ledger keys on this, so a rename
     * makes it run a second time.
     */
    id: string;
    /** Apply the migration. Runs inside a transaction. */
    up(tools: MigrationTools): Promise<void>;
}

/** A migration that has been applied */
export interface AppliedMigration {
    id: string;
    source: MigrationSource;
}

/** Make sure the ledger exists. Idempotent, and the only unversioned DDL. */
async function ensureLedger(runner: AbstractSQLRunner): Promise<void> {
    await runner.run(
        `CREATE TABLE IF NOT EXISTS ${qi(MIGRATIONS_TABLE)} (
            ${qi("id")} TEXT NOT NULL,
            ${qi("source")} TEXT NOT NULL,
            ${qi("appliedAt")} TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (${qi("source")}, ${qi("id")})
        )`
    );
}

/** @returns what has already been applied, for a given source */
export async function getAppliedMigrations(runner: AbstractSQLRunner, source: MigrationSource): Promise<string[]> {
    await ensureLedger(runner);
    const rows = await runner.all<{ id: string }>(
        `SELECT ${qi("id")} FROM ${qi(MIGRATIONS_TABLE)} WHERE ${qi("source")} = $1`, source
    );
    return rows.map(row => row.id);
}

/**
 * Apply the migrations that have not run yet, in declaration order.
 *
 * Each migration runs in its own transaction, together with the line that
 * records it: a migration that fails leaves nothing behind, and never counts as
 * applied. The ones before it stay applied — re-running picks up where it stopped.
 *
 * @returns the ids applied by this call
 */
export async function applyMigrations(
    runner: AbstractSQLRunner,
    model: EntitiesModel<any, any>,
    migrations: Migration[],
    source: MigrationSource
): Promise<string[]> {
    // A duplicated id would silently skip a migration: the second one would look
    // already applied. Cheap to check, impossible to diagnose otherwise.
    const seen = new Set<string>();
    for (const migration of migrations) {
        if (seen.has(migration.id)) {
            throw new Error(`Two ${source} migrations share the id "${migration.id}"`);
        }
        seen.add(migration.id);
    }

    const applied = new Set(await getAppliedMigrations(runner, source));
    const done: string[] = [];

    for (const migration of migrations) {
        if (applied.has(migration.id)) {
            continue;
        }
        console.log(`Applying ${source} migration "${migration.id}"...`);
        await runner.withTransaction(async (connection) => {
            const tools: MigrationTools = {
                connection,
                createTable: async (table: string) => {
                    await connection.run(getCreateTableStatement(model, table));
                },
                createAllTables: async () => {
                    for (const table of getTableCreationOrder(model)) {
                        await connection.run(getCreateTableStatement(model, table));
                    }
                },
                run: (query: string, ...params: SQLValue[]) => connection.run(query, ...params)
            };
            await migration.up(tools);
            await connection.run(
                `INSERT INTO ${qi(MIGRATIONS_TABLE)} (${qi("id")}, ${qi("source")}) VALUES ($1, $2)`,
                migration.id, source
            );
        });
        done.push(migration.id);
    }

    return done;
}
