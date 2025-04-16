import { BaseAppTypes } from "@dagda/shared/src/app/types";
import express from "express";
import passport from "passport";
import { resolve } from "path";
import { apiRegister, RequestCallback } from "../api";
import { getSystemInfo } from "../api/impl/system.api";
import { AuthHandler, AuthStrategy } from "../auth";
import { PGRunner } from "../sql/impl/pg.runner";
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

    // -- Google auth --
    /** Google client ID */
    clientID?: string;
    /** Google client secret */
    clientSecret?: string;

    // -- Database --
    /** 
     * Database connexion string.
     * 
     * postgresql://[user[:password]@][netloc][:port][/dbname][?param1=value1&...]
     * https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING
     */
    dbURL: string;
}

/** Alias to avoid importing passport in project */
export type PassportProfile = passport.Profile;

/** 
 * Base server app. 
 * This gather all the logic of the server app.
 */
export abstract class AbstractServerApp<AppTypes extends BaseAppTypes> {

    protected _config: EnvConfig;
    protected _app: express.Express;
    protected _auth: AuthHandler;
    protected _db: PGRunner;

    constructor(protected _params: ServerParams) {
        console.log("Reading config for environment variables...");
        // Read the config from env variables
        this._config = this._readConfigFromEnv();

        // -- Init the server --
        console.log("Starting server...");
        this._app = express();
        this._app.use(express.json()); // JSON parsing middleware

        // -- Create the authentication handler --
        console.log("Initializing authentication handler...");
        this._auth = new AuthHandler(this._app, this._config.baseURL, this._isUserValid.bind(this));

        // -- Register client files routes --
        const path: string = resolve(this._params.staticFolder);
        console.log(`Serving static folder: ${path}`);
        this._app.use(express.static(path));

        // -- Register standard APIs --
        console.log("Registering standard APIs...");
        this.registerAPI("getSystemInfo", getSystemInfo);

        // -- Init DB connection --
        console.log("Initializing database connection...");
        this._db = new PGRunner(this._config.dbURL);
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
    }

    //#region HTTP Server -----------------------------------------------------

    /** Listen */
    public listen(): Promise<void> {
        return new Promise((resolve, reject) => {
            const server = this._app.listen(this._config.port, resolve);
        }).then(() => {
            ;
            console.log(`Server listening on port ${this._config.port}`);
            console.log(`Base URL: ${this._config.baseURL}`);
        });
    }

    /** Register an api on the server */
    public registerAPI<Name extends keyof AppTypes["apis"]>(name: Name, callback: RequestCallback<AppTypes["apis"], Name>): void {
        // Register the route with the server
        apiRegister(this._app, name, callback);
    }

    //#endregion

    //#region Authentication --------------------------------------------------

    /** Register an authentication strategy */
    public registerAuthStrategy(strategy: AuthStrategy): void {
        this._auth.registerStrategy(strategy);
    }

    /** Register google strategy */
    public registerGoogleStrategy(): void {
        if (this._config.clientID == null || this._config.clientSecret == null) {
            throw "For security reason, GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET variables are required to register the google strategy";
        }
        this._auth.registerGoogleStrategy(this._config.clientID, this._config.clientSecret);
    }

    /** @returns true if user is existing and allowed to connect */
    protected abstract _isUserValid(profile: PassportProfile): Promise<boolean>;

    //#endregion

    //#region Config ----------------------------------------------------------

    /** Reads the config from env variables */
    protected _readConfigFromEnv(): EnvConfig {
        const prefix = this._params.envPrefix ?? "";
        return {
            // -- HTTP server --
            port: getEnvNumber(`${prefix}PORT`),
            baseURL: getEnvString(`${prefix}BASE_URL`),
            // -- google auth --
            clientID: getEnvStringOptional(`${prefix}GOOGLE_CLIENT_ID`),
            clientSecret: getEnvStringOptional(`${prefix}GOOGLE_CLIENT_SECRET`),
            // -- Database --
            dbURL: getEnvString(`${prefix}DB_URL`),
        } satisfies EnvConfig;
    }

    //#endregion

    //#region Entities --------------------------------------------------------

    protected _registerEntitiesService(): void {

    }

    /** Can be used to perform a transaction on the server */
    public fetch(context: AppTypes["contexts"]): Promise<unknown> {
        throw new Error("Method not implemented.");
    }

    //#endregion


}
