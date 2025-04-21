import { EntitiesService } from "@dagda/shared/src/entities/service";
import { LogService } from "@dagda/shared/src/tools/log";
import { AppContexts } from "./entities/contexts";
import { AppEntityTypes } from "./entities/types";

/** 
 * Shared services available to both the client and the server.
 * While the client and the server share the same definition of the services,
 * the implementation maybe different.
 */
export interface SharedServices extends LogService, EntitiesService<AppEntityTypes, AppContexts> {
}