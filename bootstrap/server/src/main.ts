
import { AppContextAdapter } from "@dagda-app/shared/src/entities/contexts";
import { APP_MODEL } from "@dagda-app/shared/src/entities/model";
import { DEFAULT_SERVER_PARAMS } from "@dagda/server/src/app";
import { ServerApp } from "./app";

async function main(): Promise<void> {
    const app = new ServerApp({ ...DEFAULT_SERVER_PARAMS }, APP_MODEL, new AppContextAdapter());
    app.registerGoogleStrategy();
    await app.listen();
}

main().catch(e => console.error(e));