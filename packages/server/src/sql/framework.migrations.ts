import { USERS_TABLE } from "../auth/users";
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
    },
    {
        id: "0002-users",
        up: async (tools) => {
            await tools.run(
                `CREATE TABLE ${qi(USERS_TABLE)} (
                    ${qi("id")} SERIAL PRIMARY KEY,
                    ${qi("login")} TEXT NOT NULL,
                    ${qi("displayName")} TEXT NOT NULL,
                    -- The whole recipe, cost parameters included, not just a digest.
                    ${qi("password")} TEXT NOT NULL,
                    ${qi("isSuperAdmin")} BOOLEAN NOT NULL DEFAULT FALSE,
                    -- An account is disabled rather than deleted: application
                    -- entities reference it (FEATURES §11.4).
                    ${qi("enabled")} BOOLEAN NOT NULL DEFAULT TRUE,
                    ${qi("createdAt")} TIMESTAMPTZ NOT NULL DEFAULT now()
                )`
            );
            // Case-insensitive: "Admin" and "admin" must not be two accounts,
            // since the login form matches without regard to case.
            await tools.run(
                `CREATE UNIQUE INDEX ${qi(`${USERS_TABLE}_login`)} ON ${qi(USERS_TABLE)} (lower(${qi("login")}))`
            );
        }
    }
];
