import { ActionsCollection } from "@dagda/shared/src/actions/types";
import { DagdaActions } from "@dagda/shared/src/auth/actions";
import { Dagda } from "@dagda/shared/src/dagda";
import { EntitiesHandler } from "@dagda/shared/src/entities/handler";
import { EntitiesService } from "@dagda/shared/src/entities/service";
import { actionCall } from "../actions";

/** Every action reachable from `dagda.actions`: the framework's own, plus the application's */
type AllActions<Actions extends ActionsCollection> = DagdaActions & Actions;

/**
 * What `window.dagda` exposes (Dagda FEATURES §11.2).
 *
 * The precedent was `window.MQTT` in MQTTToolbox v1, one application's ad-hoc
 * escape hatch; this is the framework's own, so every application gets one
 * for free and the shape stays consistent across them.
 */
export interface ConsoleGlobal<Actions extends ActionsCollection> {
    /** Any registered service, by name — the same registry components read from */
    get<T = unknown>(name: string): T;
    /**
     * The entities handler: `fetch(context)`, `getItems(table)`, `getById(…)`,
     * `withTransaction(tr => …)` — everything a component already does, now
     * reachable by hand for a one-off console query.
     */
    readonly entities: EntitiesHandler<any, any>;
    /**
     * The curated action vocabulary (§11.1) — the same calls the UI makes,
     * nothing more. `dagda.actions.publishMessage({ topic, payload })`.
     *
     * Always includes the framework's own actions (account management, §11.4)
     * on top of whatever the application declared — accounts are Dagda's
     * territory, not something every application redeclares.
     */
    readonly actions: { [Name in keyof AllActions<Actions>]: AllActions<Actions>[Name] };
}

/**
 * Installs `window.dagda`.
 *
 * ⚠️ Hiding a button is not access control (§11.2): every action reachable
 * here is reachable from any authenticated browser's console, exactly as it
 * was from a click. The permission check that matters is the server's, on the
 * action itself — this global does not widen what was already true.
 */
export function installConsoleGlobal<Actions extends ActionsCollection>(): void {
    const actions = new Proxy({}, {
        get: (_target, prop: string | symbol) => {
            if (typeof prop !== "string") {
                return undefined;
            }
            return (...args: unknown[]) => actionCall(prop as any, ...args as any);
        }
    }) as { [Name in keyof AllActions<Actions>]: AllActions<Actions>[Name] };

    const console: ConsoleGlobal<Actions> = {
        get: <T = unknown>(name: string): T => Dagda.get(name as any),
        get entities(): EntitiesHandler<any, any> {
            return Dagda.get<EntitiesService<any, any>>("entities").getHandler();
        },
        actions
    };
    (globalThis as any).dagda = console;
}
