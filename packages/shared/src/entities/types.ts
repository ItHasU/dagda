import { Named } from "./tools/named";

/** 
 * A generic context implementation.
 * 
 * This is only a recommendation and can be changed
 * to fit your needs.
 */
export type BaseContext<T extends string, Options> = {
    type: T;
    options: Options;
}

/** The minimal fields for an item */
export interface BaseEntity {
    /** Unique auto-incremented id */
    id: Named<string, number>;
}

/** 
 * Mapping of table names to entity types.
 * All entity types inherit from BaseEntity.
 */
export type EntitiesTypes = Record<string, BaseEntity>;

/** Retrieved from the EntitiesModel */
export type ForeignKeys<Tables> = { [TableName in keyof Tables]: { [field in keyof Tables[TableName]]?: keyof Tables } };
