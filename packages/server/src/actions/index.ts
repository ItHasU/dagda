import { ActionsCollection } from "@dagda/shared/src/actions/types";
import { APIType, ManifestOrigin } from "@dagda/shared/src/api/types";
import { hasPermission, PermissionCheck } from "@dagda/shared/src/auth/permissions";
import { UserInfo } from "@dagda/shared/src/auth/types";
import { IRouter, Request } from "express";
import { registerManifestEntry } from "../api/manifest";

/**
 * Handler of a registered action.
 *
 * No `RequestOptionsFromClient` wrapper here, unlike `RequestCallback` (§5):
 * an action is the curated surface a script or the console calls, and a
 * script has no business holding onto the raw Express request/response — the
 * account behind the call is all it should ever need.
 */
export type ActionCallback<Collection extends ActionsCollection, Name extends keyof Collection> = (
    user: UserInfo,
    ...args: Parameters<Collection[Name]>
) => Promise<Awaited<ReturnType<Collection[Name]>>>;

/**
 * Registers a named action (Dagda FEATURES §11.1), reachable from the UI and,
 * eventually, from the console and from user scripts (§11.2/§11.3).
 *
 * Kept under its own `/actions/` route rather than sharing `apiRegister`'s
 * `/` namespace: the two are registered on the same router but must never be
 * confused, since the console global (§11.2) walks the actions collection
 * alone and must never accidentally surface `fetch` or `submit`.
 */
export type RegisterActionOptions<Collection extends ActionsCollection = ActionsCollection, Name extends keyof Collection = keyof Collection> = {
    /**
     * Where this action may be called from (FEATURES §5 refactor) — see
     * `RegisterAPIOptions.type`, same meaning and same "not yet enforced"
     * caveat for `"external"`/`"both"`.
     */
    type?: APIType;
    /**
     * Permission required to call it — see `RegisterAPIOptions.permission`
     * for the string-vs-function distinction. Unset means every existing
     * callback keeps doing its own manual `_requirePermission(user, ...)`
     * check as its first line; this is the declarative alternative, checked
     * before the callback runs at all.
     */
    permission?: string | PermissionCheck<Parameters<Collection[Name]>>;
    /** Free-text explanation surfaced by `dagda.help()` (FEATURES §11.2) */
    description?: string;
};

export function actionRegister<Collection extends ActionsCollection, Name extends keyof Collection>(
    router: IRouter, name: Name, callback: ActionCallback<Collection, Name>,
    options?: RegisterActionOptions<Collection, Name>,
    /** Set only by `AbstractServerApp`'s own framework registrations — an application registering its own action always gets "app" */
    origin: ManifestOrigin = "app"
): void {
    registerManifestEntry({
        name: name.toString(),
        kind: "action",
        origin,
        type: options?.type ?? "internal",
        permission: typeof options?.permission === "string" ? options.permission : undefined,
        description: options?.description
    });
    router.post(`/actions/${name.toString()}`, async (req: Request, res) => {
        // Same gate as an API route: hiding a button is not access control.
        const user = req.user;
        if (user == null) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        const args: any[] = req.body ?? [];
        try {
            if (options?.permission != null) {
                const allowed = typeof options.permission === "function"
                    ? options.permission(user, ...args as any)
                    : hasPermission(user, options.permission);
                if (!allowed) {
                    throw new Error(`Missing permission for "${name.toString()}"`);
                }
            }
            const result = await callback(user, ...args as any); // Here we do not expect args to be invalid
            res.json(result ?? null);
        } catch (err) {
            console.error(`Error while calling action ${name.toString()} with args: ${JSON.stringify(args)}`);
            console.error(err);
            res.status(500).json({ error: new String(err) });
        }
    });
}
