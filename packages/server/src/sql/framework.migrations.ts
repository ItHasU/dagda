import { ROLES_TABLE } from "../auth/roles";
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
    },
    {
        id: "0003-users-invitation",
        up: async (tools) => {
            // Nullable: only a pending invitation or an in-progress reset
            // carries one. The same token serves both (FEATURES §7) — an
            // account created by invite() and a password reset via
            // reinvite() are the same mechanism at two different ages.
            //
            // BIGINT, not TIMESTAMPTZ: UserStore compares it against
            // Date.now() in JS, the same convention the entities model uses
            // for its own TIMESTAMP fields — a TIMESTAMPTZ column expects a
            // date, not raw epoch milliseconds.
            await tools.run(
                `ALTER TABLE ${qi(USERS_TABLE)}
                 ADD COLUMN ${qi("invitationToken")} TEXT,
                 ADD COLUMN ${qi("invitationExpiresAt")} BIGINT`
            );
            await tools.run(
                `CREATE UNIQUE INDEX ${qi(`${USERS_TABLE}_invitation_token`)} ON ${qi(USERS_TABLE)} (${qi("invitationToken")})`
            );
        }
    },
    {
        id: "0004-roles",
        up: async (tools) => {
            // permissions is TEXT, not TEXT[]: the SQL runner's parameter
            // marshalling (sqlValue()) targets both SQLite and PostgreSQL, and
            // has no native array type — a JS array is passed through
            // RoleStore as a JSON string, same idea as the runner's own
            // fallback for an object.
            await tools.run(
                `CREATE TABLE ${qi(ROLES_TABLE)} (
                    ${qi("id")} SERIAL PRIMARY KEY,
                    ${qi("name")} TEXT NOT NULL,
                    ${qi("permissions")} TEXT NOT NULL,
                    ${qi("createdAt")} TIMESTAMPTZ NOT NULL DEFAULT now()
                )`
            );
            await tools.run(
                `CREATE UNIQUE INDEX ${qi(`${ROLES_TABLE}_name`)} ON ${qi(ROLES_TABLE)} (lower(${qi("name")}))`
            );
            // A user carries at most one role (FEATURES §7.1). Deleting a role
            // clears the column rather than being refused: nothing about a
            // role is precious enough to block cleanup over, and an account
            // with no role simply has no permissions beyond isSuperAdmin.
            await tools.run(
                `ALTER TABLE ${qi(USERS_TABLE)}
                 ADD COLUMN ${qi("roleId")} INTEGER REFERENCES ${qi(ROLES_TABLE)}(${qi("id")}) ON DELETE SET NULL`
            );
        }
    }
];
