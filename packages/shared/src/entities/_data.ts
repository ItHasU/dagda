import { EntitiesModel } from "./model";
import { JSTypes } from "./tools/javascript.types";

/** Declarative enumeration stored as an integer */
export const PUBLICATION_STATUS = EntitiesModel.enum({
    DRAFT: { value: 1, label: "Draft" },
    PUBLISHED: { value: 2, label: "Published" }
});
/** Type of the values of PUBLICATION_STATUS */
export type PublicationStatus = typeof PUBLICATION_STATUS.type;

/** Declarative enumeration stored as a string */
export const POST_KIND = EntitiesModel.enum({
    ARTICLE: { value: "article", label: "Article" },
    NOTE: { value: "note", label: "Note" }
});
/** Type of the values of POST_KIND */
export type PostKind = typeof POST_KIND.type;

/** A test model with users and posts */
export const TEST_MODEL = new EntitiesModel({
    "USER_ID": {
        rawType: JSTypes.number
    },
    "POST_ID": {
        rawType: JSTypes.number
    },
    "INTEGER": {
        rawType: JSTypes.number
    },
    "BOOLEAN": {
        rawType: JSTypes.boolean
    },
    "TEXT": {
        rawType: JSTypes.string
    },
    "NAME": {
        rawType: JSTypes.string
    },
    "SURNAME": {
        rawType: JSTypes.string
    },
    "MARKDOWN": {
        rawType: JSTypes.string
    },
    "PUBLICATION_STATUS": PUBLICATION_STATUS,
    "POST_KIND": POST_KIND
}, {
    "users": {
        id: {
            type: "USER_ID",
            identity: true
        },
        name: {
            type: "NAME"
        },
        surname: {
            type: "SURNAME"
        },
        age: {
            type: "INTEGER",
            optional: true,
            fromVersion: 1 // Test a field added
        },
        size: {
            type: "INTEGER",
            optional: true,
            toVersion: 1 // Test a removed field
        }
    },
    "posts": {
        id: {
            type: "POST_ID",
            identity: true
        },
        author: {
            type: "USER_ID",
            foreignTable: "users"
        },
        title: {
            type: "TEXT"
        },
        content: {
            type: "MARKDOWN"
        },
        status: {
            type: "PUBLICATION_STATUS"
        },
        kind: {
            type: "POST_KIND"
        },
        pinned: {
            type: "BOOLEAN",
            optional: true
        }
    }
});
