import { AppTypes } from "@dagda-app/shared/src/app/types";
import { AbstractClientApp } from "@dagda/client/src/app";

export class ClientApp extends AbstractClientApp<AppTypes & { pageNames: "admin" }> {

}