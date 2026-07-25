import { Dagda } from "./dagda";
import { EntitiesHandler } from "./entities/handler";
import { EntitiesModel } from "./entities/model";
import { EntitiesService } from "./entities/service";
import { ContextAdapter, PersistenceAdapter } from "./entities/tools/adapters";
import { EntitiesTypes } from "./entities/types";
import { NotificationService } from "./notification/service";
import { buildConsoleLogService, LogService } from "./tools/log";

/**
 * The services every Dagda application receives, whichever side it runs on.
 *
 * An application never builds them: the framework does, on both sides
 * (FEATURES §0, "les services de base sont autonomes"). What differs between
 * the client and the server is only how data is persisted and how
 * notifications travel, which is why both are parameters here.
 */
export interface DagdaBaseServices<
    Entities extends EntitiesTypes,
    Contexts,
    Notifications extends Record<string, unknown>
> extends
    LogService,
    EntitiesService<Entities, Contexts>,
    NotificationService<Notifications> {
}

/** Parameters needed to build the base services */
export interface BaseServicesParams<
    Entities extends EntitiesTypes,
    Contexts,
    Notifications extends Record<string, unknown>
> {
    /** The application entities model */
    model: EntitiesModel<any, any>;
    /** How two contexts compare */
    contextAdapter: ContextAdapter<Contexts>;
    /** Where the data comes from and goes to: an API call on the client, SQL on the server */
    persistence: PersistenceAdapter<Entities, Contexts>;
    /** The transport of the notifications: a websocket client or a websocket server */
    notification: NotificationService<Notifications>["notification"];
    /**
     * Build a new handler on every call instead of sharing one.
     * The server needs it: two requests must never share a cache, since the
     * cache is scoped to what one user is allowed to see.
     */
    handlerPerCall?: boolean;
    /** Replaces the default console logger */
    log?: LogService["log"];
}

/**
 * Build the entities service around a handler.
 *
 * The handler itself is side-independent — it is the whole point of the shared
 * package — so only the persistence adapter tells the client and the server apart.
 */
export function buildEntitiesService<Entities extends EntitiesTypes, Contexts>(
    model: EntitiesModel<any, any>,
    contextAdapter: ContextAdapter<Contexts>,
    persistence: PersistenceAdapter<Entities, Contexts>,
    options?: { handlerPerCall?: boolean }
): EntitiesService<Entities, Contexts>["entities"] {
    const build = (): EntitiesHandler<Entities, Contexts> =>
        new EntitiesHandler<Entities, Contexts>(model, contextAdapter, persistence);

    if (options?.handlerPerCall) {
        return { getHandler: build };
    }
    // One handler for the whole session: its synchronous cache is what the
    // components read while rendering.
    const handler = build();
    return { getHandler: () => handler };
}

/**
 * Build the base services, without registering them.
 *
 * Deliberately not calling Dagda.init(): registering resolves `Dagda.loaded`,
 * and every component waits on it. Registering in two steps would let a
 * component run between the two and find a service missing. The caller merges
 * its own services with these and registers everything in one call.
 */
export function buildBaseServices<
    Entities extends EntitiesTypes,
    Contexts,
    Notifications extends Record<string, unknown>
>(params: BaseServicesParams<Entities, Contexts, Notifications>): DagdaBaseServices<Entities, Contexts, Notifications> {
    return {
        log: params.log ?? buildConsoleLogService(),
        entities: buildEntitiesService<Entities, Contexts>(
            params.model,
            params.contextAdapter,
            params.persistence,
            { handlerPerCall: params.handlerPerCall }
        ),
        notification: params.notification
    };
}

/**
 * Build and register the base services, plus whatever the caller adds.
 *
 * Everything lands in a single Dagda.init(), so `Dagda.loaded` resolves only
 * once every service is reachable.
 */
export function initBaseServices<
    Entities extends EntitiesTypes,
    Contexts,
    Notifications extends Record<string, unknown>,
    Extra extends Record<string, unknown> = {}
>(params: BaseServicesParams<Entities, Contexts, Notifications> & { extraServices?: Extra }): void {
    Dagda.init({
        ...buildBaseServices(params),
        ...(params.extraServices ?? {})
    });
}
