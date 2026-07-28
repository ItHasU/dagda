import { BaseAppTypes } from "./app/types";
import { DAGDA_PERMISSIONS, DagdaPermission, PermissionDeclaration } from "./auth/permissions";
import { EntitiesHandler } from "./entities/handler";
import { EntitiesModel } from "./entities/model";
import { EntitiesService } from "./entities/service";
import { ContextAdapter, PersistenceAdapter } from "./entities/tools/adapters";
import { EntitiesTypes } from "./entities/types";
import { NotificationService } from "./notification/service";
import { buildConsoleLogService, LogService } from "./tools/log";

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
    options?: { handlerPerCall?: boolean; notification?: NotificationService<any>["notification"] }
): EntitiesService<Entities, Contexts>["entities"] {
    const build = (): EntitiesHandler<Entities, Contexts> =>
        new EntitiesHandler<Entities, Contexts>(model, contextAdapter, persistence, options?.notification as any);

    if (options?.handlerPerCall) {
        return { getHandler: build };
    }
    // One handler for the whole session: its synchronous cache is what the
    // components read while rendering.
    const handler = build();
    return { getHandler: () => handler };
}

/** Parameters needed to build the base services every Dagda application receives, whichever side it runs on */
export interface BaseServicesParams<AppTypes extends BaseAppTypes> {
    /** The application entities model */
    model: EntitiesModel<any, any>;
    /** How two contexts compare */
    contextAdapter: ContextAdapter<AppTypes["contexts"]>;
    /** Where the data comes from and goes to: an API call on the client, SQL on the server */
    persistence: PersistenceAdapter<AppTypes["entities"], AppTypes["contexts"]>;
    /** The transport of the notifications: a websocket client or a websocket server */
    notification: NotificationService<AppTypes["events"]>["notification"];
    /**
     * Build a new handler on every call instead of sharing one.
     * The server needs it: two requests must never share a cache, since the
     * cache is scoped to what one user is allowed to see.
     */
    handlerPerCall?: boolean;
    /** Replaces the default console logger */
    log?: LogService["log"];
    /**
     * The application's own permissions (FEATURES §7.1), on top of the
     * framework's — merged into `dagda.permissions`. Only the app's own
     * keys: the framework's (`DAGDA_PERMISSIONS`) are added automatically.
     */
    permissions?: Record<Exclude<AppTypes["permissions"], DagdaPermission>, PermissionDeclaration>;
}

/**
 * The services every Dagda application receives, whichever side it runs on:
 * `log`, `entities` and `notification`. An application never builds them
 * itself — the framework does, on both sides (FEATURES §0, "les services de
 * base sont autonomes"). What differs between the client and the server is
 * only how data is persisted and how notifications travel, which is why both
 * are constructor parameters.
 *
 * `ClientDagda`/`ServerDagda` extend this with what belongs to their side.
 * An application then extends one of those with its own services — the list
 * is constant per application (FEATURES §0), so each one is a named, typed
 * field rather than an entry in a dictionary reached through `get(name)`.
 *
 * ```ts
 * class AppDagda extends ClientDagda<AppTypes> {
 *     public readonly mqtt: MqttService;
 *     constructor(params: BaseServicesParams<AppTypes> & ClientOwnServicesParams<AppTypes> & { mqtt: MqttService }) {
 *         super(params);
 *         this.mqtt = params.mqtt;
 *     }
 * }
 * export let dagda: AppDagda;
 * // ... at bootstrap, once every parameter is known:
 * dagda = new AppDagda({ ... });
 * ```
 */
export class Dagda<AppTypes extends BaseAppTypes = BaseAppTypes> {

    public readonly log: LogService["log"];
    public readonly entities: EntitiesService<AppTypes["entities"], AppTypes["contexts"]>["entities"];
    public readonly notification: NotificationService<AppTypes["events"]>["notification"];
    public readonly permissions: Record<AppTypes["permissions"], PermissionDeclaration>;

    constructor(params: BaseServicesParams<AppTypes>) {
        this.log = params.log ?? buildConsoleLogService();
        this.entities = buildEntitiesService<AppTypes["entities"], AppTypes["contexts"]>(
            params.model,
            params.contextAdapter,
            params.persistence,
            { handlerPerCall: params.handlerPerCall, notification: params.notification as any }
        );
        this.notification = params.notification;
        this.permissions = { ...DAGDA_PERMISSIONS, ...(params.permissions ?? {}) } as Record<AppTypes["permissions"], PermissionDeclaration>;
    }

}
