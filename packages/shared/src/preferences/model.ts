import { EnumDefinition, EnumValues } from "../entities/tools/enums";
import { JSTypes } from "../entities/tools/javascript.types";

/**
 * Declaration of the preferences of an application (FEATURES §11.6).
 *
 * Same spirit as the settings model (§11.5): one declaration, from which the
 * typing and the validation both follow. What is deliberately missing,
 * because none of it applies to a per-user value: no visibility levels — a
 * preference is always readable and writable by its own owner and by nobody
 * else, so there is nothing to gate; no `secret`, a per-user value is never
 * shared infrastructure; no `env`, which only ever made sense to seed a
 * bootstrap-time global config, not one row per account.
 *
 * What belongs here: a value that is per-user and read by the client — the
 * theme (§8) is the first one, tranche 4. Anything global to the instance
 * instead of the account is a setting (§11.5), not a preference.
 */

//#region Declaration types ---------------------------------------------------

/**
 * What a preference can hold: a scalar, or an enumeration.
 *
 * Same restriction as a setting: no object, no custom type. A shape that
 * needs more than one value belongs in an entity.
 */
export type PreferenceType = JSTypes.boolean | JSTypes.number | JSTypes.string | EnumDefinition<any>;

/** The JS type of the value of a preference, derived from its declared type */
export type PreferenceStaticType<T> =
    T extends EnumDefinition<infer Entries> ? EnumValues<Entries> :
    T extends JSTypes.boolean ? boolean :
    T extends JSTypes.number ? number :
    T extends JSTypes.string ? string :
    never;

/** Declaration of a single preference */
export type PreferenceDeclaration<T extends PreferenceType = PreferenceType> = {
    /** The type of the value, which drives the storage and the validation */
    type: T;
    /**
     * The value used until one is stored.
     *
     * Mandatory: a preference always has a value, so reading one never
     * returns undefined and calling code never has to handle "not set yet".
     */
    default: PreferenceStaticType<T>;
};

/**
 * The declaration of every preference of an application.
 *
 * The self-referential constraint is what ties `default` to `type`, same
 * reason as `SettingsDeclaration`: without it a boolean default on a string
 * preference would compile.
 */
export type PreferencesDeclaration<D> = { [K in keyof D]: PreferenceDeclaration<D[K] extends { type: infer T extends PreferenceType } ? T : never> };

/** The values of the preferences of an application, keyed like the declaration */
export type PreferencesValues<D> = { [K in keyof D]: PreferenceStaticType<D[K] extends { type: infer T } ? T : never> };

//#endregion

//#region Model ---------------------------------------------------------------

/**
 * The preferences declared by an application, with everything needed to
 * store and validate them.
 *
 * The model holds no value and no owner: it is the declaration, shared by
 * both sides. The values live in the store, one set per user, which is why
 * this model — unlike `SettingsModel` — never talks about who may read a
 * given key: the owner always may, and nobody else ever does.
 */
export class PreferencesModel<D extends PreferencesDeclaration<D>> {

    constructor(protected readonly _declaration: D) {
        for (const key of this.getKeys()) {
            if (String(key).length === 0) {
                throw new Error("A preference cannot have an empty key");
            }

            // The declaration is data, so its own default deserves the same
            // check as a stored value. Catches a typed-away mistake such as a
            // default that is not one of the values of an enumeration.
            const error = this.getValueError(key, this.getDefault(key));
            if (error != null) {
                throw new Error(`Preference "${String(key)}": invalid default value, ${error}`);
            }
        }
    }

    //#region Declaration

    /** @returns the keys of the preferences, in declaration order */
    public getKeys(): (keyof D)[] {
        return Object.keys(this._declaration) as (keyof D)[];
    }

    /** @returns true if the key is declared by this model */
    public isDeclared(key: string): key is keyof D & string {
        return Object.prototype.hasOwnProperty.call(this._declaration, key);
    }

    /** @returns the declaration of a preference */
    public getDeclaration<K extends keyof D>(key: K): PreferenceDeclaration<any> {
        const declaration = this._declaration[key];
        if (declaration == null) {
            throw new Error(`Preference "${String(key)}" is not declared`);
        }
        return declaration as PreferenceDeclaration<any>;
    }

    /** @returns the enumeration of a preference, or null if it holds a scalar */
    public getEnum<K extends keyof D>(key: K): EnumDefinition<any> | null {
        const type = this.getDeclaration(key).type;
        return type instanceof EnumDefinition ? type : null;
    }

    /** @returns the JS type of the stored value, an enumeration resolving to the type of its values */
    public getRawType<K extends keyof D>(key: K): JSTypes.boolean | JSTypes.number | JSTypes.string {
        const enumeration = this.getEnum(key);
        return enumeration != null ? enumeration.rawType : this.getDeclaration(key).type as JSTypes.boolean | JSTypes.number | JSTypes.string;
    }

    /** @returns the default value of a preference */
    public getDefault<K extends keyof D>(key: K): PreferencesValues<D>[K] {
        return this.getDeclaration(key).default as PreferencesValues<D>[K];
    }

    //#endregion

    //#region Validation

    /**
     * @returns why the value cannot be stored for this preference, or null if it can.
     *
     * Called on the way in — from a write, and on the declared defaults —
     * so that what is stored is always readable back as the declared type.
     */
    public getValueError<K extends keyof D>(key: K, value: unknown): string | null {
        const enumeration = this.getEnum(key);
        if (enumeration != null) {
            return enumeration.isValidValue(value)
                ? null
                : `expected one of ${JSON.stringify(enumeration.getValues())}, got ${JSON.stringify(value)}`;
        }

        const expected = this.getRawType(key);
        if (typeof value !== expected) {
            return `expected a ${expected}, got ${value === null ? "null" : typeof value}`;
        }
        if (expected === JSTypes.number && !Number.isFinite(value)) {
            return `expected a finite number, got ${JSON.stringify(value)}`;
        }
        return null;
    }

    /** @throws if the value cannot be stored for this preference */
    public validateValue<K extends keyof D>(key: K, value: unknown): PreferencesValues<D>[K] {
        const error = this.getValueError(key, value);
        if (error != null) {
            throw new Error(`Preference "${String(key)}": ${error}`);
        }
        return value as PreferencesValues<D>[K];
    }

    /**
     * Reads a value out of a text, the way it is stored.
     *
     * Not JSON.parse: a string preference is not necessarily valid JSON, same
     * reasoning as `SettingsModel.parseValue`.
     * @throws if the text does not read as the declared type.
     */
    public parseValue<K extends keyof D>(key: K, text: string): PreferencesValues<D>[K] {
        const rawType = this.getRawType(key);
        let value: unknown;
        switch (rawType) {
            case JSTypes.boolean: {
                const normalized = text.trim().toLowerCase();
                if (normalized === "true" || normalized === "1") {
                    value = true;
                } else if (normalized === "false" || normalized === "0") {
                    value = false;
                } else {
                    throw new Error(`Preference "${String(key)}": expected a boolean (true/false), got ${JSON.stringify(text)}`);
                }
                break;
            }
            case JSTypes.number: {
                value = Number(text.trim());
                break;
            }
            case JSTypes.string: {
                value = text;
                break;
            }
        }
        return this.validateValue(key, value);
    }

    /** Writes a value the way parseValue() reads it back */
    public serializeValue<K extends keyof D>(key: K, value: PreferencesValues<D>[K]): string {
        return String(value);
    }

    //#endregion
}

//#endregion
