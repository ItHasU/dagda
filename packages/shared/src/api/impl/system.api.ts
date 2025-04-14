import { API } from "../types";

export const SYSTEM_URL = "system";

export interface SystemInfo {
    /** Start date */
    startTimeMilliseconds: number;
    /** List of uncaught errors */
    errors: string[];
    /** User display name */
    userDisplayName: string;
    /** User photo URL */
    userPhotoUrl: string | null;
}

export type SystemGetInfoAPI<O> = API<"getSystemInfo", [], SystemInfo, O>;
export type SystemTriggerErrorAPI<O> = API<"triggerError", [], void, O>;
