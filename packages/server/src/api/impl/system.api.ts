import { SystemAPI, SystemInfo } from "@dagda/shared/src/api/impl/system.api";
import { RequestCallback, RequestOptionsFromClient } from "..";

export const getSystemInfo: RequestCallback<SystemAPI, "getSystemInfo"> = async function (options: RequestOptionsFromClient): Promise<SystemInfo> {
    return {
        startTimeMilliseconds: Date.now(),
        errors: [],
        user: options.user
    };
}

export const triggerError: RequestCallback<SystemAPI, "triggerError"> = async function (options: RequestOptionsFromClient): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        // Simulate an error
        // This is a test error
        resolve();
        throw new Error(`This is an uncaught test error by user ${options.user.displayName}`);
    });
}
