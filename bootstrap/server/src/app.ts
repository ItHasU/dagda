import { AppTypes } from "@dagda-app/shared/src/app/types";
import { AppContexts } from "@dagda-app/shared/src/entities/contexts";
import { AppEntityTypes, UserEntity, UserId } from "@dagda-app/shared/src/entities/types";
import { RequestOptions } from "@dagda/server/src/api";
import { AbstractServerApp, PassportProfile } from "@dagda/server/src/app";
import { Data } from "@dagda/shared/src/entities/tools/adapters";
import { asNamed } from "@dagda/shared/src/entities/tools/named";

export class ServerApp extends AbstractServerApp<AppTypes> {

    /** @inheritdoc */
    protected override async _isUserValid(profile: PassportProfile): Promise<boolean> {
        const handler = this.getTemporaryHandler();
        await handler.fetch({ type: "users", options: undefined });
        const users = handler.getItems("users");
        for (const user of users) {
            if (user.uid === profile.id) {
                return user.enabled ? true : false;
            }
        }
        // If the user is not found, we can create it, but disabled, the admin will have to enable it
        const newUser: UserEntity = {
            id: asNamed(0),
            uid: asNamed(profile.id),
            displayName: asNamed(profile.displayName),
            enabled: asNamed(false)
        };
        await handler.withTransaction(async (tr) => {
            console.log(`User created ${newUser.displayName} [${profile.emails?.join(", ")}]`);
            await tr.insert("users", newUser);
        });
        return false;
    }

    /** @inheritdoc */
    protected override async _fetch(context: AppContexts, request: RequestOptions): Promise<Data<AppEntityTypes>> {
        // -- Fetch the data --
        const result: Data<AppEntityTypes> = {
        };
        switch (context.type) {
            case "users": {
                if (request.type !== "server") {
                    throw new Error("Request can only be made from the server");
                }
                result.users = await this._db.all(`SELECT * FROM users`);
                break;
            }
            case "projects": {
                const userId = await this._getUserId(request);
                result.projects = await this._db.all(`SELECT * FROM projects WHERE userId = $1`, userId);
                break;
            }
            case "project": {
                const userId = await this._getUserId(request);
                const projectId = context.options.projectId;
                if (projectId == null) {
                    throw new Error("Missing projectId in context");
                }
                result.projects = await this._db.all(`SELECT * FROM projects WHERE id = $1 AND userId = $2`, projectId, userId);
            }
        }
        return result;
    }

    protected async _getUserId(request: RequestOptions): Promise<UserId> {
        if (request.type !== "client") {
            throw new Error("Request is not from client, can't find userId");
        }

        // -- Check the user --
        const userUID = request?.userProfile?.id;
        if (userUID == null) {
            throw new Error("Missing userUID in request");
        }
        const user = await this._db.get<UserEntity>(`SELECT * FROM users WHERE uid = $1`, userUID);
        if (user == null) {
            throw new Error("User not found");
        }
        return user.id;
    }

}