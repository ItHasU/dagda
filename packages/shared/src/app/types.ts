import { APICollection } from "../api/types";
import { EntitiesTypes } from "../entities/types";

/**
 * This interface contains the definition of types useful for the application.
 * The fields should be extended in your application according to your needs.
 */
export interface BaseAppTypes {
    /** Mapping Entity types for each table */
    entities: EntitiesTypes;
    /** Context types for fetch */
    contexts: unknown;
    /** Collection of APIs */
    apis: APICollection;
    /** Notification events (key is the name of the notification, value type is the data in the event) */
    notifications: Record<string, unknown>;
}
