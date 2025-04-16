import { SystemAPI } from "@dagda/shared/src/api/impl/system.api";
import { BaseAppTypes } from "@dagda/shared/src/app/types";
import { AppContexts } from "../entities/contexts";

/** App types */
export interface AppTypes extends BaseAppTypes {
    contexts: AppContexts;
    apis: SystemAPI;
}
