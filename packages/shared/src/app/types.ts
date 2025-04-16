import { APICollection } from "../api/types";

/**
 * This interface contains the definition of types useful for the application.
 * The fields should be extended in your application according to your needs.
 */
export interface BaseAppTypes {
    /** Context types for fetch */
    contexts: unknown;
    /** Collection of APIs */
    apis: APICollection;
}
