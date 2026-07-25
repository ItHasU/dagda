import { AppTypes } from "@dagda-app/shared/src/app/types";
import { AppContexts } from "@dagda-app/shared/src/entities/contexts";
import { AppEntityTypes, UserId } from "@dagda-app/shared/src/entities/types";
import { RequestOptions } from "@dagda/server/src/api";
import { AbstractServerApp } from "@dagda/server/src/app";
import { Migration } from "@dagda/server/src/sql/migrations";
import { Data } from "@dagda/shared/src/entities/tools/adapters";
import { asNamed } from "@dagda/shared/src/entities/tools/named";
import { APP_MODEL } from "@dagda-app/shared/src/entities/model";
import { APP_MIGRATIONS } from "./migrations";

// Physical names, prefixed by the framework (FEATURES §2). Read from the
// model rather than written by hand, so a rename is caught by the compiler.
const PROJECTS = APP_MODEL.getTableSqlName("projects");

export class ServerApp extends AbstractServerApp<AppTypes> {

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
            }
        }
        return result;
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
