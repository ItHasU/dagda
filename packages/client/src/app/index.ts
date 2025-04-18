import { EntitiesAPI } from "@dagda/shared/src/api/impl/entities.api";
import { SystemAPI } from "@dagda/shared/src/api/impl/system.api";
import { BaseAppTypes } from "@dagda/shared/src/app/types";
import { EntitiesHandler } from "@dagda/shared/src/entities/handler";
import { EntitiesModel } from "@dagda/shared/src/entities/model";
import { ContextAdapter } from "@dagda/shared/src/entities/tools/adapters";
import { EventHandlerData, EventHandlerImpl, EventListener } from "@dagda/shared/src/tools/events";
import "bootstrap";
import "bootstrap-icons/font/bootstrap-icons.css";
import "bootstrap/dist/css/bootstrap.css";
import Handlebars from "handlebars";
import { apiCall } from "../api";
import { AbstractPageElement } from "./abstract.page.element";

export interface BaseClientAppTypes extends BaseAppTypes {
    /** Pages */
    pages: { [pageName: string]: AbstractPageElement };
}

export type DagdaEvents = {
    userInfoChanged: {
        /** The user display name */
        displayName: string;
        /** The user photo URL */
        photoURL?: string;
    };

    /** Event triggered when the page is changed */
    pageChanged: {
        /** The page that was set */
        page: AbstractPageElement;
    }
}

/**
 * This class gather all the common code for the client application.
 */
export class Dagda {


    //#region App initialization

    protected static _handler: EntitiesHandler<any, any> | null = null;

    /** Initialize Dagda */
    public static async init<AppTypes extends BaseAppTypes>(model: EntitiesModel<any, any>, contextAdapter: ContextAdapter<AppTypes["contexts"]>): Promise<void> {
        // -- Create the handler --
        this._handler = new EntitiesHandler<AppTypes["entities"], AppTypes["contexts"]>(model, contextAdapter, {
            fetch: async (context) => {
                return apiCall<EntitiesAPI<AppTypes["contexts"], AppTypes["entities"]>, "fetch">("fetch", {}, context);
            },
            submit: async (data) => {
                return apiCall<EntitiesAPI<AppTypes["contexts"], AppTypes["entities"]>, "submit">("submit", {}, data);
            }
        });

        // -- Inject headers in the app --
        this._injectHeaders();

        // -- Refresh the user --
        await apiCall<SystemAPI, "getSystemInfo">("getSystemInfo", {}).then((info) => {
            EventHandlerImpl.fire<DagdaEvents, "userInfoChanged">(this._eventHandlerData, "userInfoChanged", {
                displayName: info.userDisplayName,
                photoURL: info.userPhotoUrl ?? undefined
            });
        }).catch((err) => {
            console.error("Error while refreshing user info", err);
        });
    }

    /** Get the handler */
    public static handler<AppTypes extends BaseAppTypes>(): EntitiesHandler<AppTypes["entities"], AppTypes["contexts"]> {
        if (Dagda._handler == null) {
            throw new Error("Handler not initialized");
        }
        return Dagda._handler;
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

    //#region Events

    /** Event listeners storage */
    private static readonly _eventHandlerData: EventHandlerData<Record<string, unknown>> = {};

    /** Register a listener on any notification kind */
    public static on<EventName extends keyof DagdaEvents>(name: EventName, listener: EventListener<DagdaEvents[EventName]>): void {
        EventHandlerImpl.on<DagdaEvents, EventName>(this._eventHandlerData, name, listener);
    }

    // //#region Page management

    // protected _registeredPages: { [pageName in keyof AppTypes["pages"]]?: { new(): AbstractPageElement } } = {};
    // protected _currentPage: AbstractPageElement | null = null;

    // public registerPage<PageName extends keyof AppTypes["pages"]>(
    //     name: PageName,
    //     page: { new(): AppTypes["pages"][PageName] }
    // ): void {
    //     this._registeredPages[name] = page;
    // }

    // /** 
    //  * Toggle current page.
    //  * If no page is given, the default page will be used.
    //  */
    // public async setPage<PageName extends keyof AppTypes["pages"]>(page: PageName): Promise<AppTypes["pages"][PageName]> {
    //     // -- Empty page --
    //     if (this._currentPage != null) {
    //         try {
    //             // FIXME this._disposePage(this._currentPage);
    //         } catch (err) {
    //             console.error("Error while disposing page", err);
    //         } finally {
    //             this._currentPage = null;
    //         }
    //     }

    //     try {
    //         const constructor = this._registeredPages[page];
    //         if (constructor != null) {
    //             // -- Create page --
    //             const newPage = new constructor();
    //             this._currentPage = newPage
    //             // -- Append page --
    //             // FIXME this._injectPage(this._currentPage);
    //             await this._currentPage.refresh(); // Catch by the page
    //             return newPage as AppTypes["pages"][PageName];
    //         } else {
    //             console.error(`Page ${page.toString()} not found, cannot set page`);
    //             return Promise.reject(new Error(`Page ${page.toString()} not found`));
    //         }
    //     } catch (err) {
    //         console.error("Error while creating page", err);
    //         this._currentPage = null;
    //         throw err;
    //     }
    // }

    // //#endregion

    //#region API calls

    public static call<AppTypes extends BaseAppTypes, APIName extends keyof AppTypes["apis"]>(
        name: APIName,
        ...args: Parameters<AppTypes["apis"][APIName]>
    ): Promise<ReturnType<AppTypes["apis"][APIName]>> {
        return apiCall<AppTypes['apis'], APIName>(name, {}, ...args);
    }

    //#endregion
}
