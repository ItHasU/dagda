
import { DEFAULT_SERVER_PARAMS } from "@dagda/server/src/app";
import { ServerApp } from "./app";

async function main(): Promise<void> {
    const app = new ServerApp({ ...DEFAULT_SERVER_PARAMS });
    app.registerGoogleStrategy();
    await app.listen();
}

main().catch(e => console.error(e));