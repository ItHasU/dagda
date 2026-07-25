import { UserInfo } from "../../auth/types";

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
}

export type SystemAPI = {
    /** Get system information */
    getSystemInfo: () => SystemInfo;
    /** Trigger an error */
    triggerError: () => void;
};
