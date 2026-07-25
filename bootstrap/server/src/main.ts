
import { APP_CONTEXT_ADAPTER } from "@dagda-app/shared/src/entities/contexts";
import { APP_MODEL } from "@dagda-app/shared/src/entities/model";
import { DEFAULT_SERVER_PARAMS } from "@dagda/server/src/app";
import { ServerApp } from "./app";

async function main(): Promise<void> {
    const app = new ServerApp({ ...DEFAULT_SERVER_PARAMS }, APP_MODEL, APP_CONTEXT_ADAPTER);
    // Nothing to register: local accounts are the only authentication mode
    // (FEATURES §7). On an empty database the framework creates admin/admin and
    // says so, which is how the first login happens.
    await app.listen();
}

main().catch(e => console.error(e));
