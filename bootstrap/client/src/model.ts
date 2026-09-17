import { AppContexts } from "@dagda-app/shared/src/entities/contexts";
import { PROJECT_STATUS } from "@dagda-app/shared/src/entities/model";
import { AppEntityTypes, NoteEntity, ProjectEntity, UserId } from "@dagda-app/shared/src/entities/types";
import { ModelFunctionDeclaration } from "@dagda/client/src/app/model";
import { asNamed } from "@dagda/shared/src/entities/tools/named";
import { SQLTransaction } from "@dagda/shared/src/sql/transaction";

/**
 * A transaction over this application's tables and contexts.
 *
 * Exported because a page composing several model calls into one transaction
 * needs to name it — and because the framework's in-memory test fixtures are
 * parameterized on their own `TestContext`, so a spec exercising a model
 * function has to say, once and explicitly, that the two are the same
 * transaction as far as the function is concerned: it only ever inserts rows,
 * it never looks at a context.
 */
export type AppTransaction = SQLTransaction<AppEntityTypes, AppContexts>;

/**
 * Named functions acting on the data model (Dagda FEATURES §11.2), reachable
 * as `dagda.model.xxx(...)`. One entry here, deliberately: everything else a
 * write needs (a lone insert, an update) reads clearly enough inline at the
 * call site — a model function earns its keep when several tables move
 * together, which is exactly `createProject`'s case below.
 */
export type AppModel = {
    createProject: ModelFunctionDeclaration<AppTransaction>;
};

/**
 * Creates a project and its first note in one transaction (ROADMAP tranche
 * 5, EurekAI risk #2) — the client-side face of what
 * `bootstrap/server/src/app.spec.ts` already proves server-side: a
 * transaction may reference an entity it just inserted, by the *temporary*
 * id the framework handed back, before the server has ever seen it.
 *
 * `project.id` is read off the object `tr.insert()` returns, not hardcoded:
 * that is the whole point. It holds a temporary negative id the moment
 * `insert()` returns, synchronously — reused right away as the note's
 * `projectId`, exactly the value the framework remaps to the real id once
 * the transaction round-trips (`_updateForeignKeys`, `model.spec.ts` proves
 * it end to end with the framework's own test fixtures).
 */
export const APP_MODEL_FUNCTIONS: AppModel = {
    createProject: {
        description: "Crée un projet et sa première note, dans une même transaction",
        fn: (tr: AppTransaction, userId: UserId, name: string, noteText: string): { project: ProjectEntity, note: NoteEntity } => {
            const project: ProjectEntity = {
                id: asNamed(0),
                name: asNamed(name),
                description: asNamed(""),
                userId,
                status: asNamed(PROJECT_STATUS.values.ACTIVE)
            };
            tr.insert("projects", project);

            const note: NoteEntity = {
                id: asNamed(0),
                projectId: project.id, // the project's temporary id, reused as-is
                text: asNamed(noteText)
            };
            tr.insert("notes", note);

            return { project, note };
        }
    }
};
