import { SQLTransactionData } from "../../sql/transaction";
import { EntitiesTypes } from "../types";

//#region Adapter -------------------------------------------------------------

/** 
 * Return type for the fetch function.
 * This structure can contain a list of items fetched from the database.
 * Those items will be merged in the current cache.
 */
export type Data<Tables extends EntitiesTypes> = { [TableName in keyof Tables]?: Tables[TableName][] };

/**
 * Return type of the submit function.  
 * Get the results of the inserts performed.
 */
export interface SQLTransactionResult {
    updatedIds: { [temporaryId: number]: number };
}

/** 
 * Handles the comparisons between two contexts.
 * The comparator is used mostly to determine if contexts are obsolete or up-to-date.
 */
export interface ContextAdapter<Contexts> {
    /** 
     * Compare contexts.
     * MUST BE executable locally without a promise for quick performances.
     */
    contextEquals(newContext: Contexts, oldContext: Contexts): boolean;

    /** 
     * @returns true if the new context intersects the old context.
     * MUST BE executable locally without a promise for quick performances.
     */
    contextIntersects(newContext: Contexts, oldContext: Contexts): boolean;
}

/**
 * The handle provides services for the handler to:
 * - fetch data from a given context,
 * - and submit modifications applied locally.
 */
export interface PersistenceAdapter<Tables extends EntitiesTypes, Contexts> {

    /** Fetch data corresponding to filter */
    fetch(context: Contexts): Promise<Data<Tables>>;

    /** Submit changes in the transaction */
    submit(transactionData: SQLTransactionData<Tables, Contexts>): Promise<SQLTransactionResult>;
}

//#endregion