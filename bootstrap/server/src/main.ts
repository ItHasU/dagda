
import { AppContextAdapter } from "@dagda-app/shared/src/entities/contexts";
import { APP_MODEL } from "@dagda-app/shared/src/entities/model";
import { DEFAULT_SERVER_PARAMS } from "@dagda/server/src/app";
import { ServerApp } from "./app";

async function main(): Promise<void> {
    const app = new ServerApp({ ...DEFAULT_SERVER_PARAMS }, APP_MODEL, new AppContextAdapter());
    // Starting without credentials is legitimate: the development loop and the
    // end-to-end tests run that way. The application then stays behind the login
    // page, which is precisely what those tests check.
    if (app.isGoogleStrategyConfigured) {
        app.registerGoogleStrategy();
    } else {
        console.warn("No Google credentials configured, starting without any authentication strategy.");
    }
    await app.listen();
}

main().catch(e => console.error(e));