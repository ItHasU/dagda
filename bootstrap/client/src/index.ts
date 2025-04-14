import { ClientApp } from "./app";

/** Singleton of the App */
export const APP: ClientApp = new ClientApp();
APP.getSystemInfo().then((info) => {
    console.log("System info:", info);
}).catch((err) => {
    console.error("Error while getting system info:", err);
});