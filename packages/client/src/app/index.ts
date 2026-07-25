import { EntitiesAPI } from "@dagda/shared/src/api/impl/entities.api";
import { SystemAPI, SystemInfo } from "@dagda/shared/src/api/impl/system.api";
import { BaseAppTypes } from "@dagda/shared/src/app/types";
import { Dagda } from "@dagda/shared/src/dagda";
import { EntitiesModel } from "@dagda/shared/src/entities/model";
import { ContextAdapter } from "@dagda/shared/src/entities/tools/adapters";
import { buildBaseServices } from "@dagda/shared/src/services";
import "bootstrap";
import "bootstrap-icons/font/bootstrap-icons.css";
import "bootstrap/dist/css/bootstrap.css";
import Handlebars from "handlebars";
import { apiCall } from "../api";
import { ClientNotificationImpl } from "../notification/notification.impl";
import { BasePageTypes, PageHandler, PageInfo } from "../pages/handler";
import headerTemplate from "./index.header.html";

export interface BaseClientAppTypes extends BaseAppTypes {
}

/** What an application hands to DagdaClient.start() */
export interface ClientStartParams<AppTypes extends BaseClientAppTypes, PageTypes extends BasePageTypes> {
    /** The application entities model */
    model: EntitiesModel<any, any>;
    /** How two contexts compare */
    contextAdapter: ContextAdapter<AppTypes["contexts"]>;
    /** The pages of the application, the only thing the framework cannot know */
    pages: { [Name in keyof PageTypes]: PageInfo<PageTypes[Name]> };
    /** Title of the document */
    title?: string;
    /** Services of the application, registered next to the framework's */
    services?: Record<string, unknown>;
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
     * Start the client application: register the services, then boot.
     *
     * An application no longer wires the standard services itself — log,
     * entities and notification are the framework's own implementations and it
     * only ever repeated the same four lines (FEATURES §0). All it declares
     * here is what belongs to it: its model, its contexts and its pages.
     */
    public static async start<AppTypes extends BaseClientAppTypes, PageTypes extends BasePageTypes>(
        params: ClientStartParams<AppTypes, PageTypes>
    ): Promise<void> {
        // -- Register the services --
        // Everything goes in a single Dagda.init(): registering resolves
        // Dagda.loaded, which every component waits on, so no service may be
        // missing by the time the first one wakes up.
        const pageHandler = new PageHandler<PageTypes>();
        for (const [name, info] of Object.entries(params.pages)) {
            pageHandler.registerPage(name, info as PageInfo<any>);
        }

        Dagda.init({
            ...buildBaseServices<AppTypes["entities"], AppTypes["contexts"], AppTypes["events"]>({
                model: params.model,
                contextAdapter: params.contextAdapter,
                persistence: {
                    fetch: (context) => apiCall<EntitiesAPI<AppTypes["contexts"], AppTypes["entities"]>, "fetch">("fetch", {}, context),
                    submit: (data) => apiCall<EntitiesAPI<AppTypes["contexts"], AppTypes["entities"]>, "submit">("submit", {}, data)
                },
                notification: new ClientNotificationImpl<AppTypes["events"]>()
            }),
            pages: pageHandler,
            ...(params.services ?? {})
        });

        // -- Inject headers in the app --
        this._injectHeaders(params.title);

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
    protected static _injectHeaders(title: string = "Dagda"): void {
        const headersTemplate = Handlebars.compile(headerTemplate);
        const headers = headersTemplate({ title });
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
