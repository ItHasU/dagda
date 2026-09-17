import { Migration } from "@dagda/server/src/sql/migrations";
import { getCreateTableStatement } from "@dagda/server/src/sql/schema";
import { APP_MODEL } from "@dagda-app/shared/src/entities/model";

/**
 * Schema history of the application.
 *
 * Versioned migrations are the only way the schema evolves (FEATURES §2): there
 * is no synchronisation from the model, because a renamed field would read as a
 * drop followed by a create — a silent data loss.
 *
 * An id is recorded once applied: never rename one, never insert a new migration
 * before an already released one.
 *
 * `createTable`/`createAllTables` read the model as it stands *today*, not as
 * it stood when the migration was written — so a table added to the model
 * after "0001-initial-schema" shipped is *also* created by that migration's
 * `createAllTables()` the moment it ever runs on a brand-new database. A
 * plain `createTable()` for that same table below would then collide with
 * it. `IF NOT EXISTS` is the fix (see "0003-add-notes-table"): a no-op on the
 * fresh database where 0001 just created it, the only thing that creates it
 * on one that already ran 0001 before the table existed.
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
    },
    {
        id: "0003-add-notes-table",
        up: async (tools) => {
            // IF NOT EXISTS, not tools.createTable(): see the module comment
            // above — on a fresh database "0001-initial-schema" already
            // created "notes", since it builds from the model as it stands
            // today, which now includes it.
            await tools.run(getCreateTableStatement(APP_MODEL, "notes", { ifNotExists: true }));
        }
    }
];
