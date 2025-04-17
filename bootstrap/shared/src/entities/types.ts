import { APP_MODEL } from "./model";

//#region Properties types ----------------------------------------------------
// Put here shortcuts to the types of the model

export type AppFieldTypes = typeof APP_MODEL.fieldTypes;

export type UserId = typeof APP_MODEL.fieldTypes["USER_ID"];
export type ProjectId = typeof APP_MODEL.fieldTypes["PROJECT_ID"];

//#endregion

//#region Entities types ------------------------------------------------------
// Put here shortcuts to the entities of the model

export type AppEntityTypes = typeof APP_MODEL.tablesFields;

/** Simple info for the user */
export type UserEntity = AppEntityTypes["users"];
export type ProjectEntity = AppEntityTypes["projects"];

//#endregion
