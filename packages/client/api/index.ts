import { API } from "@dagda/shared/api/types";

type CallOptions<Parameters extends any[], ReturnType> = {
    parametersTransformer?: (args: Parameters) => RequestInit["body"];
    returnTransformer?: (response: Response) => ReturnType;
}

/** Call a method on the server */
export async function apiCall<
    Route extends API<Name, Parameters, ReturnType, CallOptions<Parameters, ReturnType>>,
    Name extends string,
    Parameters extends any[],
    ReturnType
>(name: Route extends API<infer Name, unknown[], unknown, unknown> ? Name : never,
    options: CallOptions<Parameters, ReturnType>, ...args: Parameters): Promise<ReturnType> {
    const URL = `/${name}`;
    const response = await fetch(URL, {
        method: "POST",
        body: options.parametersTransformer ? options.parametersTransformer(args) : JSON.stringify(args),
        headers: {
            'Content-Type': 'application/json',
        }
    });
    if (!response.ok) {
        throw new Error(`Method call failed: ${URL}() => ${response.status} ${response.statusText}`);
    } else {
        try {
            const data = await (options.returnTransformer ? options.returnTransformer(response) : response.json());
            return data;
        } catch (err) {
            throw new Error(`Error while parsing response: ${err}`);
        }
    }
}
