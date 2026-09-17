import { ServerDagda, ServerOwnServicesParams } from "@dagda/server/src/app/dagda";
import { BaseServicesParams } from "@dagda/shared/src/dagda";
import { AppTypes } from "@dagda-app/shared/src/app/types";
import { NotesService } from "./notes.service";

/**
 * The application's own `dagda` (FEATURES §9): the framework's `ServerDagda`
 * plus this app's one custom service, `notes`. An application with a
 * capability of its own to expose — a broker connection, a cache, here just
 * a count — declares one field per service here, the same way it declares
 * one table per entity in the model. Reached from anywhere in the server as
 * `dagda.notes`, never threaded through constructors by hand.
 *
 * `ServerDagda`'s own doc comment says no application does this yet, so
 * `AbstractServerApp` had no hook to build one — only the client had
 * `DagdaClient.start({buildDagda})`. `AbstractServerApp._buildDagda()` was
 * added to close that gap (see `ServerApp._buildDagda()` below for the
 * override that wires this class in).
 */
export class AppServerDagda extends ServerDagda<AppTypes> {

    public readonly notes: NotesService;

    constructor(params: BaseServicesParams<AppTypes> & ServerOwnServicesParams<{}> & { notes: NotesService }) {
        super(params);
        this.notes = params.notes;
    }

}

/**
 * The running application's services — the same instance as the framework's
 * own `dagda` (`@dagda/server/src/app/dagda`), just viewed through this
 * application's own type, `notes` included.
 */
export let dagda: AppServerDagda;

/** @internal set by `ServerApp._buildDagda()`, synchronously with the framework's own `_setDagda`. */
export function _setDagda(instance: AppServerDagda): void {
    dagda = instance;
}
