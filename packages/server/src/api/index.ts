import { APICollection } from "@dagda/shared/src/api/types";
import { IRouter } from "express";
import { PassportProfile } from "../app";

export type RequestOptionsFromClient = {
    type: "client";
    request: Express.Request;
    response: Express.Response;
    /** Gives the user profile that made the request */
    userProfile: PassportProfile;
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

export function apiRegister<Collection extends APICollection, Name extends keyof Collection>(
    router: IRouter, name: Name, callback: RequestCallback<Collection, Name>): void {
    // Register the route with the server
    router.post(`/${name.toString()}`, async (req, res) => {
        // Vérification de l'authentification
        const user = (req as any)["user"] as PassportProfile;
        if (!user) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        const args: any[] = req.body ?? [];
        const options: RequestOptionsFromClient = {
            type: "client",
            request: req,
            response: res,
            userProfile: user
        };

        try {
            let result = await callback(options, ...args as any); // Here we do not expect args to be invalid
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