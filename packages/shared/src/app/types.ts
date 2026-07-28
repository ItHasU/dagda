import { ActionsCollection } from "../actions/types";
import { APICollection } from "../api/types";
import { FieldTypesDefinition, NamedFieldTypes } from "../entities/model";
import { EntitiesTypes } from "../entities/types";
import { DagdaEvents } from "../notification/events";
import { NotificationService } from "../notification/service";
import { LogService } from "../tools/log";

/**
 * This interface contains the definition of types useful for the application.
 * The fields should be extended in your application according to your needs.
 */
export interface BaseAppTypes {
    /** Branded JS types the entities model declares (`typeof APP_MODEL.fieldTypes`) — e.g. `AppTypes["fieldTypes"]["USER_ID"]` */
    fieldTypes: NamedFieldTypes<FieldTypesDefinition>;
    /** Mapping Entity types for each table */
    entities: EntitiesTypes;
    /** Context types for fetch */
    contexts: unknown;
    /** Collection of APIs */
    apis: APICollection;
    /** Collection of actions (FEATURES §11.1), the console's curated vocabulary */
    actions: ActionsCollection;
    /** Notification events (key is the name of the notification, value type is the data in the event) */
    events: DagdaEvents & Record<string, unknown>;
    /** Union of the permission keys the application may check (FEATURES §7.1), on top of `DagdaPermission` */
    permissions: string;
}

export type BaseAppServices<AppTypes extends BaseAppTypes> = LogService & NotificationService<AppTypes["events"]>;