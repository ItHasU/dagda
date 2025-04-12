/**
 * Represents a generic API interface with a specific name, parameters, return type, and options.
 *
 * @template Name - A string literal type representing the name of the API. This is used to make sure client and server both use the same name for the API.
 * @template Params - A tuple type representing the parameters accepted by the API.
 * @template ReturnType - The type of the value returned by the API.
 * @template Options - The type of the options object required to configure the API.
 *
 * @param options - The configuration options for the API.
 * @param args - The parameters to be passed to the API.
 * @returns A promise that resolves to the return type of the API.
 */
export interface API<Name extends string, Params extends any[], ReturnType, Options> {
    (options: Options, ...args: Params): Promise<ReturnType>;
}

