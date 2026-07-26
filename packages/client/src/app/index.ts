import { EntitiesAPI } from "@dagda/shared/src/api/impl/entities.api";
import { SystemAPI, SystemInfo } from "@dagda/shared/src/api/impl/system.api";
import { BaseAppTypes } from "@dagda/shared/src/app/types";
import { AuthEvents } from "@dagda/shared/src/auth/events";
import { UserInfo } from "@dagda/shared/src/auth/types";
import { Dagda } from "@dagda/shared/src/dagda";
import { NotificationService } from "@dagda/shared/src/notification/service";
import { EntitiesModel } from "@dagda/shared/src/entities/model";
import { ContextAdapter } from "@dagda/shared/src/entities/tools/adapters";
import { buildBaseServices } from "@dagda/shared/src/services";
import Handlebars from "handlebars";
import { apiCall } from "../api";
// Defines `<dagda-app>` and, through it, every element of the shell. Importing
// it here is what lets an application's `index.html` hold nothing but that one
// tag (`specs/navigation.md` §6.1).
import "../components/app/app.component";
import { AbstractWebComponent } from "../components/abstract.webcomponent";
import { ClientNotificationImpl } from "../notification/notification.impl";
import { BasePageTypes, PageHandler, PageInfo } from "../pages/handler";
import { SectionInfo } from "../pages/menu";
import { BrandInfo } from "./brand";
import { installConsoleGlobal } from "./console";
import headerTemplate from "./index.header.html";
// The framework stylesheet, replacing Bootstrap: tokens, faces, vocabulary and
// shell, in that order (FEATURES §8).
import "../styles/index.css";

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
    /**
     * Menu sections the pages hang from, keyed by the name pages refer to.
     *
     * Optional: an application whose pages all stand on their own declares
     * none, and each page becomes an entry of its own.
     */
    sections?: Record<string, SectionInfo>;
    /**
     * How the application names itself in the shell.
     *
     * Here rather than in `index.html` — the decision of
     * `specs/navigation.md` §6.1. It keeps that file down to `<dagda-app>` and
     * makes the brand typed like everything else the application declares.
     */
    brand?: BrandInfo;
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
        pageHandler.registerSections(params.sections ?? {});
        // Deliberately closed rather than open — a menu that offers what the
        // server will refuse is worse than one entry short. Mirrors
        // hasPermission() server-side: super-admin bypasses everything, the
        // resolved permission list decides the rest (FEATURES §7.1). This is
        // a convenience only — the server re-checks on every action and page
        // fetch regardless (§11.2).
        pageHandler.canAccess = (permission) =>
            permission == null
            || (this.currentUser?.isSuperAdmin ?? false)
            || (this.currentUser?.permissions.includes(permission) ?? false);

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
            brand: params.brand ?? { label: params.title ?? "Dagda" },
            ...(params.services ?? {})
        });

        // -- Console global (FEATURES §11.2) --
        installConsoleGlobal<AppTypes["actions"]>();

        // -- Inject headers in the app --
        this._injectHeaders(params.title);

        // -- Read the system information (including the current user) --
        // Before the shell draws: the menu is filtered by permission, and the
        // permissions are in that answer. Drawing first would flash entries
        // that then disappear.
        await this.refreshSystemInfo();

        // -- Draw the shell --
        // The element is in the page from the start, so it may already have
        // rendered against an empty registry; this second pass is the one that
        // has services and an account to work with.
        await document.querySelector<AbstractWebComponent>("dagda-app")?.refresh();
    }

    /** Read the system information from the server and cache it */
    public static async refreshSystemInfo(): Promise<SystemInfo | null> {
        try {
            this._systemInfo = await apiCall<SystemAPI, "getSystemInfo">("getSystemInfo", {});
            // No broadcast here, deliberately. On the client `broadcast()` does
            // not notify anything locally: it writes to the websocket, and the
            // server relays whatever arrives to every other browser. Announcing
            // the current account that way told nobody in this page and told
            // everybody in the others who is signed in here.
            //
            // The account is read from `currentUser` by whoever displays it,
            // and the shell refreshes once this call has answered.
        } catch (err) {
            console.error("Error while reading system information", err);
            this._systemInfo = null;
        }
        return this._systemInfo;
    }

    /** @returns the account this browser is logged in as, once known */
    public static get currentUser(): UserInfo | null {
        return this._systemInfo?.user ?? null;
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
