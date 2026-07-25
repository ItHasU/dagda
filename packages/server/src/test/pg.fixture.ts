import { PGRunner } from "../sql/impl/pg.runner";

/**
 * Declared here rather than next to the global setup that provides the value.
 *
 * A spec reads it with `inject("databaseAvailable")` and imports this fixture,
 * never the global setup — which an application's tsconfig does not compile at
 * all, leaving `inject` typed as taking `never`.
 */
declare module "vitest" {
    interface ProvidedContext {
        /** False when no PostgreSQL server answered, so the tests that need one are skipped */
        databaseAvailable: boolean;
    }
}

/**
 * Connection string used by the tests.
 *
 * Defaults to the database started by `npm run db:up` (see docker-compose.yml).
 * Override with DAGDA_TEST_DB_URL to test against another server.
 */
export const TEST_DB_URL: string = process.env["DAGDA_TEST_DB_URL"]
    ?? "postgresql://dagda:dagda@localhost:5432/dagda";

/**
 * When set, a database that cannot be reached is a failure rather than a reason
 * to skip. Continuous integration sets it, so a broken fixture cannot pass
 * silently as "all tests skipped".
 */
const DB_REQUIRED: boolean = process.env["DAGDA_REQUIRE_DB"] === "1";

/**
 * Probe the database once, at module load.
 *
 * The decision has to be taken before the suites are declared, which is why this
 * is a top-level await rather than a beforeAll: `describe.runIf()` needs a value,
 * not a promise.
 */
export async function isDatabaseAvailable(): Promise<boolean> {
    const runner = new PGRunner(TEST_DB_URL);
    try {
        await runner.get("SELECT 1");
        return true;
    } catch (error) {
        if (DB_REQUIRED) {
            throw new Error(`DAGDA_REQUIRE_DB is set but ${TEST_DB_URL} is unreachable: ${error}`);
        }
        console.warn(`No database at ${TEST_DB_URL}, skipping the tests that need one. Run "npm run db:up" to start it.`);
        return false;
    } finally {
        await runner.close().catch(() => { /* the pool may never have opened */ });
    }
}

/**
 * A database isolated from the rest of the suite.
 *
 * Isolation is done with a dedicated schema rather than a dedicated database:
 * it is created and dropped in milliseconds, and two suites running in parallel
 * never see each other's tables.
 */
export interface TestDatabase {
    /** Runner bound to the scratch schema */
    runner: PGRunner;
    /** Name of the scratch schema, mostly useful in error messages */
    schema: string;
    /** Drop the schema and close the pool */
    dispose(): Promise<void>;
}

/** Counter making schema names unique within a single process */
let _schemaCounter = 0;

/**
 * Create a scratch schema and a runner whose search_path points at it.
 * Every unqualified table the test creates lands in that schema.
 */
export async function createTestDatabase(label: string = "test"): Promise<TestDatabase> {
    const safeLabel = label.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const schema = `dagda_test_${safeLabel}_${process.pid}_${++_schemaCounter}`;

    // The schema has to exist before the pooled connections set their search_path,
    // so it is created through a separate short-lived runner.
    const setup = new PGRunner(TEST_DB_URL);
    try {
        await setup.run(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await setup.run(`CREATE SCHEMA "${schema}"`);
    } finally {
        await setup.close();
    }

    const url = new URL(TEST_DB_URL);
    url.searchParams.set("options", `-c search_path=${schema}`);
    const runner = new PGRunner(url.toString());

    return {
        runner,
        schema,
        dispose: async (): Promise<void> => {
            await runner.close();
            const teardown = new PGRunner(TEST_DB_URL);
            try {
                await teardown.run(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
            } finally {
                await teardown.close();
            }
        }
    };
}
