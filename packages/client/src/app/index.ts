import { EntitiesAPI } from "@dagda/shared/src/api/impl/entities.api";
import { SystemAPI } from "@dagda/shared/src/api/impl/system.api";
import { BaseAppTypes } from "@dagda/shared/src/app/types";
import { EntitiesHandler } from "@dagda/shared/src/entities/handler";
import { EntitiesModel } from "@dagda/shared/src/entities/model";
import { ContextAdapter } from "@dagda/shared/src/entities/tools/adapters";
import { NotificationHelper } from "@dagda/shared/src/notification/notification.helper";
import { EventHandlerData, EventHandlerImpl, EventListener } from "@dagda/shared/src/tools/events";
import "bootstrap";
import "bootstrap-icons/font/bootstrap-icons.css";
import "bootstrap/dist/css/bootstrap.css";
import Handlebars from "handlebars";
import { apiCall } from "../api";
import { ClientNotificationImpl } from "../notification/notification.impl";
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

/** Page information mostly for the menu plus the constructor */
export interface PageInfo<Page extends AbstractPageElement> {
    /** Option icon for the page. Space between icon and title will be automatically helped */
    iconHTML?: string;
    /** Page order in the menu */
    order?: number;
    /** Display name of the page, mostly used by the menu */
    title: string;
    /** Page constructor */
    constructor: { new(): Page };
}

/**
 * This class gather all the common code for the client application.
 */
export class Dagda {

    //#region App initialization

    /** Initialize Dagda */
    public static async init<AppTypes extends BaseClientAppTypes>(model: EntitiesModel<any, any>, contextAdapter: ContextAdapter<AppTypes["contexts"]>): Promise<void> {
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

        // -- Notifications --
        NotificationHelper.set(new ClientNotificationImpl<any>() as any);
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

    //#region Entities handler

    protected static _handler: EntitiesHandler<any, any> | null = null;

    /** Get the handler */
    public static handler<AppTypes extends BaseAppTypes>(): EntitiesHandler<AppTypes["entities"], AppTypes["contexts"]> {
        if (Dagda._handler == null) {
            throw new Error("Handler not initialized");
        }
        return Dagda._handler;
    }

    //#endregion

    //#region Events

    /** Event listeners storage */
    private static readonly _eventHandlerData: EventHandlerData<Record<string, unknown>> = {};

    /** Register a listener on any notification kind */
    public static on<EventName extends keyof DagdaEvents>(name: EventName, listener: EventListener<DagdaEvents[EventName]>): void {
        EventHandlerImpl.on<DagdaEvents, EventName>(this._eventHandlerData, name, listener);
    }

    //#endregion

    //#region Page management

    // Storage for registered pages
    private static _registeredPages: { [pageName: string]: PageInfo<any> } = {};

    // Current active page
    private static _currentPage: AbstractPageElement | null = null;
    private static _currentPageUID: string | null = null;

    /** Get the current page */
    public static get currentPageUID(): string | null {
        return this._currentPageUID;
    }

    /** Register a page */
    public static registerPage<AppTypes extends BaseClientAppTypes, PageName extends keyof AppTypes["pages"]>(
        name: PageName,
        page: PageInfo<AppTypes["pages"][PageName]>
    ): void {
        this._registeredPages[name as string] = page;
    }

    /** Get the list of pages, sorted */
    public static getPageInfos(): ({ uid: string } & Omit<PageInfo<any>, "constructor">)[] {
        const result: ({ uid: string } & Omit<PageInfo<any>, "constructor">)[] = [];
        for (const [uid, info] of Object.entries(this._registeredPages)) {
            result.push({
                uid,
                iconHTML: info.iconHTML,
                order: info.order,
                title: info.title
            });
        }
        result.sort((a, b) => {
            let res = 0;
            if (res === 0) {
                // Sort by order
                res = (a.order ?? 0) - (b.order ?? 0);
            }
            if (res === 0) {
                // Sort by title
                res = a.title.localeCompare(b.title);
            }
            if (res === 0) {
                // Sort by uid
                res = a.uid.localeCompare(b.uid);
            }
            return res;
        });
        return result;
    }

    /** Set and display a page */
    public static async setPage<AppTypes extends BaseClientAppTypes, PageName extends keyof AppTypes["pages"]>(
        name: PageName
    ): Promise<AppTypes["pages"][PageName]> {
        // Dispose the current page if it exists
        if (this._currentPage) {
            try {
                await this._currentPage.dispose();
            } catch (err) {
                console.error("Error while disposing the current page", err);
            } finally {
                this._currentPage = null;
            }
        }

        // Retrieve the page constructor
        const pageInfo = this._registeredPages[name as string];
        if (!pageInfo) {
            console.error(`Page ${String(name)} not found`);
            throw new Error(`Page ${String(name)} not found`);
        }

        // Create and initialize the new page
        try {
            const newPage = new pageInfo.constructor();
            this._currentPage = newPage;
            this._currentPageUID = name as string;

            // Refresh the page (if applicable)
            await newPage.refresh();

            // Fire the pageChanged event
            EventHandlerImpl.fire<DagdaEvents, "pageChanged">(this._eventHandlerData, "pageChanged", {
                page: newPage
            });

            return newPage as AppTypes["pages"][PageName];
        } catch (err) {
            console.error("Error while setting the page", err);
            this._currentPage = null;
            throw err;
        }
    }

    /** Refresh the current page (if any) */
    public static refreshPage(): Promise<void> {
        if (this._currentPage) {
            return this._currentPage.refresh();
        } else {
            return Promise.resolve();
        }
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

    //#region Error handling

    /** Handle an error */
    public static handleError(err: unknown): void {
        console.error("Error", err);
    }

}
