import { JSStaticType, JSTypes, Nullable } from "./tools/javascript.types";
import { Named } from "./tools/named";

/** Utility type to constrain the value of a field */
export type NamedType<Name, T> = T extends FieldTypeDefinition<infer RawType, infer Custom> ? Named<Name, JSStaticType<RawType, Custom>> : never;

/** 
 * Type definition that can be used for the properties of the entities.
 * @param Custom Can be used for a custom JS type
 * @param RawType The type of the value when stored in JS
 */
export type FieldTypeDefinition<RawType extends JSTypes, Custom> = {
    /** The type of the value when stored in JS */
    rawType: RawType;
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

    public get fieldTypes(): { [K in keyof FieldTypes]: NamedType<K, FieldTypes[K]> } {
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

    /** Get the list of tables */
    public getTableNames(): (keyof TablesFields)[] {
        return Object.keys(this._tables) as (keyof TablesFields)[];
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
