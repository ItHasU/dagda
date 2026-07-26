/**
 * A collection of actions (Dagda FEATURES §11.1).
 *
 * Same shape as `APICollection` (§5) deliberately — an action *is* a server
 * call — but declared as its own type so an application's action vocabulary
 * stays a type distinct from its internal APIs (`fetch`, `submit`, …). That
 * separation is what lets the console global (§11.2) expose `dagda.actions`
 * without also exposing the framework's own plumbing.
 *
 * Two kinds of action exist, both reached through this collection:
 * - a **process triggered on the server** (e.g. "publish an MQTT message"):
 *   registered with `actionRegister`, called with `actionCall` — this is what
 *   this collection types. The handler is free to open its own transaction
 *   (`AbstractSQLRunner.withTransaction`) if it needs to record something.
 * - a **direct entity change**: composed client-side against the existing
 *   optimistic transaction (`EntitiesHandler.withTransaction`) — not routed
 *   through this collection, since it never leaves the browser as its own
 *   call.
 */
export interface ActionsCollection {
    [name: string]: (...args: any[]) => unknown;
}
