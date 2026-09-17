import { EntitiesAPI } from "@dagda/shared/src/api/impl/entities.api";
import { SystemAPI } from "@dagda/shared/src/api/impl/system.api";
import { BaseAppTypes } from "@dagda/shared/src/app/types";
import { AppAPI } from "../api";
import { AppContexts } from "../entities/contexts";
import { AppEntityTypes, AppFieldTypes } from "../entities/types";
import { AppPermission } from "../permissions";
import { AppNotifications } from "../services";

/** App types — the contract both sides of the application compile against */
export interface AppTypes extends BaseAppTypes {
    fieldTypes: AppFieldTypes;
    entities: AppEntityTypes;
    contexts: AppContexts;
    apis: SystemAPI & EntitiesAPI<AppContexts, AppEntityTypes> & AppAPI;
    // Without this the notification service is typed on the framework's own
    // events alone, and `noteAdded` compiles as `unknown` (see services.ts).
    events: AppNotifications;
    permissions: AppPermission;
}
