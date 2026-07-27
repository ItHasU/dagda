import { ActionsCollection } from "@dagda/shared/src/actions/types";
import { DagdaActions } from "@dagda/shared/src/auth/actions";
import { Dagda } from "@dagda/shared/src/dagda";
import { SystemInfoRoute } from "@dagda/shared/src/api/impl/system.api";
import { EntitiesHandler } from "@dagda/shared/src/entities/handler";
import { EntitiesService } from "@dagda/shared/src/entities/service";
import { SQLTransaction } from "@dagda/shared/src/sql/transaction";
import { apiCall } from "../api";
import { actionCall } from "../actions";
import { EntityActionDeclaration, EntityActionsCollection, normalizeEntityAction } from "./entity-actions";

/** Every action reachable from `dagda.routes`: the framework's own, plus the application's */
type AllActions<Actions extends ActionsCollection> = DagdaActions & Actions;

/**
 * Opens a transaction, runs `fn(tr)`, submits it, and waits for the result —
 * the `withTransaction()` + `waitForSubmit()` boilerplate every component
 * already repeats, reachable by hand for a one-off console query or as the
 * mechanism `dagda.actions.xxx(...)` uses internally when called without an
 * explicit transaction.
 */
export async function encapsulate<T>(fn: (tr: SQLTransaction<any, any>) => T | Promise<T>): Promise<T> {
    const handler = Dagda.get<EntitiesService<any, any>>("entities").getHandler();
    let result!: T;
    await handler.withTransaction(async (tr) => {
        result = await fn(tr);
    });
    await handler.waitForSubmit();
    return result;
}

/**
 * What `window.dagda` exposes (Dagda FEATURES §11.2).
 *
 * The precedent was `window.MQTT` in MQTTToolbox v1, one application's ad-hoc
 * escape hatch; this is the framework's own, so every application gets one
 * for free and the shape stays consistent across them.
 */
export interface ConsoleGlobal<Actions extends ActionsCollection, EntityActions extends EntityActionsCollection = EntityActionsCollection> {
    /** Any registered service, by name — the same registry components read from */
    get<T = unknown>(name: string): T;
    /**
     * The entities handler: `fetch(context)`, `getItems(table)`, `getById(…)`,
     * `withTransaction(tr => …)` — everything a component already does, now
     * reachable by hand for a one-off console query.
     */
    readonly entities: EntitiesHandler<any, any>;
    /**
     * Every route/action registered on the server (§11.1) — the same calls
     * the UI makes, nothing more. `dagda.routes.publishMessage({ topic,
     * payload })`. Genuinely enumerable (`Object.keys(dagda.routes)`, tab
     * completion): backed by the manifest the server sends at boot, not an
     * empty proxy target.
     *
     * Always includes the framework's own actions (account management,
     * §11.4) on top of whatever the application declared — accounts are
     * Dagda's territory, not something every application redeclares.
     */
    readonly routes: { [Name in keyof AllActions<Actions>]: AllActions<Actions>[Name] };
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

function buildRoutesProxy(getRoutes: () => SystemInfoRoute[]): Record<string, (...args: unknown[]) => Promise<unknown>> {
    const findEntry = (name: string): SystemInfoRoute | undefined => getRoutes().find((route) => route.name === name);
    return new Proxy({}, {
        get: (_target, prop: string | symbol) => {
            if (typeof prop !== "string") {
                return undefined;
            }
            return async (...args: unknown[]) => {
                const entry = findEntry(prop);
                if (entry == null) {
                    throw new Error(`Unknown route: "${prop}" — not registered on the server (check dagda.help())`);
                }
                return entry.kind === "route"
                    ? apiCall(prop as any, {}, ...args as any)
                    : actionCall(prop as any, ...args as any);
            };
        },
        ownKeys: () => getRoutes().map((route) => route.name),
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
    console.group("dagda.routes");
    for (const route of getRoutes()) {
        const permission = route.permission != null ? ` (requires "${route.permission}")` : "";
        console.log(`${route.name}${permission} — ${route.description ?? "no description"}`);
    }
    console.groupEnd();
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
            "  dagda.routes.xxx(...)                  call a registered server route/action",
            "  dagda.actions.xxx(tr?, ...)             run a named entity-transaction composer (auto-submits without an explicit tr)",
            "  dagda.encapsulate(async (tr) => {...})  open + submit an ad-hoc transaction",
            "  dagda.entities                          the entities handler (fetch/getItems/withTransaction/...)",
            "  dagda.help()                            list every registered route and action"
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
 * Installs `window.dagda`.
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
    const routes = buildRoutesProxy(options.getRoutes) as { [Name in keyof AllActions<Actions>]: AllActions<Actions>[Name] };
    const actions = buildActionsProxy(entityActions) as { [Name in keyof EntityActions]: (...args: unknown[]) => Promise<unknown> };

    const dagdaConsole: ConsoleGlobal<Actions, EntityActions> = {
        get: <T = unknown>(name: string): T => Dagda.get(name as any),
        get entities(): EntitiesHandler<any, any> {
            return Dagda.get<EntitiesService<any, any>>("entities").getHandler();
        },
        routes,
        actions,
        encapsulate,
        help: () => printHelp(options.getRoutes, entityActions)
    };
    (globalThis as any).dagda = dagdaConsole;
    printWelcomeMessage();
}
