import { Data } from "../../entities/tools/adapters";
import { EntitiesTypes } from "../../entities/types";
import { SQLTransactionData, SQLTransactionResult } from "../../sql/transaction";

/** The API to get entities and persist modification on the database */
export type EntitiesAPI<Contexts, Tables extends EntitiesTypes> = {
    /** Fetch data based on desired contexts */
    fetch: (contexts: Contexts) => Data<Tables>;
    /** Submit changes in a transaction */
    submit: (transactionData: SQLTransactionData<Tables, Contexts>) => SQLTransactionResult;
};
