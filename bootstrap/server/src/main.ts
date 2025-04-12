
import { AppTypes } from "@dagda-app/shared/src/app/types";
import { App, DEFAULT_SERVER_PARAMS } from "@dagda/server/src/app";

async function main(): Promise<void> {
    const app = new App<AppTypes>({ ...DEFAULT_SERVER_PARAMS });
    await app.listen();
}

main().catch(e => console.error(e));