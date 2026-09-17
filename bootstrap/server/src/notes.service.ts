import { PGRunner } from "@dagda/server/src/sql/impl/pg.runner";
import { APP_MODEL } from "@dagda-app/shared/src/entities/model";
import { ProjectId } from "@dagda-app/shared/src/entities/types";

const NOTES = APP_MODEL.getTableSqlName("notes");

/**
 * A custom applicative service (FEATURES §9) — the mechanism this file
 * documents, not the service itself, which is deliberately trivial. An
 * application wires this into its own `dagda` (see `AppServerDagda` in
 * `dagda.ts`) instead of every call site that needs it reaching into the
 * database directly, the same way `dagda.entities`/`dagda.settings` spare
 * the framework's own code from doing so.
 */
export class NotesService {

    constructor(protected _db: PGRunner) { }

    /** @returns how many notes a project currently has */
    public async countForProject(projectId: ProjectId): Promise<number> {
        const row = await this._db.get<{ count: string }>(
            `SELECT COUNT(*)::text AS "count" FROM ${NOTES} WHERE "projectId" = $1`, projectId
        );
        return Number(row?.count ?? 0);
    }

}
