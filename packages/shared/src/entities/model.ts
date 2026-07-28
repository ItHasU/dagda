import { EnumDefinition, EnumEntriesDefinition, EnumValues } from "./tools/enums";
import { JSStaticType, JSTypes, Nullable } from "./tools/javascript.types";
import { Named } from "./tools/named";
import { EntityValidationError, EntityValidationOptions, getEntityErrors, validateEntity } from "./tools/validation";

/**
 * Prefix of the tables holding business data, declared by an EntitiesModel.
 * FEATURES §2: the split is visible down to the schema.
 */
export const DATA_TABLE_PREFIX = "data_";

/**
 * Prefix of the tables owned by the framework: migrations, accounts, roles,
 * settings, preferences. They are never part of an EntitiesModel (§11.4).
 */
export const SYSTEM_TABLE_PREFIX = "system_";

/**
 * Utility type to constrain the value of a field.
 * An enumeration is resolved to the union of its values, any other type to its JS type.
 */
export type NamedType<Name, T> =
    T extends EnumDefinition<infer Entries> ? Named<Name, EnumValues<Entries>> :
    T extends FieldTypeDefinition<infer RawType, infer Custom> ? Named<Name, JSStaticType<RawType, Custom>> :
    never;

/** 
 * Type definition that can be used for the properties of the entities.
 * @param Custom Can be used for a custom JS type
 * @param RawType The type of the value when stored in JS
 */
export type FieldTypeDefinition<RawType extends JSTypes, Custom> = {
    /** The type of the value when stored in JS */
    rawType: RawType;
    /**
     * Overrides the PostgreSQL type derived from rawType.
     * Needed for JSTypes.custom, which says nothing about storage, and useful
     * when the default is correct but wasteful — a millisecond timestamp is a
     * number, so it defaults to DOUBLE PRECISION, while BIGINT says more.
     */
    sqlType?: string;
}

/**
 * Field definition that can be used for the properties of the entities.
 * @param Types The map of types used in the application
 * @param Tables The map of tables used in the application
 */
export type FieldDefinition<Types, Tables> = {
    type: keyof Types;
    identity?: boolean;
    optional?: true;
    foreignTable?: Tables;
    /**
     * References the framework's accounts table as a real SQL foreign key,
     * distinct from foreignTable: system_users is owned by the framework, not
     * by any EntitiesModel (§11.4), so it cannot be named as one of Tables.
     * Kept table-name-free on purpose — the physical name is a server-side
     * concern (packages/server/src/auth/users.ts), and this type is shared
     * with the client.
     */
    referencesUsers?: true;
    fromVersion?: number;
    toVersion?: number;
}

export type IdFieldDefinition<Types> = {
    type: keyof Types;
    identity: true;
    fromVersion?: never; // Force from the first version
    toVersion?: never;   // Force until the last version
};

/** Mapping of FieldType to its TypeDefinition */
export type FieldTypesDefinition = Record<string, FieldTypeDefinition<JSTypes, any>>;
/** Mapping of FieldType to the branded JS type it resolves to — what `EntitiesModel.fieldTypes` (and `BaseAppTypes["fieldTypes"]`) exposes */
export type NamedFieldTypes<FieldTypes extends FieldTypesDefinition> = { [K in keyof FieldTypes]: NamedType<K, FieldTypes[K]> };
/** Mapping of fields types for each table */
export type TablesFieldsDefinition<FieldTypes extends FieldTypesDefinition, Tables extends string | symbol | number> = Record<Tables, {
    id: IdFieldDefinition<FieldTypes>;
    [field: string]: FieldDefinition<FieldTypes, Tables>;
}>;

export type KeysWithToVersion<T> = { [K in keyof T]: T[K] extends { toVersion: any } ? never : K }[keyof T];

/** 
 * This class handles all information for the data used in the application.
 * You should not fill Types and Tables directly, they are computed by TypeScript from the parameters passed to the constructor.
 * 
 * @param Types are for the types of the properties of the entities.
 * @param Tables are for the entities themselves.
 */
export class EntitiesModel<
    FieldTypes extends FieldTypesDefinition,
    TablesFields extends TablesFieldsDefinition<FieldTypes, keyof TablesFields>
> {
    /**
     * Create a new entity model.
     * @param _types The map of types used in the application
     * @param _tables The map of tables used in the application
     */
    constructor(protected readonly _types: FieldTypes, protected readonly _tables: TablesFields) {
    }

    //#region Utility methods

    /** Utility method to the create type definition with custom types easily */
    public static type<RawType extends JSTypes, Custom>(definition: FieldTypeDefinition<RawType, Custom>): FieldTypeDefinition<RawType, Custom> {
        return definition;
    }

    /**
     * Utility method to declare an enumeration as a triplet <uid, value, label>.
     *
     * The returned object is both the enumeration itself (MY_ENUM.values.MY_UID,
     * MY_ENUM.getLabel(value), ...) and a valid field type definition, so it can be
     * passed directly in the types of the model.
     *
     * ```ts
     * export const PUBLICATION_STATUS = EntitiesModel.enum({
     *     DRAFT: { value: 1, label: "Draft" },
     *     PUBLISHED: { value: 2, label: "Published" }
     * });
     * export type PublicationStatus = typeof PUBLICATION_STATUS.type; // 1 | 2
     * ```
     */
    public static enum<const Entries extends EnumEntriesDefinition>(entries: Entries): EnumDefinition<Entries> {
        return new EnumDefinition(entries);
    }

    //#endregion

    //#region Typing methods, to be used with typeof

    public get modelFieldTypes(): FieldTypes {
        return undefined as any;
    }

    public get modelTablesFields(): TablesFields {
        return undefined as any;
    }

    public get typeNames(): keyof FieldTypes {
        return undefined as any;
    }

    public get fieldTypes(): NamedFieldTypes<FieldTypes> {
        return undefined as any;
    }

    /** Use this property with typeof to get the list */
    public get tableNames(): keyof TablesFields {
        return undefined as any;
    }

    /** Use this property to get the list of types associated to table names */
    public get tablesFields(): { [Table in keyof TablesFields]: {
        [K in keyof TablesFields[Table]]:
        TablesFields[Table][K] extends { optional: true } ?
        Nullable<NamedType<TablesFields[Table][K]["type"], FieldTypes[TablesFields[Table][K]["type"]]>> :
        NamedType<TablesFields[Table][K]["type"], FieldTypes[TablesFields[Table][K]["type"]]>
    } } {
        return undefined as any;
    }

    //#endregion

    //#region Get information about the types

    public getTypeNames(): (keyof FieldTypes)[] {
        return Object.keys(this._types);
    }

    /** Get the definition of a type, or undefined if the type is not declared */
    public getTypeDefinition<TypeName extends keyof FieldTypes>(typeName: TypeName): FieldTypes[TypeName] | undefined {
        return this._types[typeName];
    }

    /** @returns the enumeration declared for a type, or null if the type is not an enumeration */
    public getEnum<TypeName extends keyof FieldTypes>(typeName: TypeName): EnumDefinition<any> | null {
        const definition = this._types[typeName];
        return definition instanceof EnumDefinition ? definition : null;
    }

    /** @returns the enumeration of a field, or null if the field is not an enumeration */
    public getFieldEnum<T extends keyof TablesFields, F extends keyof TablesFields[T]>(tableName: T, fieldName: F): EnumDefinition<any> | null {
        return this.getEnum(this.getFieldTypeName(tableName, fieldName));
    }

    /** Get the list of tables */
    public getTableNames(): (keyof TablesFields)[] {
        return Object.keys(this._tables) as (keyof TablesFields)[];
    }

    /**
     * @returns the name of the table in the database.
     *
     * Business tables are prefixed, so the boundary of §11.4 — what belongs to
     * the application versus what belongs to the framework — is visible in the
     * schema itself, and a business table can never collide with a framework one.
     * Everything an EntitiesModel declares is business data by definition: the
     * framework keeps its own tables (accounts, settings, migrations) out of the
     * model on purpose.
     */
    public getTableSqlName<T extends keyof TablesFields>(tableName: T): string {
        return `${DATA_TABLE_PREFIX}${String(tableName)}`;
    }

    /** Get the list of fields for a table */
    public getTableFieldNames<T extends keyof TablesFields>(tableName: T, version?: number): (keyof TablesFields[T])[] {
        return Object.keys(this._tables[tableName]).filter(field => {
            if (version == null) {
                return this._tables[tableName][field].toVersion == null
            } else {
                const fromVersion = this._tables[tableName][field].fromVersion;
                if (fromVersion != null && version < fromVersion) {
                    return false;
                }
                const toVersion = this._tables[tableName][field].toVersion;
                if (toVersion != null && toVersion <= version) {
                    return false;
                }
                return true;
            }
        });
    }

    public getFieldTypeName<T extends keyof TablesFields, F extends keyof TablesFields[T]>(tableName: T, fieldName: F): TablesFields[T][F]["type"] {
        return this._tables[tableName][fieldName]["type"];
    }

    public isFieldIdentity<T extends keyof TablesFields, F extends keyof TablesFields[T]>(tableName: T, fieldName: F): boolean {
        return this._tables[tableName][fieldName]["identity"] === true;
    }

    public isFieldOptional<T extends keyof TablesFields, F extends keyof TablesFields[T]>(tableName: T, fieldName: F): boolean {
        return this._tables[tableName][fieldName]["optional"] === true;
    }

    public isFieldForeign<T extends keyof TablesFields, F extends keyof TablesFields[T]>(tableName: T, fieldName: F): boolean {
        return this._tables[tableName][fieldName]["foreignTable"] != null;
    }

    public getFieldForeignTableName<T extends keyof TablesFields, F extends keyof TablesFields[T]>(tableName: T, fieldName: F): keyof TablesFields | null {
        return this._tables[tableName][fieldName]["foreignTable"] ?? null;
    }

    /** @returns whether the field is a real SQL foreign key to the framework's accounts table */
    public getFieldReferencesUsers<T extends keyof TablesFields, F extends keyof TablesFields[T]>(tableName: T, fieldName: F): boolean {
        return this._tables[tableName][fieldName]["referencesUsers"] === true;
    }

    public getTableForeignKeys<T extends keyof TablesFields>(table: T): { [K in keyof TablesFields[T]]: (keyof TablesFields) | null } {
        const foreignKeys: { [K in keyof TablesFields[T]]: (keyof TablesFields) | null } = {} as any;
        for (const field of this.getTableFieldNames(table)) {
            foreignKeys[field] = this.getFieldForeignTableName(table, field);
        }
        return foreignKeys;
    }

    public getForeignKeys(): { [T in keyof TablesFields]: { [K in keyof TablesFields[T]]: boolean } } {
        const foreignKeys: { [T in keyof TablesFields]: { [K in keyof TablesFields[T]]: boolean } } = {} as any;
        for (const table of this.getTableNames()) {
            foreignKeys[table] = {} as any;
            for (const field of this.getTableFieldNames(table)) {
                foreignKeys[table][field] = this.isFieldForeign(table, field);
            }
        }
        return foreignKeys;
    }

    //#endregion

    //#region Validation methods

    /** 
     * Validate the model 
     * @throws if the model is invalid
     */
    public validate(): void {
        for (const type of this.getTypeNames()) {
            this._validateType(type);
        }
        for (const table of this.getTableNames()) {
            this._validateTable(table);
        }
    }

    protected _validateType(type: keyof FieldTypes): void {
    }

    /**
     * Check that an entity matches the declaration of its table :
     * type of each field, mandatory fields, enumeration values and unknown fields.
     *
     * This is NOT called automatically : validating every entity on the critical path
     * (cache insertion, transactions, fetch results) is a performance trade-off that
     * belongs to the application. Suggested call sites are, by decreasing interest :
     * - server side, in the submit endpoint, on the items of the incoming transaction,
     * - client side, in SQLTransaction.insert()/update(), behind a development flag,
     * - in the tests of an application, on the fixtures.
     *
     * @returns the list of problems found, empty if the entity is valid
     */
    public getEntityErrors<T extends keyof TablesFields>(tableName: T, entity: unknown, options?: EntityValidationOptions): EntityValidationError[] {
        return getEntityErrors(this, tableName as string, entity, options);
    }

    /**
     * Check that an entity matches the declaration of its table.
     * @see getEntityErrors
     * @throws EntityValidationException if the entity does not match
     */
    public validateEntity<T extends keyof TablesFields>(tableName: T, entity: unknown, options?: EntityValidationOptions): void {
        validateEntity(this, tableName as string, entity, options);
    }

    protected _validateTable(table: keyof TablesFields): void {
        // Check that there is only one identity field
        let idFieldCount: number = 0;
        for (const field of this.getTableFieldNames(table)) {
            if (this.isFieldIdentity(table, field)) {
                idFieldCount++;
            }
        }
        if (idFieldCount === 0) {
            throw new Error(`Table ${table as string} does not have an identity field`);
        } else if (idFieldCount > 1) {
            throw new Error(`Table ${table as string} has more than one identity field`);
        }
    }

    //#endregion

}
