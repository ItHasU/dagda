import { Migration } from "@dagda/server/src/sql/migrations";

/**
 * Schema history of the application.
 *
 * Versioned migrations are the only way the schema evolves (FEATURES §2): there
 * is no synchronisation from the model, because a renamed field would read as a
 * drop followed by a create — a silent data loss.
 *
 * An id is recorded once applied: never rename one, never insert a new migration
 * before an already released one.
 */
export const APP_MIGRATIONS: Migration[] = [
    {
        id: "0001-initial-schema",
        up: async (tools) => {
            // Creates every table the model declares, in foreign-key order.
            await tools.createAllTables();
        }
    }
];
