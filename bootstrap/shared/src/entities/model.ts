import { EntitiesModel } from "@dagda/shared/src/entities/model";
import { JSTypes } from "@dagda/shared/src/entities/tools/javascript.types";

//#region Custom field types --------------------------------------------------

/** State of computation of images */
export const enum ProjectStatus {
    /** Project is not active */
    INACTIVE = 0,
    /** Project is active */
    ACTIVE = 1,
    /** Project is active and starred */
    STARRED = 2,
    /** Project is active but finished */
    FINISHED = 3,
}

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
    PROJECT_STATUS: EntitiesModel.type<JSTypes.custom, ProjectStatus>({
        rawType: JSTypes.custom,
    }),
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
