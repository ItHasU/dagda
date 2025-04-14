import { AppTypes } from "@dagda-app/shared/src/app/types";
import { AbstractServerApp, PassportProfile } from "@dagda/server/src/app";

export class ServerApp extends AbstractServerApp<AppTypes> {

    /** @inheritdoc */
    protected override async _isUserValid(profile: PassportProfile): Promise<boolean> {
        console.log("User profile:", JSON.stringify(profile));
        return true;
    }
}
