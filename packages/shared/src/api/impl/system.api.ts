import { UserInfo } from "../../auth/types";

/** One registered route or action (FEATURES §11.2) — see `server/src/api/manifest.ts` for the server-side registry this mirrors */
export interface SystemInfoRoute {
    name: string;
    kind: "route" | "action";
    permission?: string;
    description?: string;
}

export interface SystemInfo {
    /** Start date */
    startTimeMilliseconds: number;
    /** List of uncaught errors */
    errors: string[];
    /**
     * The account behind the request (FEATURES §7, §11.4).
     *
     * Always set: the route refuses an anonymous call, so reaching this at all
     * means someone is logged in. Carries `isSuperAdmin`, which is what lets the
     * interface hide what would be refused anyway (§7.1) — hiding a screen is
     * never the check itself.
     */
    user: UserInfo;
    /**
     * Every route/action registered on the server (FEATURES §11.2) — rides
     * along on this existing boot-time round trip so `dagda.routes`/
     * `dagda.help()` don't need one of their own.
     */
    routes: SystemInfoRoute[];
}

export type SystemAPI = {
    /** Get system information */
    getSystemInfo: () => SystemInfo;
    /** Trigger an error */
    triggerError: () => void;
};
