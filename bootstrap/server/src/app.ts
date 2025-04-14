import { AppTypes } from "@dagda-app/shared/src/app/types";
import { AbstractApp } from "@dagda/server/src/app";
import { Profile } from "passport";

export class App extends AbstractApp<AppTypes> {

    /** @inheritdoc */
    protected override async _isUserValid(profile: Profile): Promise<boolean> {
        console.log("User profile:", JSON.stringify(profile));
        return true;
    }
}
