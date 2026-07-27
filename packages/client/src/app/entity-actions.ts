/**
 * A named, client-side function that composes entity changes against a
 * transaction (Dagda FEATURES §11.2) — distinct from `ActionsCollection`
 * (`@dagda/shared/src/actions/types`), which is a process triggered on the
 * server. This kind never leaves the browser as its own network call: it is
 * exactly what application code would otherwise write inline as
 * `handler.withTransaction(tr => tr.insert(...))`, just registered under a
 * name so it is reachable from `dagda.actions.xxx(...)` too.
 *
 * A bare function is sugar for "no description" — most of these are small
 * enough that requiring `{description, fn}` on every one would be pure
 * ceremony; `dagda.help()` prints "no description" for that shape.
 */
export interface EntityActionDeclaration<Tr = any> {
    description?: string;
    fn: (tr: Tr, ...args: any[]) => unknown;
}

export type EntityActionsCollection<Tr = any> = Record<string, EntityActionDeclaration<Tr> | EntityActionDeclaration<Tr>["fn"]>;

/** Normalizes a collection entry to its `{description, fn}` shape, whichever form the app declared it in */
export function normalizeEntityAction<Tr>(entry: EntityActionDeclaration<Tr> | EntityActionDeclaration<Tr>["fn"]): EntityActionDeclaration<Tr> {
    return typeof entry === "function" ? { fn: entry } : entry;
}
