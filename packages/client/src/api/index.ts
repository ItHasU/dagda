import { APICollection } from "@dagda/shared/src/api/types";

export type CallOptions = {}

/** Call a method on the server */
export async function apiCall<
    Collection extends APICollection,
    Name extends keyof Collection
>(
    name: Name,
    options: CallOptions,
    ...args: Parameters<Collection[Name]>
): Promise<ReturnType<Collection[Name]>> {
    const URL = `/${name.toString()}`;
    const response = await fetch(URL, {
        method: "POST",
        body: JSON.stringify(args),
        headers: {
            'Content-Type': 'application/json',
        }
    });
    if (!response.ok) {
        throw new Error(`Method call failed: ${URL}() => ${response.status} ${response.statusText}`);
    } else {
        try {
            const data = await response.json();
            return data;
        } catch (err) {
            throw new Error(`Error while parsing response: ${err}`);
        }
    }
}
