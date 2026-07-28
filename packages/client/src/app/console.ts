import { ActionsCollection } from "@dagda/shared/src/actions/types";
import { DagdaActions } from "@dagda/shared/src/auth/actions";
import { ManifestOrigin } from "@dagda/shared/src/api/types";
import { SystemInfoRoute } from "@dagda/shared/src/api/impl/system.api";
import { EntitiesHandler } from "@dagda/shared/src/entities/handler";
import { SQLTransaction } from "@dagda/shared/src/sql/transaction";
import { apiCall } from "../api";
import { actionCall } from "../actions";
import { EntityActionDeclaration, EntityActionsCollection, normalizeEntityAction } from "./entity-actions";
import { dagda } from "./dagda";

/**
 * Opens a transaction, runs `fn(tr)`, submits it, and waits for the result —
 * the `withTransaction()` + `waitForSubmit()` boilerplate every component
 * already repeats, reachable by hand for a one-off console query or as the
 * mechanism `dagda.actions.xxx(...)` uses internally when called without an
 * explicit transaction.
 */
export async function encapsulate<T>(fn: (tr: SQLTransaction<any, any>) => T | Promise<T>): Promise<T> {
    const handler = dagda.entities.getHandler();
    let result!: T;
    await handler.withTransaction(async (tr) => {
        result = await fn(tr);
    });
    await handler.waitForSubmit();
    return result;
}

/**
 * What `installConsoleGlobal` adds to the running `dagda` instance so it
 * becomes `window.dagda` (Dagda FEATURES §11.2, §5 refactor).
 *
 * The precedent was `window.MQTT` in MQTTToolbox v1, one application's ad-hoc
 * escape hatch; this is the framework's own, so every application gets one
 * for free and the shape stays consistent across them.
 */
export interface ConsoleExtras<Actions extends ActionsCollection, EntityActions extends EntityActionsCollection = EntityActionsCollection> {
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
    /**
     * Named client-side functions that compose entity changes — declared by
     * the application via `DagdaClient.start({actions: {...}})`. Call with
     * an explicit transaction as the first argument to compose it into a
     * larger one (`dagda.actions.xxx(tr, ...)`), or without one to have it
     * open, submit and await its own (`dagda.actions.xxx(...)` — sugar for
     * `dagda.encapsulate(tr => dagda.actions.xxx(tr, ...))`).
     */
    readonly actions: { [Name in keyof EntityActions]: (...args: unknown[]) => Promise<unknown> };
    /** @see encapsulate */
    encapsulate<T>(fn: (tr: SQLTransaction<any, any>) => T | Promise<T>): Promise<T>;
    /** Prints every registered route and action, with whatever description its developer supplied at registration */
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

function buildActionsProxy<EntityActions extends EntityActionsCollection>(
    entityActions: EntityActions
): Record<string, (...args: unknown[]) => Promise<unknown>> {
    const declarations = new Map<string, EntityActionDeclaration>(
        Object.entries(entityActions).map(([name, entry]) => [name, normalizeEntityAction(entry)])
    );
    return new Proxy({}, {
        get: (_target, prop: string | symbol) => {
            if (typeof prop !== "string") {
                return undefined;
            }
            return async (...args: unknown[]) => {
                const declaration = declarations.get(prop);
                if (declaration == null) {
                    throw new Error(`Unknown action: "${prop}" — not declared in DagdaClient.start({actions}) (check dagda.help())`);
                }
                const [maybeTr, ...rest] = args;
                // A real transaction as the first argument means this call is
                // composing into a larger one (or was itself invoked from
                // inside `encapsulate`) — pass it straight through rather
                // than opening a second one. `instanceof` rather than duck
                // typing: the only object shaped like this in practice is a
                // real transaction, and a false positive would silently
                // corrupt an unrelated call's first argument.
                if (maybeTr instanceof SQLTransaction) {
                    return declaration.fn(maybeTr, ...rest);
                }
                return encapsulate((tr) => declaration.fn(tr, ...args));
            };
        },
        ownKeys: () => [...declarations.keys()],
        has: (_target, prop) => typeof prop === "string" && declarations.has(prop),
        getOwnPropertyDescriptor: (_target, prop) => {
            if (typeof prop !== "string" || !declarations.has(prop)) {
                return undefined;
            }
            return { enumerable: true, configurable: true };
        }
    }) as any;
}

function printHelp(getRoutes: () => SystemInfoRoute[], entityActions: EntityActionsCollection): void {
    for (const [label, origin] of [["dagda.system", "system"], ["dagda.api", "app"]] as const) {
        console.group(label);
        for (const route of getRoutes().filter((r) => r.origin === origin)) {
            const permission = route.permission != null ? ` (requires "${route.permission}")` : "";
            const external = route.type !== "internal" ? ` [${route.type}]` : "";
            console.log(`${route.name}${permission}${external} — ${route.description ?? "no description"}`);
        }
        console.groupEnd();
    }
    console.group("dagda.actions");
    for (const [name, entry] of Object.entries(entityActions)) {
        const declaration = normalizeEntityAction(entry);
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
            "  dagda.actions.xxx(tr?, ...)              run a named entity-transaction composer (auto-submits without an explicit tr)",
            "  dagda.encapsulate(async (tr) => {...})   open + submit an ad-hoc transaction",
            "  dagda.entitiesHandler                    the entities handler (fetch/getItems/withTransaction/...)",
            "  dagda.help()                             list every registered route and action"
        ].join("\n")
    );
}

export interface InstallConsoleGlobalOptions<EntityActions extends EntityActionsCollection> {
    /** Read fresh each time — the manifest arrives asynchronously after this function runs (`DagdaClient.refreshSystemInfo()`) */
    getRoutes: () => SystemInfoRoute[];
    /** Named entity-transaction composers declared via `DagdaClient.start({actions})` */
    entityActions?: EntityActions;
}

/**
 * Installs `window.dagda`: the same instance every service is already
 * reached through internally, with a few curated extras (`system`, `api`,
 * `actions`, `encapsulate`, `help`) added on top — so `window.dagda.pages`,
 * `window.dagda.entities`, ... work exactly like `dagda.pages` in framework
 * code, and a future user script (FEATURES §11.3) reuses this global as-is.
 *
 * ⚠️ Hiding a button is not access control (§11.2): every route/action
 * reachable here is reachable from any authenticated browser's console,
 * exactly as it was from a click. The permission check that matters is the
 * server's, on the route/action itself — this global does not widen what was
 * already true.
 */
export function installConsoleGlobal<Actions extends ActionsCollection, EntityActions extends EntityActionsCollection = {}>(
    options: InstallConsoleGlobalOptions<EntityActions>
): void {
    const entityActions = options.entityActions ?? ({} as EntityActions);
    const system = buildManifestProxy(options.getRoutes, "system") as unknown as DagdaActions;
    const api = buildManifestProxy(options.getRoutes, "app") as unknown as Actions;
    const actions = buildActionsProxy(entityActions) as { [Name in keyof EntityActions]: (...args: unknown[]) => Promise<unknown> };

    Object.assign(dagda, {
        system,
        api,
        actions,
        encapsulate,
        help: () => printHelp(options.getRoutes, entityActions)
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
