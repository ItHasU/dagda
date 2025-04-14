import { BaseAppTypes } from "@dagda/shared/src/app/types";
import express from "express";
import passport from "passport";
import { resolve } from "path";
import { AuthHandler, AuthStrategy } from "../express/auth";
import { getEnvNumber, getEnvString } from "../tools/config";

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
}

/** 
 * Base server app. 
 * This class stores all information about the app and manages the HTTP server.
 */
export abstract class AbstractApp<AppTypes extends BaseAppTypes> {

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
    }

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

    //#endregion

    //#region Authentication --------------------------------------------------

    /** Register an authentication strategy */
    public registerAuthStrategy(strategy: AuthStrategy): void {
        this._auth.registerStrategy(strategy);
    }

    /** @returns true if user is existing and allowed to connect */
    protected abstract _isUserValid(profile: passport.Profile): Promise<boolean>;

    //#endregion

    //#region Tools -----------------------------------------------------------

    /** Reads the config from env variables */
    protected _readConfigFromEnv(): EnvConfig {
        const prefix = this._params.envPrefix ?? "";
        return {
            port: getEnvNumber(`${prefix}PORT`),
            baseURL: getEnvString(`${prefix}BASE_URL`),
        };
    }

    //#endregion

    public fetch(context: AppTypes["contexts"]): Promise<unknown> {
        throw new Error("Method not implemented.");
    }
}



const APP_START_TIME_MS = new Date().getTime();

// /** Initialize an Express app and register the routes */
// export async function initHTTPServer(db: AbstractSQLRunner, baseURL: string, port: number): Promise<void> {
//     const app = express();

//     // -- Update pictures with status computing --
//     // Mark all pictures with status computing to error as once the server is restarted
//     // there is no way to handle pictures with this state.
//     // Note : We could also have passed the status to pending, but if the server reboots due to an
//     // error during generation, this could create an infinite loop and the user would not be 
//     // notified of the problem.
//     try {
//         await db.run(`UPDATE ${qt("pictures")} SET ${qf("pictures", "status", false)}=${ComputationStatus.ERROR} WHERE ${qf("pictures", "status", false)}=${ComputationStatus.COMPUTING}`);
//     } catch (e) {
//         console.error("An error occurred while handing computing pictures at startup");
//         console.error(e);
//     }

//     // -- Create the authentication handler --
//     // Read the google client id and secret from the environment variables
//     const clientID = getEnvStringOptional("GOOGLE_CLIENT_ID");
//     const clientSecret = getEnvStringOptional("GOOGLE_CLIENT_SECRET");
//     if (clientID == null || clientSecret == null) {
//         console.warn(`GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not found in environment variables, authentication is disabled`);
//         const noAuth = getEnvStringOptional("NO_AUTH");
//         if (noAuth == null) {
//             throw "For security reason, NO_AUTH variable is required when auth variables are left empty";
//         } else {
//             console.log("Authentication is disabled on purpose, continuing...");
//         }
//     } else {
//         const auth: AuthHandler = new AuthHandler(app, baseURL, async (profile: passport.Profile) => {
//             try {
//                 const handler = buildServerEntitiesHandler(db);
//                 await handler.fetch({ type: "users", "options": undefined });
//                 // Search for the user
//                 const userEntity = handler.getItems("users").find(user => user.uid === profile.id);
//                 if (userEntity == null) {
//                     // We need to create the user
//                     await handler.withTransaction((tr) => {
//                         tr.insert("users", {
//                             id: asNamed(0),
//                             uid: asNamed(profile.id),
//                             displayName: asNamed(profile.displayName),
//                             enabled: asNamed(false)
//                         });
//                     });
//                     await handler.waitForSubmit();
//                     return false;
//                 } else {
//                     return userEntity.enabled;
//                 }
//             } catch (err) {
//                 console.error(err);
//                 return false;
//             }
//         });
//         auth.registerGoogleStrategy(clientID, clientSecret);
//     }

//     // -- JSON parsing middleware --
//     app.use(express.json());

//     // -- Register client files routes --
//     const path: string = resolve("./apps/client/dist");
//     app.use(express.static(path));

//     // -- Register SQL routes --
//     registerAdapterAPI<AppTables, AppContexts>(app, APP_MODEL, db, sqlFetch);

//     // -- Register models routes --
//     _registerAPIs(app);

// }