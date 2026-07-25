import { SETTINGS_TABLE } from "../settings/store";
import { Migration } from "./migrations";
import { qi } from "./schema";

/**
 * Migrations shipped with the framework, applied before the application's.
 *
 * They own the `system_` tables (FEATURES §2, §11.4): an application never
 * declares them and never has to do anything to get accounts, roles, settings
 * and preferences in working order.
 *
 * Rule for whoever adds one: an id is recorded once applied, so it is never
 * renamed and never reordered before an already released one.
 */
export const FRAMEWORK_MIGRATIONS: Migration[] = [
    {
        id: "0001-settings",
        up: async (tools) => {
            // Not generated from the entities model on purpose: a system table
            // is not part of an application's model, and generating it would
            // mean an application could rename its columns.
            await tools.run(
                `CREATE TABLE ${qi(SETTINGS_TABLE)} (
                    ${qi("key")} TEXT PRIMARY KEY,
                    ${qi("value")} TEXT NOT NULL,
                    ${qi("encrypted")} BOOLEAN NOT NULL DEFAULT FALSE,
                    ${qi("updatedAt")} TIMESTAMPTZ NOT NULL DEFAULT now()
                )`
            );
        }
    }
];
