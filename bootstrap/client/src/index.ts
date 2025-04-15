import { HelloPage } from "@dagda/client/src/app/hello/hello.page";
import { ClientApp } from "./app";

/** Singleton of the App */
export const APP: ClientApp = new ClientApp();
APP.start();
APP.setPage(HelloPage);