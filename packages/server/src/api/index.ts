import { UserInfo } from "@dagda/shared/src/auth/types";
import { hasPermission } from "@dagda/shared/src/auth/permissions";
import { APICollection } from "@dagda/shared/src/api/types";
import { IRouter, Request } from "express";

export type RequestOptionsFromClient = {
    type: "client";
    request: Express.Request;
    response: Express.Response;
    /**
     * The authenticated account that made the request.
     *
     * Always set: the route below refuses an anonymous call, so a server
     * function never has to check whether someone is behind it.
     */
    user: UserInfo;
}

export type RequestOptionsFromServer = {
    type: "server";
}

/** Information retrieved from the request before calling the callback */
export type RequestOptions = RequestOptionsFromClient | RequestOptionsFromServer;

export type RequestCallback<Collection extends APICollection, Name extends keyof Collection> = (
    options: RequestOptionsFromClient,
    ...args: Parameters<Collection[Name]>
) => Promise<ReturnType<Collection[Name]>>;

export type RegisterAPIOptions = {
    /**
     * Permission (FEATURES §7.1) required to call this route, checked against
     * the caller's resolved permissions before the callback ever runs. Unset
     * means any authenticated account may call it — today's default for
     * every route, unchanged.
     */
    permission?: string;
};

export function apiRegister<Collection extends APICollection, Name extends keyof Collection>(
    router: IRouter, name: Name, callback: RequestCallback<Collection, Name>, options?: RegisterAPIOptions): void {
    // Register the route with the server
    router.post(`/${name.toString()}`, async (req: Request, res) => {
        // Hiding a screen is not access control: the check holds on the route
        // itself, whatever the interface chose to display.
        const user = req.user;
        if (user == null) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        const args: any[] = req.body ?? [];
        const requestOptions: RequestOptionsFromClient = {
            type: "client",
            request: req,
            response: res,
            user
        };

        try {
            // Declared alongside the route (FEATURES §5), unlike actions'
            // manual `requirePermission` calls (§11.4): a route that forgets
            // this check is structurally impossible rather than a discipline
            // problem. Thrown into the same catch below as any other failure,
            // so a refusal gets the exact same response shape actions already
            // give a refused permission — consistency between the two
            // RPC-ish mechanisms matters more than either being "more correct".
            if (options?.permission != null && !hasPermission(user, options.permission)) {
                throw new Error(`Missing permission: ${options.permission}`);
            }
            let result = await callback(requestOptions, ...args as any); // Here we do not expect args to be invalid
            if (result === void (0)) {
                res.json(null); // No content
            } else {
                res.json(result ?? null);
            }
        } catch (err) {
            console.error(`Error while calling ${name as string} with args: ${JSON.stringify(args)}`);
            console.error(err);
            res.status(500).json({ error: new String(err) });
        }
    });
}