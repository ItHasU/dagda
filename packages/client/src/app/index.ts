import { SystemAPI, SystemInfo } from "@dagda/shared/src/api/impl/system.api";
import { BaseAppTypes } from "@dagda/shared/src/app/types";
import { EntitiesModel } from "@dagda/shared/src/entities/model";
import { ContextAdapter } from "@dagda/shared/src/entities/tools/adapters";
import "bootstrap";
import "bootstrap-icons/font/bootstrap-icons.css";
import "bootstrap/dist/css/bootstrap.css";
import Handlebars from "handlebars";
import { apiCall } from "../api";
import headerTemplate from "./index.header.html";

export interface BaseClientAppTypes extends BaseAppTypes {
}

/**
 * Bootstrap of the client application: page headers, system information, and
 * the typed entry point for API calls.
 *
 * This is not the service registry — that one is `Dagda`, in the shared package,
 * and it is reached the same way from the client and from the server.
 */
export class DagdaClient {

    //#region App initialization

    /** Last system information read from the server, null until the first successful call */
    protected static _systemInfo: SystemInfo | null = null;

    /**
     * System information read from the server at initialization.
     * Null if the server could not be reached.
     */
    public static get systemInfo(): SystemInfo | null {
        return this._systemInfo;
    }

    /**
     * Start the client application.
     * Call it after the services have been registered with `Dagda.init()`.
     */
    public static async start<AppTypes extends BaseClientAppTypes>(model: EntitiesModel<any, any>, contextAdapter: ContextAdapter<AppTypes["contexts"]>): Promise<void> {
        // -- Inject headers in the app --
        this._injectHeaders();

        // -- Read the system information (including the current user) --
        await this.refreshSystemInfo();
    }

    /** Read the system information from the server and cache it */
    public static async refreshSystemInfo(): Promise<SystemInfo | null> {
        try {
            this._systemInfo = await apiCall<SystemAPI, "getSystemInfo">("getSystemInfo", {});
        } catch (err) {
            console.error("Error while reading system information", err);
            this._systemInfo = null;
        }
        return this._systemInfo;
    }

    /** Inject app headers in the page so you don't have to bother */
    protected static _injectHeaders(): void {
        const headersTemplate = Handlebars.compile(headerTemplate);
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
