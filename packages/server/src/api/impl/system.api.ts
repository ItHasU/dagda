import { SystemGetInfoAPI, SystemTriggerErrorAPI } from "@dagda/shared/src/api/impl/system.api";
import { RequestOptions } from "..";

export const getSystemInfo: SystemGetInfoAPI<RequestOptions<"getSystemInfo">> = async (options) => {
    return {
        startTimeMilliseconds: Date.now(),
        errors: []
    };
}

export const triggerError: SystemTriggerErrorAPI<RequestOptions<"triggerError">> = async (options) => {
    return new Promise<void>((resolve, reject) => {
        // Simulate an error
        // This is a test error
        resolve();
        throw new Error(`This is an uncaught test error by user ${options.userUID}`);
    });
}
