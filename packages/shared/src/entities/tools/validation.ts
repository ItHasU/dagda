import type { EntitiesModel } from "../model";
import { EnumDefinition } from "./enums";
import { JSTypes } from "./javascript.types";

//#region Types ---------------------------------------------------------------

/** A single problem found while validating an entity */
export interface EntityValidationError {
    /** Name of the table the entity was validated against */
    table: string;
    /** Name of the faulty field, or null when the problem is about the entity itself */
    field: string | null;
    /** Human readable message, naming the table and the field */
    message: string;
}

/** Options of the entity validation */
export interface EntityValidationOptions {
    /**
     * Only validate the fields actually present in the object.
     * Missing mandatory fields are not reported.
     * Use it to validate the values of an update.
     */
    partial?: boolean;
    /**
     * Validate against a given version of the model.
     * By default, the current version is used.
     */
    version?: number;
}

/** Error thrown by validateEntity() when an entity does not match its table */
export class EntityValidationException extends Error {
    constructor(public readonly errors: EntityValidationError[]) {
        super(errors.map(error => error.message).join("\n"));
        this.name = "EntityValidationException";
    }
}

//#endregion

//#region Validation ----------------------------------------------------------

/**
 * Check that an object matches the declaration of a table :
 * type of each field, mandatory fields, enumeration values and unknown fields.
 *
 * Fields declared with the JSTypes.custom raw type are not checked : the model
 * does not know anything about their runtime representation.
 *
 * @returns the list of problems found, empty if the entity is valid
 */
export function getEntityErrors(model: EntitiesModel<any, any>, tableName: string, entity: unknown, options?: EntityValidationOptions): EntityValidationError[] {
    const errors: EntityValidationError[] = [];

    // -- The table must exist ------------------------------------------------
    if (!model.getTableNames().includes(tableName)) {
        return [{
            table: tableName,
            field: null,
            message: `Unknown table "${tableName}"`
        }];
    }

    // -- The entity must be a plain object -----------------------------------
    if (entity == null || typeof entity !== "object" || Array.isArray(entity)) {
        return [{
            table: tableName,
            field: null,
            message: `Table "${tableName}": expected an object, got ${entity === null ? "null" : Array.isArray(entity) ? "array" : typeof entity}`
        }];
    }

    const values = entity as Record<string, unknown>;
    const fields = model.getTableFieldNames(tableName, options?.version) as string[];

    // -- Unknown fields ------------------------------------------------------
    for (const field of Object.keys(values)) {
        if (!fields.includes(field)) {
            errors.push({
                table: tableName,
                field,
                message: `Table "${tableName}": unknown field "${field}"`
            });
        }
    }

    // -- Declared fields -----------------------------------------------------
    for (const field of fields) {
        const isProvided = Object.prototype.hasOwnProperty.call(values, field);
        if (!isProvided && options?.partial === true) {
            // Field is not part of the update, nothing to check
            continue;
        }

        const value = values[field];
        if (value == null) {
            if (!model.isFieldOptional(tableName, field)) {
                errors.push({
                    table: tableName,
                    field,
                    message: `Table "${tableName}", field "${field}": a value is required`
                });
            }
            // An optional field can hold null or undefined, nothing more to check
            continue;
        }

        const typeName = model.getFieldTypeName(tableName, field) as string;
        const error = _getFieldValueError(model, tableName, field, typeName, value);
        if (error != null) {
            errors.push(error);
        }
    }

    return errors;
}

/**
 * Check that an object matches the declaration of a table.
 * @see getEntityErrors
 * @throws EntityValidationException if the entity does not match
 */
export function validateEntity(model: EntitiesModel<any, any>, tableName: string, entity: unknown, options?: EntityValidationOptions): void {
    const errors = getEntityErrors(model, tableName, entity, options);
    if (errors.length > 0) {
        throw new EntityValidationException(errors);
    }
}

/** @returns the problem found on a single non-null value, or null if the value is valid */
function _getFieldValueError(model: EntitiesModel<any, any>, tableName: string, field: string, typeName: string, value: unknown): EntityValidationError | null {
    const typeDefinition = model.getTypeDefinition(typeName);
    if (typeDefinition == null) {
        return {
            table: tableName,
            field,
            message: `Table "${tableName}", field "${field}": unknown type "${typeName}"`
        };
    }

    // -- Enumerations --------------------------------------------------------
    if (typeDefinition instanceof EnumDefinition) {
        if (!typeDefinition.isValidValue(value)) {
            const expected = typeDefinition.getValues().map((candidate: unknown) => JSON.stringify(candidate)).join(", ");
            return {
                table: tableName,
                field,
                message: `Table "${tableName}", field "${field}": ${_describe(value)} is not a valid value for the enumeration "${typeName}" (expected one of ${expected})`
            };
        }
        return null;
    }

    // -- Base JS types -------------------------------------------------------
    switch (typeDefinition.rawType) {
        case JSTypes.boolean:
            return typeof value === "boolean" ? null : _typeError(tableName, field, typeName, "a boolean", value);
        case JSTypes.number:
            return (typeof value === "number" && Number.isFinite(value)) ? null : _typeError(tableName, field, typeName, "a number", value);
        case JSTypes.string:
            return typeof value === "string" ? null : _typeError(tableName, field, typeName, "a string", value);
        case JSTypes.object:
            return (typeof value === "object" && !Array.isArray(value)) ? null : _typeError(tableName, field, typeName, "an object", value);
        case JSTypes.custom:
            // The model does not know how a custom type is represented at runtime
            return null;
        default:
            return null;
    }
}

function _typeError(tableName: string, field: string, typeName: string, expected: string, value: unknown): EntityValidationError {
    return {
        table: tableName,
        field,
        message: `Table "${tableName}", field "${field}": expected ${expected} for the type "${typeName}", got ${_describe(value)}`
    };
}

/** Short description of a value, for the error messages */
function _describe(value: unknown): string {
    switch (typeof value) {
        case "number":
            // JSON.stringify() turns NaN and Infinity into null
            return Number.isFinite(value) ? JSON.stringify(value) : String(value);
        case "string":
        case "boolean":
            return JSON.stringify(value);
        case "object":
            return Array.isArray(value) ? "an array" : "an object";
        default:
            return typeof value;
    }
}

//#endregion
