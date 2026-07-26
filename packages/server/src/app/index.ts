import { EntitiesAPI } from "@dagda/shared/src/api/impl/entities.api";
import { BaseAppTypes } from "@dagda/shared/src/app/types";
import { Dagda } from "@dagda/shared/src/dagda";
import { EntitiesHandler } from "@dagda/shared/src/entities/handler";
import { EntitiesService } from "@dagda/shared/src/entities/service";
import { EntitiesModel } from "@dagda/shared/src/entities/model";
import { ContextAdapter, Data } from "@dagda/shared/src/entities/tools/adapters";
import { initBaseServices } from "@dagda/shared/src/services";
import { SettingsDeclaration, SettingsModel } from "@dagda/shared/src/settings/model";
import { SettingsStore } from "../settings/store";
import { SQLTransactionData, SQLTransactionResult } from "@dagda/shared/src/sql/transaction";
import express from "express";
import { resolve } from "path";
import { DagdaActions } from "@dagda/shared/src/auth/actions";
import { hasPermission } from "@dagda/shared/src/auth/permissions";
import { UserInfo } from "@dagda/shared/src/auth/types";
import { actionRegister, ActionCallback } from "../actions";
import { apiRegister, RegisterAPIOptions, RequestCallback, RequestOptions } from "../api";
import { submit } from "../api/impl/entities.api";
import { getSystemInfo, triggerError } from "../api/impl/system.api";
import { AuthHandler } from "../auth";
import { RoleStore } from "../auth/roles";
import { UserStore } from "../auth/users";
import { ServerNotificationImpl } from "../notification/notification.impl";
import { PGRunner } from "../sql/impl/pg.runner";
import { checkSchemaCoherence } from "../sql/coherence";
import { FRAMEWORK_MIGRATIONS } from "../sql/framework.migrations";
import { applyMigrations, Migration } from "../sql/migrations";
import { getEnvNumber, getEnvString, getEnvStringOptional } from "../tools/config";

/** Parameters */
export interface ServerParams {
    /** 
     * Path to the static app folder (where your HTML files are)
     * Must be relative to the server root.
     */
    staticFolder: string;
    /** Prefix for environment variables */
    envPrefix?: string;
}

export const DEFAULT_SERVER_PARAMS = {
    staticFolder: "../client/dist",
    envPrefix: "",
} satisfies Partial<ServerParams>;


/** Values read from the env variables */
export interface EnvConfig {
    // -- HTTP server --
    /** Port to listen to */
    port: number;
    /** Base URL */
    baseURL: string;

    // -- Database --
    /**
     * Database connexion string.
     *
     * postgresql://[user[:password]@][netloc][:port][/dbname][?param1=value1&...]
     * https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING
     */
    dbURL: string;

    // -- Settings --
    /**
     * Key protecting the secret settings at rest (FEATURES §11.5).
     *
     * A bootstrap parameter for the same reason as the connection string: it
     * cannot be read from the table it protects. Only needed when the
     * application declares a secret setting.
     */
    secretKey?: string;
}

/**
 * Base server app.
 * This gather all the logic of the server app.
 */
export abstract class AbstractServerApp<AppTypes extends BaseAppTypes, Settings extends SettingsDeclaration<Settings> = {}> {

    protected _config: EnvConfig;
    protected _app: express.Express;
    protected _auth: AuthHandler;
    protected _db: PGRunner;
    protected _notification: ServerNotificationImpl<AppTypes["events"]>;
    protected _settings: SettingsStore<Settings>;
    protected _roles: RoleStore;
    protected _users: UserStore;

    constructor(
        protected _params: ServerParams,
        protected _model: EntitiesModel<any, any>,
        protected _contextAdapter: ContextAdapter<AppTypes["contexts"]>,
        /**
         * The settings the application declares (FEATURES §11.5).
         * Omitted, the store is still there with nothing in it, so the framework
         * can rely on it unconditionally.
         */
        protected _settingsModel: SettingsModel<Settings> = new SettingsModel({} as Settings)
    ) {
        console.log("Reading config for environment variables...");
        // Read the config from env variables
        this._config = this._readConfigFromEnv();

        // -- Init the server --
        console.log("Starting server...");
        this._app = express();
        this._app.use(express.json()); // JSON parsing middleware
        // The login form posts urlencoded, which express.json() does not read.
        this._app.use(express.urlencoded({ extended: false }));

        // -- Init DB connection --
        // Before the authentication handler, which reads the accounts from it.
        console.log("Initializing database connection...");
        this._db = new PGRunner(this._config.dbURL);
        this._roles = new RoleStore(this._db);
        this._users = new UserStore(this._db, this._roles);

        // -- Create the authentication handler --
        console.log("Initializing authentication handler...");
        this._auth = new AuthHandler({
            app: this._app,
            users: this._users,
            secretKey: this._config.secretKey
        });

        // -- Register client files routes --
        // After the gate: the client bundle is not public, only the login page is.
        const path: string = resolve(this._params.staticFolder);
        console.log(`Serving static folder: ${path}`);
        this._app.use(express.static(path));

        this._db.withReservedConnection(async (connection) => {
            const result = await connection.all<{ name: string, size: number }>("SELECT pg_database.datname AS name, pg_database_size(pg_database.datname) AS size FROM pg_database")
            if (result == null) {
                console.log("Failed to fetch database stats");
                return;
            } else if (result.length === 0) {
                console.log("No database found");
                return;
            } else {
                console.log("Database stats:");
                for (const row of result) {
                    const humanReadableSize = (size: number): string => {
                        const units = ["bytes", "KB", "MB", "GB", "TB"];
                        let unitIndex = 0;
                        while (size >= 1024 && unitIndex < units.length - 1) {
                            size /= 1024;
                            unitIndex++;
                        }
                        return `${size.toFixed(2)} ${units[unitIndex]}`;
                    };

                    console.log(`- ${row.name}: ${humanReadableSize(row.size)}`);
                }
            }
        }).catch((error) => {
            console.error("Error fetching database stats:", error);
        });

        // -- Register standard APIs --
        console.log("Registering standard APIs...");
        this.registerAPI("getSystemInfo", getSystemInfo);
        this.registerAPI("triggerError", triggerError);
        // Register the entities API
        apiRegister<EntitiesAPI<AppTypes["contexts"], AppTypes["entities"]>, "fetch">(this._app, "fetch", (options: RequestOptions, context: AppTypes["contexts"]): Promise<Data<AppTypes["entities"]>> => {
            return this._fetch(context, options);
        });
        apiRegister<EntitiesAPI<AppTypes["contexts"], AppTypes["entities"]>, "submit">(this._app, "submit", (options: RequestOptions, transactionData: SQLTransactionData<AppTypes["entities"], AppTypes["contexts"]>): Promise<SQLTransactionResult> => {
            return this._submit(transactionData, options);
        });

        // -- Register standard actions --
        // Account management (FEATURES §11.4): every Dagda application gets
        // these, the same way every one gets accounts — not declared per
        // application, unlike AppTypes["actions"]. No role matrix yet
        // (ROADMAP tranche 3), so isSuperAdmin is the whole of the check.
        console.log("Registering standard actions...");
        this._registerAccountActions();

        // -- Register the standard services --
        // Until this landed, the server never called Dagda.init() at all: every
        // Dagda.get() answered undefined there, so an entities handler built on
        // the server silently skipped its contextChanged broadcast and no client
        // ever heard about a write made by the server itself.
        console.log("Registering standard services...");
        this._notification = new ServerNotificationImpl<AppTypes["events"]>();
        // Built here, loaded in migrate(): the table it reads is created by a
        // framework migration, so there is nothing to read yet. Until then any
        // read throws rather than answering a default nobody chose.
        this._settings = new SettingsStore<Settings>({
            model: this._settingsModel,
            runner: this._db,
            encryptionKey: this._config.secretKey
        });
        initBaseServices<AppTypes["entities"], AppTypes["contexts"], AppTypes["events"]>({
            model: this._model,
            contextAdapter: this._contextAdapter,
            persistence: {
                fetch: (context) => this._fetch(context, { type: "server" }),
                submit: (transactionData) => this._submit(transactionData, { type: "server" })
            },
            notification: this._notification,
            // One handler per call: two requests must not share a cache, since
            // what it holds depends on who asked.
            handlerPerCall: true,
            extraServices: {
                settings: this._settings.settings,
                ...this._buildServices()
            }
        });
    }

    /**
     * Services of the application, registered next to the framework's.
     * Override to add your own; they land in the same Dagda.init().
     */
    protected _buildServices(): Record<string, unknown> {
        return {};
    }

    //#region HTTP Server -----------------------------------------------------

    /**
     * Migrations of the application, applied at startup after the framework's.
     * Override to declare yours; the ids are recorded once applied and must
     * never be renamed.
     */
    protected _migrations(): Migration[] {
        return [];
    }

    /**
     * Bring the database up to date, then verify it matches the model.
     *
     * Called by listen() before the first request is accepted: a server that
     * answers on a stale schema fails later, on a random screen, far from the
     * cause. The coherence check is what makes a forgotten migration visible at
     * startup instead (FEATURES §2).
     */
    public async migrate(): Promise<void> {
        console.log("Applying migrations...");
        const framework = await applyMigrations(this._db, this._model, FRAMEWORK_MIGRATIONS, "framework");
        const app = await applyMigrations(this._db, this._model, this._migrations(), "app");
        const total = framework.length + app.length;
        console.log(total === 0 ? "Database already up to date." : `${total} migration(s) applied.`);

        console.log("Checking the schema against the model...");
        await checkSchemaCoherence(this._db, this._model);

        // After the migrations: the table holding them has just been created by
        // one. Before listen(): a request must never find the configuration
        // half-read.
        console.log("Loading settings...");
        await this._settings.load();

        // Before an account exists nobody can be invited, so the first one
        // escapes the normal path (FEATURES §7.1).
        await this._users.ensureBootstrapAdmin();
    }

    /**
     * The settings of the application (FEATURES §11.5).
     *
     * Reading is synchronous; `settings.on(key, …)` is how a component
     * reconfigures itself without a restart.
     */
    public get settings(): SettingsStore<Settings> {
        return this._settings;
    }

    /** Listen */
    public async listen(): Promise<void> {
        await this.migrate();
        return new Promise<void>((resolve) => {
            const server = this._app.listen(this._config.port, () => resolve());
            // The notification service already exists and is registered; it only
            // needs the HTTP server, which does not exist before this point.
            this._notification.attach(server);
        }).then(() => {
            console.log(`Server listening on port ${this._config.port}`);
            console.log(`Base URL: ${this._config.baseURL}`);
        });
    }

    /** Register an api on the server */
    public registerAPI<Name extends keyof AppTypes["apis"]>(name: Name, callback: RequestCallback<AppTypes["apis"], Name>, options?: RegisterAPIOptions): void {
        // Register the route with the server
        apiRegister(this._app, name, callback, options);
    }

    /** Register an action on the server (FEATURES §11.1) */
    public registerAction<Name extends keyof AppTypes["actions"]>(name: Name, callback: ActionCallback<AppTypes["actions"], Name>): void {
        actionRegister(this._app, name, callback);
    }

    /** Account and role management actions, the same for every application (FEATURES §7.1, §11.4) */
    protected _registerAccountActions(): void {
        const requirePermission = (user: UserInfo, permission: string): void => {
            if (!hasPermission(user, permission)) {
                // The gate that matters: hiding a screen is not access
                // control (§11.2), and this is reachable from any console.
                throw new Error("Missing permission: " + permission);
            }
        };
        const toInvitationResult = (invitation: { user: UserInfo, token: string, expiresAt: number }) => ({
            user: invitation.user,
            url: `${this._config.baseURL.replace(/\/$/, "")}/invite/${invitation.token}`,
            expiresAt: invitation.expiresAt
        });

        actionRegister<DagdaActions, "listUsers">(this._app, "listUsers", async (user) => {
            requirePermission(user, "users.manage");
            return this._users.list();
        });
        actionRegister<DagdaActions, "inviteUser">(this._app, "inviteUser", async (user, params) => {
            requirePermission(user, "users.manage");
            return toInvitationResult(await this._users.invite(params));
        });
        actionRegister<DagdaActions, "reinviteUser">(this._app, "reinviteUser", async (user, params) => {
            requirePermission(user, "users.manage");
            return toInvitationResult(await this._users.reinvite(params.id));
        });
        actionRegister<DagdaActions, "setUserEnabled">(this._app, "setUserEnabled", async (user, params) => {
            requirePermission(user, "users.manage");
            await this._users.setEnabled(params.id, params.enabled);
        });
        actionRegister<DagdaActions, "setUserRole">(this._app, "setUserRole", async (user, params) => {
            requirePermission(user, "users.manage");
            await this._users.setRole(params.id, params.roleId);
        });

        actionRegister<DagdaActions, "listRoles">(this._app, "listRoles", async (user) => {
            requirePermission(user, "roles.manage");
            return this._roles.list();
        });
        actionRegister<DagdaActions, "createRole">(this._app, "createRole", async (user, params) => {
            requirePermission(user, "roles.manage");
            return this._roles.create(params);
        });
        actionRegister<DagdaActions, "updateRole">(this._app, "updateRole", async (user, params) => {
            requirePermission(user, "roles.manage");
            return this._roles.update(params.id, params);
        });
        actionRegister<DagdaActions, "deleteRole">(this._app, "deleteRole", async (user, params) => {
            requirePermission(user, "roles.manage");
            await this._roles.delete(params.id);
        });

        this._registerUserDirectoryAction();
    }

    /**
     * The client-side user directory action (ROADMAP tranche 3), kept apart
     * from `_registerAccountActions()` above: every other action there is
     * gated by `users.manage` or `roles.manage`, this one deliberately isn't.
     * Any authenticated account needs to resolve an author's id to a name
     * while rendering a screen — `actionRegister`'s own baseline (a session)
     * is the whole of the check.
     */
    protected _registerUserDirectoryAction(): void {
        actionRegister<DagdaActions, "listUserNames">(this._app, "listUserNames", async () => {
            const users = await this._users.list();
            return users.map(user => ({ id: user.id, displayName: user.displayName }));
        });
    }

    public broadcast<NotificationKind extends keyof AppTypes["events"]>(kind: NotificationKind, data: AppTypes["events"][NotificationKind]): void {
        this._notification.broadcast(kind, data);
    }

    //#endregion

    //#region Authentication --------------------------------------------------

    /**
     * The accounts (FEATURES §7).
     *
     * Local accounts are the only mode: no external provider, and no public
     * sign-up. An application uses this to create accounts, disable them, or
     * read who is who.
     */
    public get users(): UserStore {
        return this._users;
    }

    //#endregion

    //#region Config ----------------------------------------------------------

    /** Reads the config from env variables */
    protected _readConfigFromEnv(): EnvConfig {
        const prefix = this._params.envPrefix ?? "";
        return {
            // -- HTTP server --
            port: getEnvNumber(`${prefix}PORT`),
            baseURL: getEnvString(`${prefix}BASE_URL`),
            // -- Database --
            dbURL: getEnvString(`${prefix}DB_URL`),
            // -- Settings --
            secretKey: getEnvStringOptional(`${prefix}SECRET_KEY`),
        } satisfies EnvConfig;
    }

    //#endregion

    //#region Entities --------------------------------------------------------

    /** 
     * @returns the handler 
     * The handler is exposed directly and should be used to access the entities.
     */
    public getTemporaryHandler(): EntitiesHandler<AppTypes["entities"], AppTypes["contexts"]> {
        // The service builds a new handler on every call, so each request gets
        // its own cache. Equivalent to Dagda.get("entities").getHandler().
        return Dagda.get<EntitiesService<AppTypes["entities"], AppTypes["contexts"]>>("entities").getHandler();
    }

    /** Fetch implementation to be provided by the app */
    protected abstract _fetch(context: AppTypes["contexts"], request: RequestOptions): Promise<Data<AppTypes["entities"]>>;

    /**
     * Submit implementation to be provided by the app, mirroring `_fetch` above.
     *
     * `request` carries who is writing: `{ type: "client", user, ... }` for a
     * write coming from the entities route (`user` is always set — the route
     * refuses an anonymous call before this is reached), `{ type: "server" }`
     * for a write made by the server itself (an action, a migration, ...),
     * where there is no request to speak of. An override can use `user` to
     * stamp who wrote a row, or to reject a write outright.
     */
    protected _submit(transactionData: SQLTransactionData<AppTypes["entities"], AppTypes["contexts"]>, request: RequestOptions): Promise<SQLTransactionResult> {
        return submit(this._db, this._model, transactionData);
    }

    //#endregion

}
