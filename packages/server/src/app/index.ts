import { BaseAppTypes } from "@dagda/shared/src/app/types";
import express from "express";
import passport from "passport";
import { resolve } from "path";
import { apiRegister, RequestCallback } from "../api";
import { getSystemInfo } from "../api/impl/system.api";
import { AuthHandler, AuthStrategy } from "../auth";
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
    /** Port to listen to */
    port: number;
    /** Base URL */
    baseURL: string;

    // -- Google auth --
    /** Google client ID */
    clientID?: string;
    /** Google client secret */
    clientSecret?: string;
}

/** Alias to avoid importing passport in project */
export type PassportProfile = passport.Profile;

/** 
 * Base server app. 
 * This class stores all information about the app and manages the HTTP server.
 */
export abstract class AbstractServerApp<AppTypes extends BaseAppTypes> {

    protected _config: EnvConfig;
    protected _app: express.Express;
    protected _auth: AuthHandler;

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
    public registerAPI<Name extends keyof AppTypes["apis"]>(name: Name, callback: RequestCallback<Name, AppTypes["apis"]>): void {
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

    //#region Tools -----------------------------------------------------------

    /** Reads the config from env variables */
    protected _readConfigFromEnv(): EnvConfig {
        const prefix = this._params.envPrefix ?? "";
        return {
            port: getEnvNumber(`${prefix}PORT`),
            baseURL: getEnvString(`${prefix}BASE_URL`),
            // -- google auth --
            clientID: getEnvStringOptional(`${prefix}GOOGLE_CLIENT_ID`),
            clientSecret: getEnvStringOptional(`${prefix}GOOGLE_CLIENT_SECRET`)
        };
    }

    //#endregion

    public fetch(context: AppTypes["contexts"]): Promise<unknown> {
        throw new Error("Method not implemented.");
    }
}
