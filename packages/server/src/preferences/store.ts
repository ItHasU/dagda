import { SYSTEM_TABLE_PREFIX } from "@dagda/shared/src/entities/model";
import { UserId } from "@dagda/shared/src/auth/types";
import { PreferencesDeclaration, PreferencesModel, PreferencesValues } from "@dagda/shared/src/preferences/model";
import { AbstractSQLRunner } from "../sql/runner";
import { qi } from "../sql/schema";

/** Table holding the values, owned by the framework (FEATURES §11.4), one row per user and key */
export const PREFERENCES_TABLE = `${SYSTEM_TABLE_PREFIX}preferences`;

/** A row of the preferences table */
interface PreferenceRow {
    key: string;
    value: string;
}

/**
 * The values of the preferences, server side (FEATURES §11.6).
 *
 * Unlike `SettingsStore`, not loaded once and cached: a preference is
 * per-user, there is no bounded, process-wide set of values worth holding in
 * memory, and every read already comes with a user id resolved from the
 * session, so there is nothing to gain from an upfront load(). Reads and
 * writes go straight to the database.
 */
export class PreferencesStore<D extends PreferencesDeclaration<D>> {

    constructor(
        protected readonly _model: PreferencesModel<D>,
        protected readonly _runner: AbstractSQLRunner
    ) { }

    /**
     * @returns every declared preference for a user, stored values overriding
     * the defaults — exactly what `getPreferences()` hands to the client, so
     * a key it never set is already resolved, no special case needed there.
     */
    public async getAll(userId: UserId): Promise<PreferencesValues<D>> {
        const values = {} as PreferencesValues<D>;
        for (const key of this._model.getKeys()) {
            values[key] = this._model.getDefault(key);
        }

        const rows = await this._runner.all<PreferenceRow>(
            `SELECT ${qi("key")}, ${qi("value")} FROM ${qi(PREFERENCES_TABLE)} WHERE ${qi("userId")} = $1`,
            userId
        );
        for (const row of rows) {
            if (!this._model.isDeclared(row.key)) {
                // Left alone rather than deleted: a value belonging to a
                // version that is not running right now is not garbage
                // (same call as SettingsStore.load()).
                continue;
            }
            const key = row.key as keyof D;
            try {
                values[key] = this._model.parseValue(key, row.value);
            } catch (error) {
                // One unreadable row must not break the whole read; the
                // default already sits in `values`.
                console.error(`Preference "${row.key}" of user ${userId}: stored value unusable, falling back to the default (${(error as Error).message})`);
            }
        }
        return values;
    }

    /** @returns one preference for a user, its declared default until something is stored */
    public async get<K extends keyof D>(userId: UserId, key: K): Promise<PreferencesValues<D>[K]> {
        const row = await this._runner.get<PreferenceRow>(
            `SELECT ${qi("value")} FROM ${qi(PREFERENCES_TABLE)} WHERE ${qi("userId")} = $1 AND ${qi("key")} = $2`,
            userId, String(key)
        );
        return row == null ? this._model.getDefault(key) : this._model.parseValue(key, row.value);
    }

    /** Stores a value for a user. @throws if it does not match the declared type */
    public async set<K extends keyof D>(userId: UserId, key: K, value: PreferencesValues<D>[K]): Promise<void> {
        const checked = this._model.validateValue(key, value);
        const serialized = this._model.serializeValue(key, checked);
        await this._runner.run(
            `INSERT INTO ${qi(PREFERENCES_TABLE)} (${qi("userId")}, ${qi("key")}, ${qi("value")}) VALUES ($1, $2, $3)
             ON CONFLICT (${qi("userId")}, ${qi("key")}) DO UPDATE SET
                ${qi("value")} = EXCLUDED.${qi("value")}`,
            userId, String(key), serialized
        );
    }
}
