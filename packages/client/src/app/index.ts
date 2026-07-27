// First import, deliberately: applies the remembered theme before anything
// else runs, including the stylesheet import below (ROADMAP tranche 4 — see
// the file for why the ordering, not an inline <script>, is what makes this
// flash-free).
import "../themes/boot";
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
import { DagdaActions } from "@dagda/shared/src/auth/actions";
import { apiCall } from "../api";
import { actionCall } from "../actions";
// Defines `<dagda-app>` and, through it, every element of the shell. Importing
// it here is what lets an application's `index.html` hold nothing but that one
// tag (`specs/navigation.md` §6.1).
import "../components/app/app.component";
import { AbstractWebComponent } from "../components/abstract.webcomponent";
import { AuthServiceImpl } from "../auth/auth.service";
import { UsersDirectory } from "../auth/directory";
import { ClientNotificationImpl } from "../notification/notification.impl";
import { PreferencesDirectory } from "../preferences/directory";
import { BasePageTypes, PageHandler, PageInfo } from "../pages/handler";
import { buildDefaultPages, DefaultPageTypes } from "../pages/defaults";
import { SectionInfo } from "../pages/menu";
import { Router } from "../pages/router";
import { DAGDA_THEMES, ThemeInfo, ThemeRegistry } from "../themes/service";
import { SettingsModel } from "@dagda/shared/src/settings/model";
import { BrandInfo } from "./brand";
import { installConsoleGlobal } from "./console";
import { EntityActionsCollection } from "./entity-actions";
import { SQLTransaction } from "@dagda/shared/src/sql/transaction";
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
    /**
     * The pages of the application, the only thing the framework cannot know
     * — plus, optionally, an override for one of the framework's own default
     * pages (`preferences`/`users`/`roles`/`settings`, see
     * `pages/defaults.ts`): they are registered automatically, an entry here
     * under the same key replaces the default rather than erroring, the same
     * relationship `themes` already has with `DAGDA_THEMES`.
     */
    pages:
        { [Name in keyof PageTypes]: PageInfo<PageTypes[Name]> }
        & Partial<{ [Name in keyof DefaultPageTypes]: PageInfo<DefaultPageTypes[Name]> }>;
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
    /**
     * Themes the shell may switch to (ROADMAP tranche 4), replacing the
     * framework's own `DAGDA_THEMES` — "la liste déclarée dans le code
     * (celle du framework, sur-définie par l'application si besoin)". Every
     * id here must have a matching `[data-theme="…"]` block in `themes.css`
     * (an application extending the file, not just this list).
     */
    themes?: ThemeInfo[];
    /**
     * The preference key the theme choice is stored under, declared by the
     * application's own `PreferencesModel` (FEATURES §11.6) — Dagda cannot
     * hardcode one that does not exist until the app declares it. Absent,
     * `Dagda.get<ThemeService>("themes")` still switches the theme and
     * remembers it locally, it just never round-trips to the server.
     */
    themePreferenceKey?: string;
    /**
     * The application's declared system settings (Dagda FEATURES §11.5),
     * consumed by the framework's `SettingsPage` (`Dagda.get<SettingsService>
     * ("settingsModel")`) — optional since not every application registers
     * that page. Same "app supplies a config value the framework's own page
     * reads" shape as `themePreferenceKey` above.
     */
    settings?: SettingsModel<any>;
    /**
     * Named client-side entity-transaction composers (Dagda FEATURES §11.2),
     * reachable from the console as `dagda.actions.xxx(...)` — a distinct
     * concept from the RPC processes exposed on `dagda.routes` (see
     * `EntityActionsCollection`'s own doc comment for the difference).
     */
    actions?: EntityActionsCollection<SQLTransaction<AppTypes["entities"], AppTypes["contexts"]>>;
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
        const pageHandler = new PageHandler<PageTypes & DefaultPageTypes>();
        // Defaults first, the application's own `pages` spread on top: an
        // app that declares its own `preferences`/`users`/`roles`/`settings`
        // entry overrides the default for that key instead of colliding
        // with it (`Object.entries` on the merged object only ever sees one
        // winner per key, same override relationship `themes` already has
        // with `DAGDA_THEMES`).
        const allPages = { ...buildDefaultPages(params.settings), ...params.pages };
        for (const [name, info] of Object.entries(allPages)) {
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

        // Deep-linkable pages (ROADMAP tranche 4): built here so it can
        // subscribe to pageHandler's events immediately, started below once
        // every page is registered and the account is known (canAccess must
        // already answer correctly, or a deep link to a page the account
        // cannot see would silently open it before the permission is loaded).
        const router = new Router<PageTypes & DefaultPageTypes>(pageHandler);

        // The user directory (ROADMAP tranche 3): built here so it is
        // reachable via Dagda.get("users") from the first render, loaded
        // below once the shell's own bootstrap calls are underway.
        const users = new UsersDirectory(() => actionCall<DagdaActions, "listUserNames">("listUserNames"));

        // The auth service (ROADMAP tranche 3): reachable via Dagda.get("auth")
        // from the first render, same placement as `users` above. It is a thin
        // accessor over `DagdaClient` itself (see auth.service.ts) — no load()
        // step, since there is nothing here that isn't already read by
        // refreshSystemInfo() below.
        const auth = new AuthServiceImpl();

        // The preferences (ROADMAP tranche 3, FEATURES §11.6): reachable via
        // Dagda.get("preferences") from the first render, same placement as
        // `users`/`auth` above, loaded below alongside them.
        const preferences = new PreferencesDirectory(
            () => actionCall<DagdaActions, "getPreferences">("getPreferences"),
            (key, value) => actionCall<DagdaActions, "setPreference">("setPreference", { key, value })
        );

        // Themes (ROADMAP tranche 4): built here, after `preferences` exists
        // (it reads/writes through it) and before Dagda.init() registers it.
        // `reconcile()` runs later, once preferences.load() has resolved.
        const themes = new ThemeRegistry(params.themes ?? DAGDA_THEMES, preferences, params.themePreferenceKey);

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
            router,
            users,
            auth,
            preferences,
            themes,
            brand: params.brand ?? { label: params.title ?? "Dagda" },
            ...(params.settings != null ? { settingsModel: params.settings } : {}),
            ...(params.services ?? {})
        });

        // -- Console global (FEATURES §11.2) --
        // getRoutes reads the manifest lazily: it only arrives once
        // refreshSystemInfo() resolves below, after this call returns.
        installConsoleGlobal<AppTypes["actions"], NonNullable<typeof params.actions>>({
            getRoutes: () => this._systemInfo?.routes ?? [],
            entityActions: params.actions
        });

        // -- Inject headers in the app --
        this._injectHeaders(params.title);

        // -- Read the system information and the user directory --
        // Before the shell draws: the menu is filtered by permission, and the
        // permissions are in that answer. Drawing first would flash entries
        // that then disappear. The directory rides along — its own errors are
        // swallowed internally (e.g. no session yet), so this never rejects.
        await Promise.all([
            this.refreshSystemInfo(),
            users.load(),
            preferences.load()
        ]);

        // -- Reconcile the pre-paint theme mirror against the real preference --
        // Only meaningful once preferences.load() above has resolved.
        themes.reconcile();

        // -- Apply the URL, or fall back to the default page --
        // After canAccess/currentUser are answerable (a deep link to a page
        // the account cannot see must not open it first and get corrected
        // later), before the shell draws.
        await router.start();

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
            // notifyLocal(), not broadcast(): this fact is true for this
            // session alone. broadcast() has no per-recipient filtering yet
            // (FEATURES §6) — every other connected browser would receive it,
            // whoever *they* are signed in as, and their own login badge
            // would render this session's identity. `user` is never null
            // here: the route refuses an anonymous call, so a resolved
            // SystemInfo always carries one.
            Dagda.get<NotificationService<AuthEvents>>("notification").notifyLocal("userInfoChanged", this._systemInfo.user);
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
