import { SYSTEM_TABLE_PREFIX } from "@dagda/shared/src/entities/model";
import { SettingsDeclaration, SettingsModel, SettingsValues, SettingVisibility } from "@dagda/shared/src/settings/model";
import { SettingChangeListener, SettingsWriteService } from "@dagda/shared/src/settings/service";
import { AbstractSQLRunner } from "../sql/runner";
import { qi } from "../sql/schema";
import { decryptSecret, encryptSecret, parseEncryptionKey } from "./crypto";

/** Table holding the values, owned by the framework (FEATURES §11.4) */
export const SETTINGS_TABLE = `${SYSTEM_TABLE_PREFIX}settings`;

/** A row of the settings table */
interface SettingRow {
    key: string;
    value: string;
    /**
     * Whether the value in this row is encrypted.
     *
     * Recorded rather than derived from the current declaration: a setting that
     * stops being secret between two versions still has an encrypted row until
     * it is written again, and the reader must know that from the row itself.
     */
    encrypted: boolean;
}

/** What the store needs to start */
export interface SettingsStoreParams<D extends SettingsDeclaration<D>> {
    /** The declaration of the settings */
    model: SettingsModel<D>;
    /** Where the values are stored */
    runner: AbstractSQLRunner;
    /**
     * Key protecting the secrets, in base64 or hex.
     * Mandatory as soon as one setting is declared secret.
     */
    encryptionKey?: string;
    /** Reads the environment seeding the settings on first run. Defaults to process.env */
    env?: Record<string, string | undefined>;
    /** Where the startup report goes. Defaults to the console */
    log?: (message: string) => void;
}

/**
 * The values of the settings, server side (FEATURES §11.5).
 *
 * Loaded once at startup and kept in memory, so reads are synchronous — the
 * same choice as the entities cache, and the reason a reconnection routine can
 * read its configuration without an await.
 *
 * Writes go to the database first, then to memory, then to the listeners: a
 * listener never sees a value that failed to persist.
 */
export class SettingsStore<D extends SettingsDeclaration<D>> implements SettingsWriteService<D> {

    protected readonly _model: SettingsModel<D>;
    protected readonly _runner: AbstractSQLRunner;
    protected readonly _env: Record<string, string | undefined>;
    protected readonly _log: (message: string) => void;
    protected readonly _encryptionKey: Buffer | null;

    /** Current values, defaults until load() has run */
    protected readonly _values: Map<keyof D, unknown> = new Map();
    /** Listeners per key */
    protected readonly _listeners: Map<keyof D, Set<SettingChangeListener<D, any>>> = new Map();
    /** Whether load() has run */
    protected _loaded: boolean = false;

    constructor(params: SettingsStoreParams<D>) {
        this._model = params.model;
        this._runner = params.runner;
        this._env = params.env ?? process.env;
        this._log = params.log ?? ((message: string) => console.log(message));

        this._encryptionKey = params.encryptionKey != null ? parseEncryptionKey(params.encryptionKey) : null;
        // Refused here rather than at the first write: a server that accepts a
        // secret it cannot protect has already been handed one in clear.
        if (this._encryptionKey == null) {
            const secrets = this._model.getKeys().filter((key) => this._model.isSecret(key));
            if (secrets.length > 0) {
                throw new Error(
                    `An encryption key is required: the settings ${secrets.map((k) => `"${String(k)}"`).join(", ")} are declared secret. ` +
                    `Generate one with: node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`
                );
            }
        }

        for (const key of this._model.getKeys()) {
            this._values.set(key, this._model.getDefault(key));
        }
    }

    //#region Loading ---------------------------------------------------------

    /**
     * Read the stored values, then seed from the environment what has never
     * been written.
     *
     * Must run before the application uses any setting; the constructor cannot
     * do it because it talks to the database.
     */
    public async load(): Promise<void> {
        const rows = await this._runner.all<SettingRow>(
            `SELECT ${qi("key")}, ${qi("value")}, ${qi("encrypted")} FROM ${qi(SETTINGS_TABLE)}`
        );

        const stored = new Set<keyof D>();
        for (const row of rows) {
            if (!this._model.isDeclared(row.key)) {
                // Left alone rather than deleted: a value belonging to a version
                // that is not running right now is not garbage.
                continue;
            }
            const key = row.key as keyof D;
            try {
                this._values.set(key, this._model.parseValue(key, this._decode(row)));
                stored.add(key);
            } catch (error) {
                // One unreadable row must not take the server down; the default
                // takes over, but loudly — this is a real problem to fix.
                this._log(`Setting "${row.key}": stored value unusable, falling back to the default (${(error as Error).message})`);
            }
        }

        // Set before seeding: seeding writes, and a write reads back what it stored.
        this._loaded = true;
        await this._seedFromEnvironment(stored);
    }

    /**
     * Give a value to the settings that have none yet, from the environment.
     *
     * The editing screen waits for the roles (ROADMAP tranche 3), so this is
     * currently the only way to configure anything. Seeding only: once a value
     * is stored, the environment is reported and ignored, otherwise the future
     * screen would be undone by every restart.
     */
    protected async _seedFromEnvironment(stored: Set<keyof D>): Promise<void> {
        for (const key of this._model.getKeys()) {
            const variable = this._model.getDeclaration(key).env;
            if (variable == null) {
                continue;
            }
            const text = this._env[variable];
            if (text == null || text === "") {
                continue;
            }
            if (stored.has(key)) {
                // Silence here is how someone spends an afternoon editing a .env
                // that nothing reads any more.
                this._log(`Setting "${String(key)}": ${variable} is set but a value is already stored, the environment is ignored`);
                continue;
            }
            try {
                await this.set(key, this._model.parseValue(key, text));
                this._log(`Setting "${String(key)}": seeded from ${variable}`);
            } catch (error) {
                this._log(`Setting "${String(key)}": ${variable} could not be used (${(error as Error).message})`);
            }
        }
    }

    /** @returns the clear text behind a row */
    protected _decode(row: SettingRow): string {
        if (!row.encrypted) {
            return row.value;
        }
        if (this._encryptionKey == null) {
            throw new Error("the value is encrypted and no encryption key is configured");
        }
        return decryptSecret(this._encryptionKey, row.value);
    }

    //#endregion

    //#region SettingsWriteService --------------------------------------------

    /** @inheritdoc */
    public readonly settings = {
        get: <K extends keyof D>(key: K): SettingsValues<D>[K] => {
            if (!this._values.has(key)) {
                throw new Error(`Setting "${String(key)}" is not declared`);
            }
            // Answering the default before load() would be worse than failing:
            // the caller would silently run on a configuration nobody chose.
            if (!this._loaded) {
                throw new Error(`Setting "${String(key)}" read before the settings were loaded`);
            }
            return this._values.get(key) as SettingsValues<D>[K];
        },

        set: async <K extends keyof D>(key: K, value: SettingsValues<D>[K]): Promise<void> => {
            await this.set(key, value);
        },

        on: <K extends keyof D>(key: K, listener: SettingChangeListener<D, K>): (() => void) => {
            return this.on(key, listener);
        }
    };

    /**
     * Store a value and notify whoever watches it.
     *
     * The order matters: database, then memory, then listeners. A listener
     * reconnecting to a broker must never act on a value that failed to persist.
     */
    public async set<K extends keyof D>(key: K, value: SettingsValues<D>[K]): Promise<void> {
        const checked = this._model.validateValue(key, value);
        const secret = this._model.isSecret(key);
        const serialized = this._model.serializeValue(key, checked);

        let toStore = serialized;
        if (secret) {
            if (this._encryptionKey == null) {
                throw new Error(`Setting "${String(key)}" is secret and no encryption key is configured`);
            }
            toStore = encryptSecret(this._encryptionKey, serialized);
        }

        await this._runner.run(
            `INSERT INTO ${qi(SETTINGS_TABLE)} (${qi("key")}, ${qi("value")}, ${qi("encrypted")}) VALUES ($1, $2, $3)
             ON CONFLICT (${qi("key")}) DO UPDATE SET
                ${qi("value")} = EXCLUDED.${qi("value")},
                ${qi("encrypted")} = EXCLUDED.${qi("encrypted")},
                ${qi("updatedAt")} = now()`,
            String(key), toStore, secret
        );

        const previous = this._values.get(key);
        this._values.set(key, checked);
        if (previous !== checked) {
            this._notify(key, checked);
        }
    }

    /** Watch one setting. @returns the function removing the listener */
    public on<K extends keyof D>(key: K, listener: SettingChangeListener<D, K>): () => void {
        if (!this._values.has(key)) {
            throw new Error(`Setting "${String(key)}" is not declared`);
        }
        let listeners = this._listeners.get(key);
        if (listeners == null) {
            listeners = new Set();
            this._listeners.set(key, listeners);
        }
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    }

    /** Call the listeners of a key, one failure never stopping the others */
    protected _notify<K extends keyof D>(key: K, value: SettingsValues<D>[K]): void {
        for (const listener of this._listeners.get(key) ?? []) {
            try {
                listener(value, key);
            } catch (error) {
                this._log(`Setting "${String(key)}": a change listener threw (${(error as Error).message})`);
            }
        }
    }

    //#endregion

    //#region Reading for the other sides -------------------------------------

    /**
     * @returns the values a reader at this level may see, secrets excluded.
     *
     * This is the boundary the three visibility levels exist for: what leaves
     * the server is decided here, from the declaration, not by each caller.
     */
    public getValuesFor(level: SettingVisibility): Partial<SettingsValues<D>> {
        const result: Partial<SettingsValues<D>> = {};
        for (const key of this._model.getReadableKeys(level)) {
            result[key] = this._values.get(key) as SettingsValues<D>[typeof key];
        }
        return result;
    }

    //#endregion
}
