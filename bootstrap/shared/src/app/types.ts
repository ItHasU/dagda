import { EntitiesAPI } from "@dagda/shared/src/api/impl/entities.api";
import { SystemAPI } from "@dagda/shared/src/api/impl/system.api";
import { BaseAppTypes } from "@dagda/shared/src/app/types";
import { DagdaPermission } from "@dagda/shared/src/auth/permissions";
import { AppContexts } from "../entities/contexts";
import { AppEntityTypes, AppFieldTypes } from "../entities/types";

/** Permissions this application checks, on top of the framework's own — none yet */
export type AppPermission = DagdaPermission;

/** App types */
export interface AppTypes extends BaseAppTypes {
    fieldTypes: AppFieldTypes;
    entities: AppEntityTypes;
    contexts: AppContexts;
    apis: SystemAPI & EntitiesAPI<AppContexts, AppEntityTypes>;
    permissions: AppPermission;
}
