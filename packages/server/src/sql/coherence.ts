import { EntitiesModel } from "@dagda/shared/src/entities/model";
import { AbstractSQLRunner } from "./runner";

/**
 * Checks the declared model against the schema actually in the database.
 *
 * This is the guard rail of the "versioned migrations only" decision
 * (FEATURES §2). Without it a forgotten migration only shows up as an SQL error
 * at runtime, on the first screen that happens to read the missing column —
 * usually far from the cause, and in front of a user.
 *
 * It reports what is missing, never what is extra: a column the model no longer
 * declares is legitimate, since a migration may keep it around until the data is
 * moved, and dropping it is the developer's call.
 */

/** One discrepancy between the model and the schema */
export interface SchemaDiscrepancy {
    table: string;
    /** Undefined when the whole table is missing */
    field?: string;
    message: string;
}

interface ColumnRow {
    table_name: string;
    column_name: string;
}

/** @returns the discrepancies, empty when the schema matches the model */
export async function getSchemaDiscrepancies(
    runner: AbstractSQLRunner,
    model: EntitiesModel<any, any>
): Promise<SchemaDiscrepancy[]> {
    const expectedTables = new Map<string, string>();
    for (const table of model.getTableNames()) {
        expectedTables.set(model.getTableSqlName(table), String(table));
    }

    // One query for everything: the check runs at every startup, so it must not
    // cost one round trip per table.
    const rows = await runner.all<ColumnRow>(
        `SELECT table_name, column_name
         FROM information_schema.columns
         WHERE table_schema = ANY (current_schemas(false))
           AND table_name = ANY ($1)`,
        // pg-format is not involved here: the driver handles the array parameter.
        [...expectedTables.keys()] as unknown as string
    );

    const columnsByTable = new Map<string, Set<string>>();
    for (const row of rows) {
        let columns = columnsByTable.get(row.table_name);
        if (columns == null) {
            columnsByTable.set(row.table_name, columns = new Set());
        }
        columns.add(row.column_name);
    }

    const discrepancies: SchemaDiscrepancy[] = [];
    for (const [sqlName, logicalName] of expectedTables) {
        const columns = columnsByTable.get(sqlName);
        if (columns == null) {
            discrepancies.push({
                table: logicalName,
                message: `the table "${sqlName}" declared by the model does not exist, a migration is probably missing`
            });
            continue;
        }
        for (const field of model.getTableFieldNames(logicalName)) {
            if (!columns.has(String(field))) {
                discrepancies.push({
                    table: logicalName,
                    field: String(field),
                    message: `the column "${sqlName}"."${String(field)}" declared by the model does not exist, a migration is probably missing`
                });
            }
        }
    }
    return discrepancies;
}

/**
 * @throws if the schema does not match the model.
 * Called at startup, before the server accepts any request.
 */
export async function checkSchemaCoherence(
    runner: AbstractSQLRunner,
    model: EntitiesModel<any, any>
): Promise<void> {
    const discrepancies = await getSchemaDiscrepancies(runner, model);
    if (discrepancies.length === 0) {
        return;
    }
    const details = discrepancies.map(d => `  - ${d.message}`).join("\n");
    throw new Error(`The database schema does not match the declared model:\n${details}`);
}
