import { BaseAppTypes } from "@dagda/shared/src/app/types";

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

export interface ServerRouteOptions { }

/** 
 * Base server app. 
 * This class stores all information about the app and manages the HTTP server.
 */
export class App<AppTypes extends BaseAppTypes> {

    constructor(protected _params: ServerParams) {
    }

    public fetch(context: AppTypes["contexts"]): Promise<unknown> {
        throw new Error("Method not implemented.");
    }
}

// const server = new AbstractServer({ ...DEFAULT_SERVER_PARAMS });

// export type AddAPI<O> = API<"add", [a: number, b: string], boolean, O>;

// export const add: AddAPI<ServerRouteOptions> = async function (options: ServerRouteOptions, a: number, b: string): Promise<boolean> {
//     return Promise.resolve(true);
// };
