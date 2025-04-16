import { SystemAPI } from "@dagda/shared/src/api/impl/system.api";
import { AppContexts } from "../entities/contexts";

/** App types */
export interface AppTypes {
    contexts: AppContexts;
    apis: SystemAPI;
}
