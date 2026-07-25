import type { TestProject } from "vitest/node";
import { isDatabaseAvailable } from "./pg.fixture";

/**
 * Probes the database once for the whole run, before any test file is collected.
 *
 * The decision has to be known synchronously by the time the suites are declared,
 * which a test file cannot do on its own. It is published here and read back with
 * `inject("databaseAvailable")`.
 */
export default async function setup(project: TestProject): Promise<void> {
    project.provide("databaseAvailable", await isDatabaseAvailable());
}

declare module "vitest" {
    interface ProvidedContext {
        /** False when no PostgreSQL server answered, so the tests that need one are skipped */
        databaseAvailable: boolean;
    }
}
