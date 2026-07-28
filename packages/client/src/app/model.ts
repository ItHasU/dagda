import { SQLTransaction } from "@dagda/shared/src/sql/transaction";
import { dagda } from "./dagda";

/**
 * A named, client-side function that acts on the data model (Dagda FEATURES
 * §11.2) — reading from the entities cache (raw, or a value computed from
 * it) or modifying it, through a transaction. Distinct from
 * `ActionsCollection` (`@dagda/shared/src/actions/types`), which is a
 * process triggered on the server: this kind never leaves the browser as
 * its own network call — it is exactly what application code would
 * otherwise write inline as `handler.withTransaction(tr => tr.insert(...))`,
 * just registered under a name so it is reachable, typed, as
 * `dagda.model.xxx(...)`.
 *
 * Manipulating entities is synchronous throughout (FEATURES §3): reading
 * the cache, and applying a change through a transaction, both happen
 * immediately — `encapsulate`/`withTransaction` only *look* asynchronous
 * because they return a promise for when the server has actually confirmed
 * the write (`waitForSubmit`), not because the local change itself waits on
 * anything. Fetching is always separate from acting on the model: a model
 * function never fetches on its own, the same way a page's `_refresh()`
 * decides on its own when to fetch.
 *
 * A bare function is sugar for "no description" — most of these are small
 * enough that requiring `{description, fn}` on every one would be pure
 * ceremony; `dagda.help()` prints "no description" for that shape.
 */
export interface ModelFunctionDeclaration<Tr = any> {
    description?: string;
    fn: (tr: Tr, ...args: any[]) => unknown;
}

export type ModelCollection<Tr = any> = Record<string, ModelFunctionDeclaration<Tr> | ModelFunctionDeclaration<Tr>["fn"]>;

/** Normalizes a collection entry to its `{description, fn}` shape, whichever form the app declared it in */
export function normalizeModelFunction<Tr>(entry: ModelFunctionDeclaration<Tr> | ModelFunctionDeclaration<Tr>["fn"]): ModelFunctionDeclaration<Tr> {
    return typeof entry === "function" ? { fn: entry } : entry;
}

/**
 * Opens a transaction, runs `fn(tr)`, submits it, and waits for the result —
 * the `withTransaction()` + `waitForSubmit()` boilerplate every component
 * already repeats, reachable by hand for a one-off console query or as the
 * mechanism `dagda.model.xxx(...)` uses internally when called without an
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
 * Builds `dagda.model`: a typed, enumerable proxy over the application's
 * declared model functions (§11.2). Genuinely enumerable
 * (`Object.keys(dagda.model)`, tab completion in the browser console) via
 * `ownKeys`/`has`/`getOwnPropertyDescriptor`, backed by the declaration map,
 * not an empty proxy target.
 *
 * Call with an explicit transaction as the first argument to compose into a
 * larger one (`dagda.model.xxx(tr, ...)`), or without one to have it open,
 * submit and await its own (`dagda.model.xxx(...)` — sugar for
 * `encapsulate(tr => dagda.model.xxx(tr, ...))`).
 */
export function buildModelProxy<Model extends ModelCollection>(model: Model): { [Name in keyof Model]: (...args: unknown[]) => Promise<unknown> } {
    const declarations = new Map<string, ModelFunctionDeclaration>(
        Object.entries(model).map(([name, entry]) => [name, normalizeModelFunction(entry)])
    );
    return new Proxy({}, {
        get: (_target, prop: string | symbol) => {
            if (typeof prop !== "string") {
                return undefined;
            }
            return async (...args: unknown[]) => {
                const declaration = declarations.get(prop);
                if (declaration == null) {
                    throw new Error(`Unknown model function: "${prop}" — not declared in DagdaClient.start({model}) (check dagda.help())`);
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
