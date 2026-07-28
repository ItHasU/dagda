import { ActionsCollection } from "@dagda/shared/src/actions/types";
import { DagdaActions } from "@dagda/shared/src/auth/actions";
import { ManifestOrigin } from "@dagda/shared/src/api/types";
import { SystemInfoRoute } from "@dagda/shared/src/api/impl/system.api";
import { EntitiesHandler } from "@dagda/shared/src/entities/handler";
import { SQLTransaction } from "@dagda/shared/src/sql/transaction";
import { apiCall } from "../api";
import { actionCall } from "../actions";
import { encapsulate, ModelCollection, normalizeModelFunction } from "./model";
import { dagda } from "./dagda";

/**
 * What `installConsoleGlobal` adds to the running `dagda` instance so it
 * becomes `window.dagda` (Dagda FEATURES §11.2, §5 refactor).
 *
 * The precedent was `window.MQTT` in MQTTToolbox v1, one application's ad-hoc
 * escape hatch; this is the framework's own, so every application gets one
 * for free and the shape stays consistent across them.
 */
export interface ConsoleExtras<Actions extends ActionsCollection> {
    /**
     * The entities handler: `fetch(context)`, `getItems(table)`, `getById(…)`,
     * `withTransaction(tr => …)` — everything a component already does, now
     * reachable by hand for a one-off console query.
     *
     * A distinct name from `dagda.entities` (the raw registered service every
     * `Dagda` instance already exposes): this is a curated, derived view —
     * `dagda.entities.getHandler()` — not the service itself.
     */
    readonly entitiesHandler: EntitiesHandler<any, any>;
    /**
     * The framework's own routes/actions (§5 refactor) — account management,
     * preferences, settings, `getSystemInfo`, ... — never something an
     * application declares itself. `dagda.system.listUsers()`. Genuinely
     * enumerable (`Object.keys(dagda.system)`, tab completion): backed by the
     * manifest the server sends at boot, not an empty proxy target.
     */
    readonly system: DagdaActions;
    /**
     * The application's own routes/actions, registered via `registerAPI`/
     * `registerAction` server-side (§5 refactor) — the same calls the UI
     * makes, nothing more. `dagda.api.publishMessage({ topic, payload })`.
     * Same enumerability as `dagda.system`.
     */
    readonly api: Actions;
    /** @see encapsulate */
    encapsulate<T>(fn: (tr: SQLTransaction<any, any>) => T | Promise<T>): Promise<T>;
    /** Prints every registered route/action and model function, with whatever description its developer supplied at registration */
    help(): void;
}

/**
 * Builds a proxy over every manifest entry of the given origin — `"system"`
 * for `dagda.system`, `"app"` for `dagda.api` (§5 refactor). Same shape
 * either way: dispatches a `"route"`-kind entry through `apiCall`, an
 * `"action"`-kind one through `actionCall`.
 */
function buildManifestProxy(getRoutes: () => SystemInfoRoute[], origin: ManifestOrigin): Record<string, (...args: unknown[]) => Promise<unknown>> {
    const listEntries = (): SystemInfoRoute[] => getRoutes().filter((route) => route.origin === origin);
    const findEntry = (name: string): SystemInfoRoute | undefined => listEntries().find((route) => route.name === name);
    const label = origin === "system" ? "dagda.system" : "dagda.api";
    return new Proxy({}, {
        get: (_target, prop: string | symbol) => {
            if (typeof prop !== "string") {
                return undefined;
            }
            return async (...args: unknown[]) => {
                const entry = findEntry(prop);
                if (entry == null) {
                    throw new Error(`Unknown ${label} entry: "${prop}" — not registered on the server (check dagda.help())`);
                }
                return entry.kind === "route"
                    ? apiCall(prop as any, {}, ...args as any)
                    : actionCall(prop as any, ...args as any);
            };
        },
        ownKeys: () => listEntries().map((route) => route.name),
        has: (_target, prop) => typeof prop === "string" && findEntry(prop) != null,
        getOwnPropertyDescriptor: (_target, prop) => {
            if (typeof prop !== "string" || findEntry(prop) == null) {
                return undefined;
            }
            return { enumerable: true, configurable: true };
        }
    }) as any;
}

function printHelp(getRoutes: () => SystemInfoRoute[], model: ModelCollection): void {
    for (const [label, origin] of [["dagda.system", "system"], ["dagda.api", "app"]] as const) {
        console.group(label);
        for (const route of getRoutes().filter((r) => r.origin === origin)) {
            const permission = route.permission != null ? ` (requires "${route.permission}")` : "";
            const external = route.type !== "internal" ? ` [${route.type}]` : "";
            console.log(`${route.name}${permission}${external} — ${route.description ?? "no description"}`);
        }
        console.groupEnd();
    }
    console.group("dagda.model");
    for (const [name, entry] of Object.entries(model)) {
        const declaration = normalizeModelFunction(entry);
        console.log(`${name} — ${declaration.description ?? "no description"}`);
    }
    console.groupEnd();
}

let _welcomePrinted = false;

function printWelcomeMessage(): void {
    if (_welcomePrinted) {
        return;
    }
    _welcomePrinted = true;
    console.log(
        [
            "window.dagda is ready:",
            "  dagda.<service>                         any registered service, e.g. dagda.pages, dagda.entities",
            "  dagda.system.xxx(...)                    call one of the framework's own routes/actions",
            "  dagda.api.xxx(...)                       call one of this application's own routes/actions",
            "  dagda.model.xxx(tr?, ...)                run a named model function (auto-submits without an explicit tr)",
            "  dagda.encapsulate(async (tr) => {...})   open + submit an ad-hoc transaction",
            "  dagda.entitiesHandler                    the entities handler (fetch/getItems/withTransaction/...)",
            "  dagda.help()                             list every registered route, action and model function"
        ].join("\n")
    );
}

export interface InstallConsoleGlobalOptions {
    /** Read fresh each time — the manifest arrives asynchronously after this function runs (`DagdaClient.refreshSystemInfo()`) */
    getRoutes: () => SystemInfoRoute[];
    /** The application's declared model functions (`DagdaClient.start({model})`), only needed here for `dagda.help()` — `dagda.model` itself is already a real field of the running `dagda` instance. */
    model?: ModelCollection;
}

/**
 * Installs `window.dagda`: the same instance every service is already
 * reached through internally, with a few curated extras (`system`, `api`,
 * `encapsulate`, `help`) added on top — so `window.dagda.pages`,
 * `window.dagda.entities`, `window.dagda.model`, ... work exactly like
 * `dagda.pages`/`dagda.model` in framework code, and a future user script
 * (FEATURES §11.3) reuses this global as-is.
 *
 * ⚠️ Hiding a button is not access control (§11.2): every route/action
 * reachable here is reachable from any authenticated browser's console,
 * exactly as it was from a click. The permission check that matters is the
 * server's, on the route/action itself — this global does not widen what was
 * already true.
 */
export function installConsoleGlobal<Actions extends ActionsCollection>(
    options: InstallConsoleGlobalOptions
): void {
    const model = options.model ?? {};
    const system = buildManifestProxy(options.getRoutes, "system") as unknown as DagdaActions;
    const api = buildManifestProxy(options.getRoutes, "app") as unknown as Actions;

    Object.assign(dagda, {
        system,
        api,
        encapsulate,
        help: () => printHelp(options.getRoutes, model)
    });
    // A live getter, not a value: Object.assign would otherwise capture
    // whatever getHandler() returns once, at install time.
    Object.defineProperty(dagda, "entitiesHandler", {
        get: (): EntitiesHandler<any, any> => dagda.entities.getHandler(),
        enumerable: true,
        configurable: true
    });
    (globalThis as any).dagda = dagda;
    printWelcomeMessage();
}
