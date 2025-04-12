import { API } from "@dagda/shared/api/types";

export interface ClientRouteOptions { }

export interface AbstractClient<AppTypes extends {
    contexts: unknown;
}> {

    public call<
        Route extends API<Name, Parameters, ReturnType, ClientRouteOptions>,
        Name extends string,
        Parameters extends any[],
        ReturnType
    >(name: Route extends API<infer Name, unknown[], unknown, unknown> ? Name : never,
        options: ClientRouteOptions, ...args: Parameters): Promise<ReturnType> {
}

}