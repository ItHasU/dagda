import { AuthEvents } from "../auth/events";
import { ContextEvents } from "../entities/events";

/** Web socket related events */
export type SocketEvents = {
    /** Only triggered on the client side */
    connected: boolean;
}


/** Framework events that do not depend on what the application declares */
export type DagdaEvents = SocketEvents & AuthEvents;

/**
 * Every framework event, including the ones carrying application types.
 *
 * `contextChanged` is emitted and consumed by the entities handler itself, but
 * it cannot live in `DagdaEvents`: what it carries is the application's own
 * context type. An application that declares its events as `DagdaEvents & …`
 * therefore cannot broadcast it — which is what server-side ingestion has to do
 * to tell the clients that a context went stale.
 *
 * Use this instead:
 * ```ts
 * export type AppNotifications = DagdaAppEvents<AppContexts> & AppEvents;
 * ```
 */
export type DagdaAppEvents<Contexts> = DagdaEvents & ContextEvents<Contexts>;
