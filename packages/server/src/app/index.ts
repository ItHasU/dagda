import { EntitiesAPI } from "@dagda/shared/src/api/impl/entities.api";
import { BaseAppTypes } from "@dagda/shared/src/app/types";
import { Dagda } from "@dagda/shared/src/dagda";
import { EntitiesHandler } from "@dagda/shared/src/entities/handler";
import { EntitiesService } from "@dagda/shared/src/entities/service";
import { EntitiesModel } from "@dagda/shared/src/entities/model";
import { ContextAdapter, Data } from "@dagda/shared/src/entities/tools/adapters";
import { initBaseServices } from "@dagda/shared/src/services";
import { PreferencesDeclaration, PreferencesModel } from "@dagda/shared/src/preferences/model";
import { SettingsDeclaration, SettingsModel } from "@dagda/shared/src/settings/model";
import { PreferencesStore } from "../preferences/store";
import { SettingsStore } from "../settings/store";
import { SQLTransactionData, SQLTransactionResult } from "@dagda/shared/src/sql/transaction";
import express from "express";
import { resolve } from "path";
import { DagdaActions } from "@dagda/shared/src/auth/actions";
import { DAGDA_PERMISSIONS, hasPermission, PermissionsDeclaration } from "@dagda/shared/src/auth/permissions";
import { UserId, UserInfo } from "@dagda/shared/src/auth/types";
import { NotificationRecipientFilter } from "@dagda/shared/src/notification/abstract.notification.handler";
import { actionRegister, ActionCallback, RegisterActionOptions } from "../actions";
import { apiRegister, RegisterAPIOptions, RequestCallback, RequestOptions } from "../api";
import { submit } from "../api/impl/entities.api";
import { getSystemInfo, triggerError } from "../api/impl/system.api";
import { AuditLogKind, AuditLogStore } from "../audit/store";
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
}

export const DEFAULT_SERVER_PARAMS = {
    staticFolder: "../client/dist",
} satisfies Partial<ServerParams>;


/** Values read from the env variables */
export interface EnvConfig {
    // -- HTTP server --
    /**
     * Port to listen to.
     *
     * Kept apart from `baseURL`: the two often differ in practice — behind a
     * reverse proxy or a Docker port mapping, the process listens on one
     * port while the public URL exposes another (or none at all, e.g.
     * `https://example.com`).
     */
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
export abstract class AbstractServerApp<AppTypes extends BaseAppTypes, Settings extends SettingsDeclaration<Settings> = {}, Preferences extends PreferencesDeclaration<Preferences> = {}> {

    protected _config: EnvConfig;
    protected _app: express.Express;
    protected _auth: AuthHandler;
    protected _db: PGRunner;
    protected _notification: ServerNotificationImpl<AppTypes["events"]>;
    protected _settings: SettingsStore<Settings>;
    protected _preferences: PreferencesStore<Preferences>;
    protected _roles: RoleStore;
    protected _users: UserStore;
    protected _audit: AuditLogStore;

    constructor(
        protected _params: ServerParams,
        protected _model: EntitiesModel<any, any>,
        protected _contextAdapter: ContextAdapter<AppTypes["contexts"]>,
        /**
         * The settings the application declares (FEATURES §11.5).
         * Omitted, the store is still there with nothing in it, so the framework
         * can rely on it unconditionally.
         */
        protected _settingsModel: SettingsModel<Settings> = new SettingsModel({} as Settings),
        /**
         * The preferences the application declares (FEATURES §11.6).
         * Omitted, the store is still there with nothing in it, same posture as
         * `_settingsModel` above.
         */
        protected _preferencesModel: PreferencesModel<Preferences> = new PreferencesModel({} as Preferences),
        /**
         * The permissions the application declares (FEATURES §7.1), on top of
         * `DAGDA_PERMISSIONS`. Omitted, only the framework's own are checkable
         * — an app with nothing of its own to gate needs nothing here.
         */
        protected _permissions: PermissionsDeclaration = {}
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
        this._roles = new RoleStore(this._db, { ...DAGDA_PERMISSIONS, ...this._permissions });
        this._users = new UserStore(this._db, this._roles);
        this._audit = new AuditLogStore(this._db);

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
        this._registerPreferencesActions();
        this._registerSettingsActions();

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
        this._preferences = new PreferencesStore<Preferences>(this._preferencesModel, this._db);
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

    /**
     * The preferences of the application (FEATURES §11.6).
     *
     * Unlike `settings`, every read and write here needs a user id — there is
     * no process-wide value to read without one.
     */
    public get preferences(): PreferencesStore<Preferences> {
        return this._preferences;
    }

    /** Listen */
    public async listen(): Promise<void> {
        await this.migrate();
        return new Promise<void>((resolve) => {
            const server = this._app.listen(this._config.port, () => resolve());
            // The notification service already exists and is registered; it only
            // needs the HTTP server, which does not exist before this point.
            // The session parser is handed over so a websocket upgrade can be
            // resolved to the same account an HTTP request would (ROADMAP
            // tranche 4) — an upgrade never goes through Express's own chain.
            this._notification.attach(server, { sessionParser: this._auth.sessionParser, users: this._users });
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

    /**
     * Register an action on the server (FEATURES §11.1).
     *
     * Every successful call is recorded to the audit log (ROADMAP tranche 3)
     * — a rejected one (a thrown permission check, or any other failure)
     * never reaches `_recordAudit()`, since it sits strictly after `callback`
     * resolves.
     */
    public registerAction<Name extends keyof AppTypes["actions"]>(name: Name, callback: ActionCallback<AppTypes["actions"], Name>, options?: RegisterActionOptions): void {
        const wrapped: ActionCallback<AppTypes["actions"], Name> = async (user, ...args): Promise<Awaited<ReturnType<AppTypes["actions"][Name]>>> => {
            const result = await callback(user, ...args);
            await this._recordAudit(user.id, "action", String(name), args);
            return result;
        };
        actionRegister<AppTypes["actions"], Name>(this._app, name, wrapped, options);
    }

    /**
     * Registers one of the framework's own standard actions (the ~14 calls
     * across `_registerAccountActions()` and friends below) — the
     * counterpart of `registerAction()` above for `DagdaActions` rather than
     * an application's own vocabulary, so both paths get audited from the
     * same two places instead of at each of those call sites individually.
     *
     * `redact`, when given, rewrites what gets stored for `details` — the
     * only user of this today is `setSetting()`, whose `value` argument must
     * never land in the log in clear for a secret setting (FEATURES §11.5:
     * written, never read back in clear — the log is no exception).
     */
    protected _registerFrameworkAction<Name extends keyof DagdaActions>(
        name: Name,
        callback: ActionCallback<DagdaActions, Name>,
        redact?: (args: Parameters<DagdaActions[Name]>) => unknown,
        options?: RegisterActionOptions
    ): void {
        const wrapped: ActionCallback<DagdaActions, Name> = async (user, ...args): Promise<Awaited<ReturnType<DagdaActions[Name]>>> => {
            const result = await callback(user, ...args);
            await this._recordAudit(user.id, "action", String(name), redact ? redact(args) : args);
            return result;
        };
        actionRegister<DagdaActions, Name>(this._app, name, wrapped, options);
    }

    /**
     * Writes one row to the audit log, swallowing its own failure: a broken
     * audit write must never turn an otherwise-successful action or
     * transaction into an error response for the caller.
     */
    protected async _recordAudit(userId: UserId | null, kind: AuditLogKind, name: string | null, details: unknown): Promise<void> {
        try {
            await this._audit.record(userId, kind, name, details);
        } catch (err) {
            console.error(`Failed to record an audit log entry (kind=${kind}, name=${name}):`, err);
        }
    }

    /**
     * @throws if `user` does not hold `permission`.
     *
     * The gate that matters for an action: hiding a screen is not access
     * control (§11.2), and an action is reachable from any console.
     */
    protected _requirePermission(user: UserInfo, permission: string): void {
        if (!hasPermission(user, permission)) {
            throw new Error("Missing permission: " + permission);
        }
    }

    /** Account and role management actions, the same for every application (FEATURES §7.1, §11.4) */
    protected _registerAccountActions(): void {
        const toInvitationResult = (invitation: { user: UserInfo, token: string, expiresAt: number }) => ({
            user: invitation.user,
            url: `${this._config.baseURL.replace(/\/$/, "")}/invite/${invitation.token}`,
            expiresAt: invitation.expiresAt
        });

        this._registerFrameworkAction<"listUsers">("listUsers", async (user) => {
            this._requirePermission(user, "users.manage");
            return this._users.list();
        });
        this._registerFrameworkAction<"inviteUser">("inviteUser", async (user, params) => {
            this._requirePermission(user, "users.manage");
            return toInvitationResult(await this._users.invite(params));
        });
        this._registerFrameworkAction<"reinviteUser">("reinviteUser", async (user, params) => {
            this._requirePermission(user, "users.manage");
            return toInvitationResult(await this._users.reinvite(params.id));
        });
        this._registerFrameworkAction<"setUserEnabled">("setUserEnabled", async (user, params) => {
            this._requirePermission(user, "users.manage");
            await this._users.setEnabled(params.id, params.enabled);
        });
        this._registerFrameworkAction<"setUserRole">("setUserRole", async (user, params) => {
            this._requirePermission(user, "users.manage");
            await this._users.setRole(params.id, params.roleId);
        });

        this._registerFrameworkAction<"listRoles">("listRoles", async (user) => {
            this._requirePermission(user, "roles.manage");
            return this._roles.list();
        });
        this._registerFrameworkAction<"createRole">("createRole", async (user, params) => {
            this._requirePermission(user, "roles.manage");
            return this._roles.create(params);
        });
        this._registerFrameworkAction<"updateRole">("updateRole", async (user, params) => {
            this._requirePermission(user, "roles.manage");
            return this._roles.update(params.id, params);
        });
        this._registerFrameworkAction<"deleteRole">("deleteRole", async (user, params) => {
            this._requirePermission(user, "roles.manage");
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
        this._registerFrameworkAction<"listUserNames">("listUserNames", async () => {
            const users = await this._users.list();
            return users.map(user => ({ id: user.id, displayName: user.displayName }));
        });
    }

    /**
     * Preferences actions (FEATURES §11.6), kept apart from
     * `_registerAccountActions()` for the same reason `listUserNames()` is
     * its own method above, taken one step further: these two aren't gated
     * by a *permission* at all, they're inherently scoped to the calling
     * user's own id — resolved from `UserInfo`, never from a client-supplied
     * one, so there is nothing to check beyond having a session.
     */
    protected _registerPreferencesActions(): void {
        this._registerFrameworkAction<"getPreferences">("getPreferences", async (user) => {
            return this._preferences.getAll(user.id);
        });
        this._registerFrameworkAction<"setPreference">("setPreference", async (user, params) => {
            // The value is unknown until `set()` validates it against the
            // declared type of `params.key` (§11.6) — same cast the caller of
            // a dynamically-keyed write always needs, `validateValue` is what
            // actually rejects a mismatched value.
            await this._preferences.set(user.id, params.key as keyof Preferences, params.value as never);
        });
    }

    /**
     * System settings actions (FEATURES §11.5, ROADMAP tranche 3), gated by
     * `settings.manage` — an administrator concern, unlike preferences above.
     */
    protected _registerSettingsActions(): void {
        this._registerFrameworkAction<"getSettingsValues">("getSettingsValues", async (user) => {
            this._requirePermission(user, "settings.manage");
            // Not `getValuesFor(SettingVisibility.client)`: that filters by
            // who may read a setting at runtime, which would hide most
            // settings from the very screen meant to edit them. Here every
            // non-secret key goes out, regardless of its declared visibility
            // — `settings.get()` is not visibility-filtered, unlike
            // `getValuesFor()`. Secrets are the only exclusion: written,
            // never read back in clear (§11.5).
            const result: Record<string, unknown> = {};
            for (const key of this._settingsModel.getKeys()) {
                if (!this._settingsModel.isSecret(key)) {
                    result[String(key)] = this._settings.settings.get(key);
                }
            }
            return result;
        });
        this._registerFrameworkAction<"setSetting">("setSetting", async (user, params) => {
            this._requirePermission(user, "settings.manage");
            // Same idiom as setPreference() above: set() validates the value
            // against the declared type of params.key, and throws usefully
            // if the key is not declared at all.
            await this._settings.set(params.key as keyof Settings, params.value as never);
        }, ([params]) => {
            // Never the value in clear for a secret setting (§11.5) — the
            // audit trail is not an exception to "written, never read back".
            const isSecret = this._settingsModel.isDeclared(params.key) && this._settingsModel.isSecret(params.key);
            return [{ key: params.key, value: isSecret ? "[redacted]" : params.value }];
        });
    }

    public broadcast<NotificationKind extends keyof AppTypes["events"]>(
        kind: NotificationKind,
        data: AppTypes["events"][NotificationKind],
        recipients?: NotificationRecipientFilter,
        excludeSessionId?: string
    ): void {
        this._notification.broadcast(kind, data, recipients, excludeSessionId);
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

    /**
     * Reads the config from env variables.
     *
     * Fixed names, not a configurable prefix: database access and the
     * session/settings secret are the only things a process needs to start —
     * everything else is a system setting (§11.5), so every application gets
     * this for free instead of wiring its own prefix.
     */
    protected _readConfigFromEnv(): EnvConfig {
        return {
            // -- HTTP server --
            port: getEnvNumber("APP_PORT"),
            baseURL: getEnvString("APP_BASE_URL"),
            // -- Database --
            dbURL: getEnvString("APP_DATABASE_URL"),
            // -- Settings --
            secretKey: getEnvStringOptional("APP_SECRET"),
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
     *
     * Every transaction that reaches the `return` below has already
     * succeeded — `submit()` throws on failure, which propagates out before
     * the audit write, so a rejected transaction never produces a log row
     * (ROADMAP tranche 3), same rule as `registerAction()` above.
     *
     * `contextChanged` is authored here too (ROADMAP tranche 4), not by the
     * browser any more: `_notificationRecipients()` is resolved *before* the
     * write (a DELETE's rows are still readable then) so an override can
     * compute who may see the result — an owned/shared entity is filtered,
     * everything else keeps today's open-broadcast behaviour by default. The
     * writer's own session is excluded, or a write would immediately mark
     * its own just-written context dirty.
     */
    protected async _submit(transactionData: SQLTransactionData<AppTypes["entities"], AppTypes["contexts"]>, request: RequestOptions): Promise<SQLTransactionResult> {
        const recipients = await this._notificationRecipients(transactionData, request);
        const result = await submit(this._db, this._model, transactionData);
        const userId = request.type === "client" ? request.user.id : null;
        await this._recordAudit(userId, "submit", null, transactionData);
        const excludeSessionId = request.type === "client" ? request.request.sessionID : undefined;
        // `AppTypes["events"]` is only known here as `BaseAppTypes["events"]`
        // (`DagdaEvents & Record<string, unknown>`), which does not, at this
        // generic level, guarantee a `contextChanged` key — every real app
        // does declare one via `DagdaAppEvents<Contexts>` (see
        // `@dagda/shared/src/notification/events.ts`), so this is a real
        // contract, just one `AbstractServerApp`'s own generic can't state.
        this.broadcast("contextChanged" as any, transactionData.contexts as any, recipients, excludeSessionId);
        return result;
    }

    /**
     * Who may hear about a transaction, resolved *before* it runs.
     *
     * `undefined` (the default) means everyone — today's behaviour, and the
     * right default for every table that isn't owned or shared: tightening
     * this is the app's contract to write, not something the framework can
     * infer from the model. Override for an owned/shared entity (ROADMAP
     * tranche 4) — read `transactionData.operations` for which rows changed,
     * not `transactionData.contexts` alone, which cannot tell you which
     * dashboard changed on a `{type:"dashboard", options:{dashboardId}}`-less
     * context such as `{type:"dashboards"}`.
     */
    protected async _notificationRecipients(
        _transactionData: SQLTransactionData<AppTypes["entities"], AppTypes["contexts"]>,
        _request: RequestOptions
    ): Promise<NotificationRecipientFilter | undefined> {
        return undefined;
    }

    //#endregion

}
