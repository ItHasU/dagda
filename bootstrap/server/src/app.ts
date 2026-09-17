import { AppTypes } from "@dagda-app/shared/src/app/types";
import { AppContexts } from "@dagda-app/shared/src/entities/contexts";
import { APP_MODEL } from "@dagda-app/shared/src/entities/model";
import { AppEntityTypes, NoteId, UserId } from "@dagda-app/shared/src/entities/types";
import { RequestOptions } from "@dagda/server/src/api";
import { AbstractServerApp } from "@dagda/server/src/app";
import { ServerOwnServicesParams } from "@dagda/server/src/app/dagda";
import { Migration } from "@dagda/server/src/sql/migrations";
import { UserInfo } from "@dagda/shared/src/auth/types";
import { BaseServicesParams } from "@dagda/shared/src/dagda";
import { Data } from "@dagda/shared/src/entities/tools/adapters";
import { asNamed } from "@dagda/shared/src/entities/tools/named";
import { _getUpdatedId } from "@dagda/shared/src/entities/handler";
import { OperationType, SQLTransactionData, SQLTransactionResult } from "@dagda/shared/src/sql/transaction";
import { AppServerDagda, dagda, _setDagda } from "./dagda";
import { APP_MIGRATIONS } from "./migrations";
import { NotesService } from "./notes.service";

// Physical names, prefixed by the framework (FEATURES §2). Read from the
// model rather than written by hand, so a rename is caught by the compiler.
const PROJECTS = APP_MODEL.getTableSqlName("projects");
const NOTES = APP_MODEL.getTableSqlName("notes");

/**
 * May `user` ask about `params.userId`? Only their own — the check
 * `countProjects`'s registration below hands to `permission` (FEATURES §5),
 * pulled out to a named function so it can be tested on its own, the same
 * predicate the running route actually uses.
 */
export function isOwnAccount(user: UserInfo, params: { userId: UserId }): boolean {
    return user.id === params.userId;
}

export class ServerApp extends AbstractServerApp<AppTypes> {

    public constructor(...args: ConstructorParameters<typeof AbstractServerApp<AppTypes>>) {
        super(...args);
        this._registerAppAPI();
    }

    /** @inheritdoc */
    protected override _migrations(): Migration[] {
        return APP_MIGRATIONS;
    }

    /** @inheritdoc */
    protected override async _fetch(context: AppContexts, request: RequestOptions): Promise<Data<AppEntityTypes>> {
        // -- Fetch the data --
        const result: Data<AppEntityTypes> = {
        };
        switch (context.type) {
            case "projects": {
                const userId = this._getUserId(request);
                result.projects = await this._db.all(`SELECT * FROM ${PROJECTS} WHERE "userId" = $1`, userId);
                break;
            }
            case "project": {
                const userId = this._getUserId(request);
                const projectId = context.options.projectId;
                if (projectId == null) {
                    throw new Error("Missing projectId in context");
                }
                // The userId is part of the query, not a check afterwards: a
                // project belonging to someone else must not be found at all.
                result.projects = await this._db.all(`SELECT * FROM ${PROJECTS} WHERE "id" = $1 AND "userId" = $2`, projectId, userId);
                // Same pattern MQTTToolbox2 uses for a topic and its
                // messages: a context with options carries its child rows
                // along, one round trip instead of a second fetch.
                result.notes = await this._db.all(`SELECT * FROM ${NOTES} WHERE "projectId" = $1`, projectId);
            }
        }
        return result;
    }

    /**
     * @inheritdoc
     * Two things beyond the default: `notes.manage` (FEATURES §7.1) gates
     * writing a note — declared in `AppPermission`, but a declaration alone
     * checks nothing, so it is verified here, the same place MQTTToolbox2
     * checks `dashboards.edit`. And a successful note insert tells the
     * project's owner about it (FEATURES §6/§9), filtered to them alone —
     * unlike `contextChanged` just below, still broadcast open by default.
     */
    protected override async _submit(transactionData: SQLTransactionData<AppEntityTypes, AppContexts>, request: RequestOptions): Promise<SQLTransactionResult> {
        if (request.type === "client") {
            for (const operation of transactionData.operations) {
                if (operation.options.table === "notes") {
                    this._requirePermission(request.user, "notes.manage");
                }
            }
        }

        const result = await super._submit(transactionData, request);

        for (const operation of transactionData.operations) {
            if (operation.type === OperationType.INSERT && operation.options.table === "notes") {
                // Cast: TS does not propagate the "notes" narrowing above
                // through the shared `SQLOperation<Tables, keyof Tables>`
                // union to `.item` (MQTTToolbox2's dashboard ownership check
                // hits the same limitation).
                const note = operation.options.item as AppEntityTypes["notes"];
                // Mutated in place by the framework's own submit(), called
                // from super._submit() above: by now `note.projectId` holds
                // the real project id, even if the client sent the temporary
                // id of a project inserted earlier in this very transaction
                // (ROADMAP tranche 2, EurekAI risk #2) — see app.spec.ts.
                const project = await this._db.get<{ userId: UserId }>(`SELECT "userId" FROM ${PROJECTS} WHERE "id" = $1`, note.projectId);
                if (project != null) {
                    // Cast: `_getUpdatedId` answers in the framework's own
                    // generic id brand, not the model's specific one.
                    const noteId = _getUpdatedId(result, note.id) as NoteId;
                    const totalNotes = await dagda.notes.countForProject(note.projectId);
                    this.broadcast(
                        "noteAdded",
                        { projectId: note.projectId, noteId, text: note.text, totalNotes },
                        (user) => user.id === project.userId
                    );
                }
            }
        }

        return result;
    }

    /**
     * @inheritdoc
     * Wires this application's one custom service (FEATURES §9) — see
     * `dagda.ts` for the mechanism itself. `this._db` is already set by the
     * time the framework calls this (after "Register standard services" in
     * `AbstractServerApp`'s constructor), which a constructor *parameter*
     * could not rely on.
     */
    protected override _buildDagda(params: BaseServicesParams<AppTypes> & ServerOwnServicesParams<{}>): AppServerDagda {
        const instance = new AppServerDagda({ ...params, notes: new NotesService(this._db) });
        _setDagda(instance);
        return instance;
    }

    /** Applicative API routes (FEATURES §5) */
    protected _registerAppAPI(): void {
        this.registerAPI("countProjects", (_options, params) => this._countProjects(params.userId), {
            // Any authenticated account may ask about their own projects,
            // never someone else's — the parameterized form a flat
            // permission string cannot express (FEATURES §5, commit
            // 610b842).
            permission: isOwnAccount
        });
    }

    /** @returns how many projects the given account owns */
    protected async _countProjects(userId: UserId): Promise<number> {
        const row = await this._db.get<{ count: string }>(`SELECT COUNT(*)::text AS "count" FROM ${PROJECTS} WHERE "userId" = $1`, userId);
        return Number(row?.count ?? 0);
    }

    /**
     * @returns the id of the account behind the request.
     *
     * Accounts being framework data (FEATURES §11.4), this is the framework
     * account id, stored directly in `projects.userId`. No lookup and no
     * mapping table: the id *is* the bridge between the two worlds.
     */
    protected _getUserId(request: RequestOptions): UserId {
        if (request.type !== "client") {
            throw new Error("Request is not from client, can't find userId");
        }
        return asNamed(request.user.id);
    }

}
