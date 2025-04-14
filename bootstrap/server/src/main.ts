
import { DEFAULT_SERVER_PARAMS } from "@dagda/server/src/app";
import { App } from "./app";

async function main(): Promise<void> {
    const app = new App({ ...DEFAULT_SERVER_PARAMS });
    await app.listen();
}

main().catch(e => console.error(e));