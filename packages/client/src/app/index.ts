import { SystemAPI } from "@dagda/shared/src/api/impl/system.api";
import { BaseAppTypes } from "@dagda/shared/src/app/types";
import { EntitiesModel } from "@dagda/shared/src/entities/model";
import { ContextAdapter } from "@dagda/shared/src/entities/tools/adapters";
import "bootstrap";
import "bootstrap-icons/font/bootstrap-icons.css";
import "bootstrap/dist/css/bootstrap.css";
import Handlebars from "handlebars";
import { apiCall } from "../api";

export interface BaseClientAppTypes extends BaseAppTypes {
}

/**
 * This class gather all the common code for the client application.
 */
export class Dagda {

    //#region App initialization

    /** Initialize Dagda */
    public static async init<AppTypes extends BaseClientAppTypes>(model: EntitiesModel<any, any>, contextAdapter: ContextAdapter<AppTypes["contexts"]>): Promise<void> {
        // -- Inject headers in the app --
        this._injectHeaders();

        // -- Refresh the user --
        await apiCall<SystemAPI, "getSystemInfo">("getSystemInfo", {}).then((info) => {
            // EventHandlerImpl.fire<DagdaEvents, "userInfoChanged">(this._eventHandlerData, "userInfoChanged", {
            //     displayName: info.userDisplayName,
            //     photoURL: info.userPhotoUrl ?? undefined
            // });
        }).catch((err) => {
            console.error("Error while refreshing user info", err);
        });
    }

    /** Inject app headers in the page so you don't have to bother */
    protected static _injectHeaders(): void {
        const headersTemplate = Handlebars.compile(require("./index.header.html").default);
        const headers = headersTemplate({
            title: "Dagda"
        });
        document.head.insertAdjacentHTML("beforeend", headers);
    }

    //#endregion

    //#region API calls

    public static call<AppTypes extends BaseAppTypes, APIName extends keyof AppTypes["apis"]>(
        name: APIName,
        ...args: Parameters<AppTypes["apis"][APIName]>
    ): Promise<ReturnType<AppTypes["apis"][APIName]>> {
        return apiCall<AppTypes['apis'], APIName>(name, {}, ...args);
    }

    //#endregion

}
