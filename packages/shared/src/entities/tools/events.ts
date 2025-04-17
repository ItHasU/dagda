/** The handler will register on these events on the NotificationService to keep updated of changes */
export type ContextEvents<Contexts> = {
    "contextChanged": Contexts[];
};

/** Events fired by the handler to let you know what's happening */
export type EntitiesEvents = {
    "state": {
        /** 
         * Is the handler currently loading data ?
         * (ex: during loadTable()) 
         */
        downloading: number,
        /**
         * Is the handler currently sending data ?
         * (ex: during submit())
         */
        uploading: number,
        /**
         * Is the cache dirty ?
         * (ex: after an error or during a refresh)
         */
        dirty: boolean
    }
}
