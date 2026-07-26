import { ActionsCollection } from "@dagda/shared/src/actions/types";

/** Call a named action on the server (Dagda FEATURES §11.1) */
export async function actionCall<
    Collection extends ActionsCollection,
    Name extends keyof Collection
>(
    name: Name,
    ...args: Parameters<Collection[Name]>
): Promise<Awaited<ReturnType<Collection[Name]>>> {
    const URL = `/actions/${name.toString()}`;
    const response = await fetch(URL, {
        method: "POST",
        body: JSON.stringify(args),
        headers: {
            'Content-Type': 'application/json',
        }
    });
    if (!response.ok) {
        // The body carries the message actionRegister put there — surfacing it
        // is the whole reason a failed write must reach the user (ROADMAP
        // tranche 2), not just the console.
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? `Action call failed: ${URL} => ${response.status} ${response.statusText}`);
    }
    return response.json();
}
