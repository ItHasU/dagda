import { SystemGetInfoAPI, SystemTriggerErrorAPI } from "@dagda/shared/src/api/impl/system.api";
import { RequestOptions } from "..";

export const getSystemInfo: SystemGetInfoAPI<RequestOptions> = async (options) => {
    console.log("getSystemInfo", options);
    return {
        startTimeMilliseconds: Date.now(),
        errors: []
    };
}

export const triggerError: SystemTriggerErrorAPI<RequestOptions> = async (options) => {
    return new Promise<void>((resolve, reject) => {
        // Simulate an error
        // This is a test error
        resolve();
        throw new Error(`This is an uncaught test error by user ${options.userProfile.displayName}`);
    });
}
