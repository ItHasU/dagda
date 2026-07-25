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
    },
    {
        id: "0002-drop-users-table",
        up: async (tools) => {
            // Accounts became framework data (FEATURES §11.4), so the
            // application no longer keeps its own copy. `projects.userId` now
            // holds a Dagda account id.
            //
            // IF EXISTS because a database created after this table left the
            // model never had it: the first migration builds from the model as
            // it stands today.
            await tools.run(`DROP TABLE IF EXISTS "data_users"`);
        }
    }
];
