import { Migration } from "./migrations";

/**
 * Migrations shipped with the framework, applied before the application's.
 *
 * They own the `system_` tables (FEATURES §2, §11.4): an application never
 * declares them and never has to do anything to get accounts, roles, settings
 * and preferences in working order.
 *
 * Empty for now — the only framework table so far is the migration ledger
 * itself, which cannot be created by a migration for obvious reasons. Accounts,
 * roles and settings land with the authentication slice.
 *
 * Rule for whoever adds one: an id is recorded once applied, so it is never
 * renamed and never reordered before an already released one.
 */
export const FRAMEWORK_MIGRATIONS: Migration[] = [];
