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

export type SystemAPI = {
    /** Get system information */
    getSystemInfo: () => SystemInfo;
    /** Trigger an error */
    triggerError: () => void;
};
