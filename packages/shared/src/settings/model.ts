import { EnumDefinition, EnumValues } from "../entities/tools/enums";
import { JSTypes } from "../entities/tools/javascript.types";

/**
 * Declaration of the settings of an application (FEATURES §11.5).
 *
 * Same spirit as the entities model: one declaration, from which the typing,
 * the validation and later the editing form all follow.
 *
 * What belongs here rather than in an entity: **anything only the server reads**.
 * An entity is readable from the browser console by whoever can load its context
 * (§11.2), so a broker password or an API token stored as an entity would travel
 * through the client cache and be exposed. This mechanism is the answer to that.
 *
 * What does *not* belong here: bootstrap. The port, the base URL and the
 * database connection string stay in environment variables — one cannot read
 * from the database how to connect to the database. The encryption key of the
 * secrets is bootstrap too, for the same reason.
 */

//#region Visibility ----------------------------------------------------------

/**
 * Who is allowed to read a setting.
 *
 * The default is the most closed one: a setting only opens up through an
 * explicit declaration.
 */
export enum SettingVisibility {
    /** The framework and application server code, and nothing else */
    server = "server",
    /** Also the user code running on the server (automations, §5) */
    script = "script",
    /**
     * Goes down to the browser.
     *
     * Read this one for what it is: not "visible to the interface" but "public
     * to anyone holding an account", since the console gives access to it.
     */
    client = "client"
}

/** Order from the most closed to the most open, used to compare two levels */
const VISIBILITY_ORDER: SettingVisibility[] = [
    SettingVisibility.server,
    SettingVisibility.script,
    SettingVisibility.client
];

/** @returns true if a reader at `level` may read a setting declared `declared` */
export function isVisibleAt(declared: SettingVisibility, level: SettingVisibility): boolean {
    return VISIBILITY_ORDER.indexOf(declared) >= VISIBILITY_ORDER.indexOf(level);
}

//#endregion

//#region Declaration types ---------------------------------------------------

/**
 * What a setting can hold: a scalar, or an enumeration.
 *
 * Deliberately narrower than a field of the entities model: no object, no
 * custom type. A setting is edited in a form and stored as one value; a shape
 * that needs more than that is a sign it should be an entity.
 */
export type SettingType = JSTypes.boolean | JSTypes.number | JSTypes.string | EnumDefinition<any>;

/** The JS type of the value of a setting, derived from its declared type */
export type SettingStaticType<T> =
    T extends EnumDefinition<infer Entries> ? EnumValues<Entries> :
    T extends JSTypes.boolean ? boolean :
    T extends JSTypes.number ? number :
    T extends JSTypes.string ? string :
    never;

/** Declaration of a single setting */
export type SettingDeclaration<T extends SettingType = SettingType> = {
    /** The type of the value, which drives the storage, the validation and the form */
    type: T;
    /** Displayed in the editing screen */
    label: string;
    /** Displayed under the label, to say what the setting actually changes */
    description?: string;
    /**
     * The value used until one is stored.
     *
     * Mandatory: a setting always has a value, so reading one never returns
     * undefined and server code never has to handle "not configured yet".
     */
    default: SettingStaticType<T>;
    /** Who may read it. Defaults to `server` */
    visibility?: SettingVisibility;
    /**
     * Written from the interface, never read back in clear.
     *
     * Stored encrypted, excluded from the exports, and refused at `client`
     * visibility. Declaring one makes the encryption key mandatory at startup.
     */
    secret?: true;
    /**
     * Environment variable seeding the setting on first run.
     *
     * The editing screen waits for the roles (ROADMAP tranche 3); until then
     * this is how a setting gets its value. Seeding only: once a value is
     * stored, the environment is ignored, otherwise editing from the future
     * screen would be undone by the next restart.
     */
    env?: string;
};

/**
 * The declaration of every setting of an application.
 *
 * The self-referential constraint is what ties `default` to `type`: without it
 * `default` would be checked against the union of every possible value type,
 * and a boolean default on a string setting would compile.
 */
export type SettingsDeclaration<D> = { [K in keyof D]: SettingDeclaration<D[K] extends { type: infer T extends SettingType } ? T : never> };

/** The values of the settings of an application, keyed like the declaration */
export type SettingsValues<D> = { [K in keyof D]: SettingStaticType<D[K] extends { type: infer T } ? T : never> };

//#endregion

//#region Model ---------------------------------------------------------------

/**
 * The settings declared by an application, with everything needed to store,
 * validate and display them.
 *
 * The model holds no value: it is the declaration, shared by both sides. The
 * values live in the store, which is server side because most of them must
 * never leave it.
 */
export class SettingsModel<D extends SettingsDeclaration<D>> {

    constructor(protected readonly _declaration: D) {
        for (const key of this.getKeys()) {
            const declaration = this.getDeclaration(key);

            if (String(key).length === 0) {
                throw new Error("A setting cannot have an empty key");
            }

            // Refused at declaration, not at runtime (FEATURES §11.5): a secret
            // that reaches the browser has already leaked by the time anyone
            // could check it.
            if (declaration.secret && this.getVisibility(key) === SettingVisibility.client) {
                throw new Error(`Setting "${String(key)}": a secret cannot be of "client" visibility, since a client value is readable by any authenticated user`);
            }

            // The declaration is data, so its own default deserves the same
            // check as a stored value. Catches a typed-away mistake such as a
            // default that is not one of the values of an enumeration.
            const error = this.getValueError(key, declaration.default);
            if (error != null) {
                throw new Error(`Setting "${String(key)}": invalid default value, ${error}`);
            }
        }
    }

    //#region Declaration

    /** @returns the keys of the settings, in declaration order */
    public getKeys(): (keyof D)[] {
        return Object.keys(this._declaration) as (keyof D)[];
    }

    /** @returns true if the key is declared by this model */
    public isDeclared(key: string): key is keyof D & string {
        return Object.prototype.hasOwnProperty.call(this._declaration, key);
    }

    /** @returns the declaration of a setting */
    public getDeclaration<K extends keyof D>(key: K): SettingDeclaration<any> {
        const declaration = this._declaration[key];
        if (declaration == null) {
            throw new Error(`Setting "${String(key)}" is not declared`);
        }
        return declaration as SettingDeclaration<any>;
    }

    /** @returns the visibility of a setting, `server` unless declared otherwise */
    public getVisibility<K extends keyof D>(key: K): SettingVisibility {
        return this.getDeclaration(key).visibility ?? SettingVisibility.server;
    }

    /** @returns true if the setting is written but never read back in clear */
    public isSecret<K extends keyof D>(key: K): boolean {
        return this.getDeclaration(key).secret === true;
    }

    /** @returns the enumeration of a setting, or null if it holds a scalar */
    public getEnum<K extends keyof D>(key: K): EnumDefinition<any> | null {
        const type = this.getDeclaration(key).type;
        return type instanceof EnumDefinition ? type : null;
    }

    /** @returns the JS type of the stored value, an enumeration resolving to the type of its values */
    public getRawType<K extends keyof D>(key: K): JSTypes.boolean | JSTypes.number | JSTypes.string {
        const enumeration = this.getEnum(key);
        return enumeration != null ? enumeration.rawType : this.getDeclaration(key).type as JSTypes.boolean | JSTypes.number | JSTypes.string;
    }

    /** @returns the default value of a setting */
    public getDefault<K extends keyof D>(key: K): SettingsValues<D>[K] {
        return this.getDeclaration(key).default as SettingsValues<D>[K];
    }

    /** @returns the keys a reader at this level may read, secrets excluded */
    public getReadableKeys(level: SettingVisibility): (keyof D)[] {
        return this.getKeys().filter((key) => !this.isSecret(key) && isVisibleAt(this.getVisibility(key), level));
    }

    //#endregion

    //#region Validation

    /**
     * @returns why the value cannot be stored for this setting, or null if it can.
     *
     * Called on the way in — from the editing screen, from the environment, and
     * on the declared defaults — so that what is stored is always readable back
     * as the declared type.
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

    /** @throws if the value cannot be stored for this setting */
    public validateValue<K extends keyof D>(key: K, value: unknown): SettingsValues<D>[K] {
        const error = this.getValueError(key, value);
        if (error != null) {
            throw new Error(`Setting "${String(key)}": ${error}`);
        }
        return value as SettingsValues<D>[K];
    }

    /**
     * Reads a value out of a text, the way it is stored and the way an
     * environment variable arrives.
     *
     * Not JSON.parse: a string setting seeded with `mqtt://localhost:1883` is
     * not valid JSON, and quoting it in a .env file is a trap nobody deserves.
     * @throws if the text does not read as the declared type.
     */
    public parseValue<K extends keyof D>(key: K, text: string): SettingsValues<D>[K] {
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
                    throw new Error(`Setting "${String(key)}": expected a boolean (true/false), got ${JSON.stringify(text)}`);
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
    public serializeValue<K extends keyof D>(key: K, value: SettingsValues<D>[K]): string {
        return String(value);
    }

    //#endregion
}

//#endregion
