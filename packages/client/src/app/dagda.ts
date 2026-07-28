import { BaseAppTypes } from "@dagda/shared/src/app/types";
import { BaseServicesParams, Dagda } from "@dagda/shared/src/dagda";
import { AuthServiceImpl } from "../auth/auth.service";
import { UsersDirectory } from "../auth/directory";
import { BasePageTypes, PageHandler } from "../pages/handler";
import { Router } from "../pages/router";
import { PreferencesDirectory } from "../preferences/directory";
import { ThemeRegistry } from "../themes/service";
import { SettingsModel } from "@dagda/shared/src/settings/model";
import { BrandInfo } from "./brand";
import { buildModelProxy, ModelCollection } from "./model";

/**
 * What every Dagda client application declares, on top of `BaseAppTypes`
 * (FEATURES §0) — the vocabulary of pages joins the rest of the application's
 * contract instead of staying a separate generic parameter.
 */
export interface ClientAppTypes extends BaseAppTypes {
    pages: BasePageTypes;
    /** Named functions acting on the data model (FEATURES §11.2), reachable typed as `dagda.model.xxx(...)` — empty for an application that declares none. */
    model: ModelCollection;
}

/** Parameters needed to build the client's own base services, on top of the shared ones */
export interface ClientOwnServicesParams<AppTypes extends ClientAppTypes> {
    pages: PageHandler<AppTypes["pages"]>;
    router: Router<AppTypes["pages"]>;
    users: UsersDirectory;
    auth: AuthServiceImpl;
    preferences: PreferencesDirectory;
    themes: ThemeRegistry;
    brand: BrandInfo;
    /**
     * The application's declared system settings (FEATURES §11.5), read by
     * the framework's own `SettingsPage` — optional since not every
     * application registers that page (`pages/defaults.ts`).
     */
    settingsModel?: SettingsModel<any>;
    /**
     * Named functions acting on the data model (FEATURES §11.2) — optional,
     * defaults to none declared. Named `modelFunctions` here, not `model`:
     * `model` is already taken, on this very params bag, by the entities
     * model (`BaseServicesParams.model: EntitiesModel<any, any>`) — the
     * public name stays `dagda.model.xxx(...)` (`ClientDagda.model` below),
     * only this constructor parameter needs to be spelled differently.
     */
    modelFunctions?: AppTypes["model"];
}

/**
 * The services every Dagda client application receives: the shared base
 * (`log`/`entities`/`notification`) plus what only makes sense in a browser
 * (`pages`, `router`, the account/preferences/theme directories, `brand`).
 *
 * An application extends this with its own services (FEATURES §0) — see
 * `Dagda`'s own doc comment for the shape.
 */
export class ClientDagda<AppTypes extends ClientAppTypes = ClientAppTypes> extends Dagda<AppTypes> {

    public readonly pages: PageHandler<AppTypes["pages"]>;
    public readonly router: Router<AppTypes["pages"]>;
    public readonly users: UsersDirectory;
    public readonly auth: AuthServiceImpl;
    public readonly preferences: PreferencesDirectory;
    public readonly themes: ThemeRegistry;
    public readonly brand: BrandInfo;
    public readonly settingsModel?: SettingsModel<any>;
    public readonly model: { [Name in keyof AppTypes["model"]]: (...args: unknown[]) => Promise<unknown> };

    constructor(params: BaseServicesParams<AppTypes> & ClientOwnServicesParams<AppTypes>) {
        super(params);
        this.pages = params.pages;
        this.router = params.router;
        this.users = params.users;
        this.auth = params.auth;
        this.preferences = params.preferences;
        this.themes = params.themes;
        this.brand = params.brand;
        this.settingsModel = params.settingsModel;
        this.model = buildModelProxy(params.modelFunctions ?? ({} as AppTypes["model"]));
    }

}

/**
 * The running application's services (FEATURES §0) — the same instance every
 * `ClientDagda`/`Dagda` field is reached through, whichever module imports
 * it. Assigned once, synchronously, by `DagdaClient.start()`.
 */
export let dagda: ClientDagda<ClientAppTypes>;

let _resolveDagdaReady: () => void = () => { };

/**
 * Resolves once `dagda` has been assigned.
 *
 * `<dagda-app>` sits in `index.html` from the first paint and a web component
 * refreshes itself as soon as it is connected to the DOM — before
 * `DagdaClient.start()` has necessarily finished building `dagda`. Anything
 * built before that point (a page, a component) awaits this rather than
 * reading `dagda` straight away.
 */
export const dagdaReady: Promise<void> = new Promise((resolve) => {
    _resolveDagdaReady = resolve;
});

/**
 * @internal set by `DagdaClient.start()` once every parameter is known.
 *
 * The cast is deliberate: `dagda` is exposed here through the framework's own
 * loose `ClientAppTypes`, not the concrete application's — the same instance
 * is also re-typed narrowly at the application's own entry point.
 */
export function _setDagda<AppTypes extends ClientAppTypes>(instance: ClientDagda<AppTypes>): void {
    dagda = instance as unknown as ClientDagda<ClientAppTypes>;
    _resolveDagdaReady();
}
