import { AppTypes } from "@dagda-app/shared/src/app/types";
import { AbstractServerApp, PassportProfile } from "@dagda/server/src/app";
export declare class ServerApp extends AbstractServerApp<AppTypes> {
    /** @inheritdoc */
    protected _isUserValid(profile: PassportProfile): Promise<boolean>;
}
