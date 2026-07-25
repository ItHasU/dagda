import { EntitiesModel } from "@dagda/shared/src/entities/model";
import { JSTypes } from "@dagda/shared/src/entities/tools/javascript.types";

//#region Custom field types --------------------------------------------------

/**
 * State of a project.
 *
 * A declarative enumeration rather than a TypeScript enum (FEATURES §2): the
 * labels travel with the declaration, the values are chosen explicitly, and the
 * field really gets typed — `EntitiesModel.type<JSTypes.custom, X>` did not,
 * its custom parameter is never used and the field fell back to the raw type.
 */
export const PROJECT_STATUS = EntitiesModel.enum({
    /** Project is not active */
    INACTIVE: { value: 0, label: "Inactif" },
    /** Project is active */
    ACTIVE: { value: 1, label: "Actif" },
    /** Project is active and starred */
    STARRED: { value: 2, label: "Favori" },
    /** Project is active but finished */
    FINISHED: { value: 3, label: "Terminé" },
});

/** Union of the values a project status can take */
export type ProjectStatus = typeof PROJECT_STATUS.type;

//#endregion

//#region Entities model ------------------------------------------------------

export const APP_MODEL = new EntitiesModel({
    // -- ID types ------------------------------------------------------------
    USER_ID: {
        rawType: JSTypes.number
    },
    PROJECT_ID: {
        rawType: JSTypes.number
    },
    // -- Base types ----------------------------------------------------------
    BOOLEAN: {
        rawType: JSTypes.boolean
    },
    TEXT: {
        rawType: JSTypes.string
    },
    PROJECT_STATUS,
    // -- Custom types --------------------------------------------------------
    USER_UID: {
        rawType: JSTypes.string
    },
}, {
    users: {
        id: { type: "USER_ID", identity: true },
        uid: { type: "USER_UID" },
        displayName: { type: "TEXT" },
        enabled: { type: "BOOLEAN" }
    },
    projects: {
        id: { type: "PROJECT_ID", identity: true },
        name: { type: "TEXT" },
        description: { type: "TEXT" },
        userId: { type: "USER_ID" },
        status: { type: "PROJECT_STATUS" }
    }
});

//#endregion
