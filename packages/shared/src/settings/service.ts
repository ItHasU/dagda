import { SettingsValues } from "./model";

/**
 * Reading the settings, the part that exists on both sides.
 *
 * Synchronous on purpose, like the entities cache: the values are loaded once
 * at startup and kept in memory, so calling code — a reconnection routine, a
 * component rendering — never has to await a setting.
 *
 * What the client gets is only the `client` slice of the declaration
 * (FEATURES §11.5); reading anything else there is a compile error on the
 * server-only keys and would return the default at runtime.
 */
export interface SettingsService<D> {
    settings: {
        /** @returns the current value of a setting, its default until one is stored */
        get<K extends keyof D>(key: K): SettingsValues<D>[K];
    };
}

/** Called when the value of a setting changed */
export type SettingChangeListener<D, K extends keyof D = keyof D> = (value: SettingsValues<D>[K], key: K) => void;

/**
 * Writing and watching the settings, server side only.
 *
 * The change notification is what spares a restart: MQTTToolbox v1 already
 * reconnected to its broker on `Config.on("mqtt", …)`, and that is the
 * behaviour reproduced here (FEATURES §11.5).
 */
export interface SettingsWriteService<D> extends SettingsService<D> {
    settings: SettingsService<D>["settings"] & {
        /** Stores a value, then notifies the listeners of that key */
        set<K extends keyof D>(key: K, value: SettingsValues<D>[K]): Promise<void>;
        /** Watches one setting. @returns the function removing the listener */
        on<K extends keyof D>(key: K, listener: SettingChangeListener<D, K>): () => void;
    };
}
