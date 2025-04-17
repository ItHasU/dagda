import { AppTypes } from "@dagda-app/shared/src/app/types";
import { AppContexts } from "@dagda-app/shared/src/entities/contexts";
import { AppEntityTypes, UserEntity } from "@dagda-app/shared/src/entities/types";
import { RequestOptions } from "@dagda/server/src/api";
import { AbstractServerApp, PassportProfile } from "@dagda/server/src/app";
import { Data } from "@dagda/shared/src/entities/tools/adapters";

export class ServerApp extends AbstractServerApp<AppTypes> {

    /** @inheritdoc */
    protected override async _isUserValid(profile: PassportProfile): Promise<boolean> {
        console.log("User profile:", JSON.stringify(profile));
        return true;
    }

    /** @inheritdoc */
    protected override async _fetch(context: AppContexts, request?: RequestOptions): Promise<Data<AppEntityTypes>> {
        // -- Check the user --
        const userUID = request?.userProfile?.id;
        if (userUID == null) {
            throw new Error("Missing userUID in request");
        }
        const user = await this._db.get<UserEntity>(`SELECT * FROM users WHERE uid = $1`, userUID);
        if (user == null) {
            throw new Error("User not found");
        }
        const userId = user.id;

        // -- Fetch the data --
        const result: Data<AppEntityTypes> = {
        };
        switch (context.type) {
            case "users": {
                result.users = await this._db.all(`SELECT * FROM users WHERE id = $1`, userId);
                break;
            }
            case "projects": {
                result.projects = await this._db.all(`SELECT * FROM projects WHERE userId = $1`, userId);
                break;
            }
            case "project": {
                const projectId = context.options.projectId;
                if (projectId == null) {
                    throw new Error("Missing projectId in context");
                }
                result.projects = await this._db.all(`SELECT * FROM projects WHERE id = $1 AND userId = $2`, projectId, userId);
            }
        }
        return result;
    }

}