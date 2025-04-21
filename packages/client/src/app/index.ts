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

export interface BaseClientAppTypes extends BaseAppTypes {
}

export type DagdaEvents = {
    userInfoChanged: {
        /** The user display name */
        displayName: string;
        /** The user photo URL */
        photoURL?: string;
    };
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
