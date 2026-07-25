import { JSTypes } from "./javascript.types";

//#region Declaration types ---------------------------------------------------

/**
 * Values that can be persisted for an enumeration entry.
 * Both integers and strings are supported, the choice is left to the developer
 * because it must match what is already stored in the database.
 */
export type EnumValue = number | string;

/** Declaration of a single entry of an enumeration */
export type EnumEntryDefinition<Value extends EnumValue = EnumValue> = {
    /**
     * The value persisted in the database.
     * It is always chosen explicitly and never derived from the declaration order,
     * so an existing column can be mapped without touching its content.
     */
    value: Value;
    /** The text displayed to the user, used by the form generator */
    label: string;
};

/**
 * Declaration of an enumeration.
 * Keys are the uids: the stable identifiers used in the code.
 */
export type EnumEntriesDefinition = Record<string, EnumEntryDefinition>;

/** Union of the uids of an enumeration */
export type EnumUids<Entries extends EnumEntriesDefinition> = keyof Entries & string;

/** Union of the values of an enumeration */
export type EnumValues<Entries extends EnumEntriesDefinition> = Entries[keyof Entries]["value"];

/** Map of the uids of an enumeration to their value */
export type EnumValuesMap<Entries extends EnumEntriesDefinition> = { [Uid in keyof Entries]: Entries[Uid]["value"] };

/** An entry of an enumeration, once resolved : <uid, value, label> */
export type EnumEntry<Entries extends EnumEntriesDefinition> = {
    uid: EnumUids<Entries>;
    value: EnumValues<Entries>;
    label: string;
};

//#endregion

//#region Enumeration ---------------------------------------------------------

/**
 * A declarative enumeration, replacement for TypeScript enums in the entities model.
 *
 * An enumeration is declared as a map of <uid, value, label> :
 * - the uid is the stable key used in the code,
 * - the value is what gets persisted (integer or string, chosen explicitly),
 * - the label is what gets displayed.
 *
 * An EnumDefinition is also a valid field type definition, so the very same object
 * is used to declare the enumeration and to type a field of the model.
 *
 * Prefer building it with EntitiesModel.enum() so the declaration keeps its literal types.
 */
export class EnumDefinition<Entries extends EnumEntriesDefinition> {

    /**
     * The type of the values once stored in the database.
     * All the values of an enumeration must share the same type.
     */
    public readonly rawType: JSTypes.number | JSTypes.string;

    /**
     * Map of the uids to their value.
     * This is the accessor to use in the code : MY_ENUM.values.MY_UID.
     * Referencing an uid that was not declared is a compilation error.
     */
    public readonly values: EnumValuesMap<Entries>;

    /** Entries in declaration order */
    protected readonly _entries: EnumEntry<Entries>[] = [];
    /** Index of the entries by value, for quick lookups */
    protected readonly _entriesByValue: Map<EnumValue, EnumEntry<Entries>> = new Map();

    constructor(protected readonly _declaration: Entries) {
        const uids = Object.keys(_declaration) as EnumUids<Entries>[];
        if (uids.length === 0) {
            throw new Error("An enumeration must declare at least one entry");
        }

        const values: Record<string, EnumValue> = {};
        let rawType: JSTypes.number | JSTypes.string | null = null;
        for (const uid of uids) {
            const entry = _declaration[uid];
            if (entry == null) {
                throw new Error(`Enumeration entry "${uid}" is not defined`);
            }
            const valueType = typeof entry.value;
            if (valueType !== "number" && valueType !== "string") {
                throw new Error(`Enumeration entry "${uid}" has an invalid value type (${valueType}), only number and string are supported`);
            }
            const entryRawType = valueType === "number" ? JSTypes.number : JSTypes.string;
            if (rawType == null) {
                rawType = entryRawType;
            } else if (rawType !== entryRawType) {
                throw new Error(`Enumeration entry "${uid}" has a ${entryRawType} value while previous entries have ${rawType} values, all values must share the same type`);
            }
            if (this._entriesByValue.has(entry.value)) {
                throw new Error(`Enumeration entry "${uid}" reuses the value ${JSON.stringify(entry.value)} of "${this._entriesByValue.get(entry.value)?.uid}"`);
            }
            const resolved: EnumEntry<Entries> = {
                uid,
                value: entry.value as EnumValues<Entries>,
                label: entry.label
            };
            this._entries.push(resolved);
            this._entriesByValue.set(entry.value, resolved);
            values[uid] = entry.value;
        }

        this.rawType = rawType!; // At least one entry, so rawType is set
        this.values = values as EnumValuesMap<Entries>;
    }

    //#region Typing methods, to be used with typeof

    /** Use this property with typeof to get the union of the values */
    public get type(): EnumValues<Entries> {
        return undefined as any;
    }

    /** Use this property with typeof to get the union of the uids */
    public get uidType(): EnumUids<Entries> {
        return undefined as any;
    }

    //#endregion

    //#region Get information about the entries

    /** Get the list of uids, in declaration order */
    public getUids(): EnumUids<Entries>[] {
        return this._entries.map(entry => entry.uid);
    }

    /** Get the list of values, in declaration order */
    public getValues(): EnumValues<Entries>[] {
        return this._entries.map(entry => entry.value);
    }

    /**
     * Get the list of entries, in declaration order.
     * This is what a form generator needs to render a dropdown.
     */
    public getEntries(): readonly EnumEntry<Entries>[] {
        return this._entries;
    }

    /** Get an entry from its uid */
    public getEntry(uid: EnumUids<Entries>): EnumEntry<Entries> {
        const entry = this._entries.find(candidate => candidate.uid === uid);
        if (entry == null) {
            throw new Error(`Unknown enumeration uid "${uid}"`);
        }
        return entry;
    }

    /** Get an entry from its persisted value, or null if the value is not declared */
    public getEntryByValue(value: EnumValue | null | undefined): EnumEntry<Entries> | null {
        if (value == null) {
            return null;
        }
        return this._entriesByValue.get(value) ?? null;
    }

    /** Get the label to display for a persisted value, or null if the value is not declared */
    public getLabel(value: EnumValue | null | undefined): string | null {
        return this.getEntryByValue(value)?.label ?? null;
    }

    /** Get the uid of a persisted value, or null if the value is not declared */
    public getUid(value: EnumValue | null | undefined): EnumUids<Entries> | null {
        return this.getEntryByValue(value)?.uid ?? null;
    }

    /** @returns true if the value is one of the declared values */
    public isValidValue(value: unknown): value is EnumValues<Entries> {
        return (typeof value === "number" || typeof value === "string") && this._entriesByValue.has(value);
    }

    //#endregion
}

//#endregion
