import { APP_MODEL } from "./model";

//#region Properties types ----------------------------------------------------
// Put here shortcuts to the types of the model

export type AppTypes = typeof APP_MODEL.types;

export type UserId = typeof APP_MODEL.types["USER_ID"];
export type ProjectId = typeof APP_MODEL.types["PROJECT_ID"];

//#endregion

//#region Entities types ------------------------------------------------------
// Put here shortcuts to the entities of the model

export type AppTables = typeof APP_MODEL.tables;

/** Simple info for the user */
export type UserEntity = typeof APP_MODEL.tables["users"];
export type ProjectEntity = typeof APP_MODEL.tables["projects"];

//#endregion
