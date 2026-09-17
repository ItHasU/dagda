import { EntitiesService } from "@dagda/shared/src/entities/service";
import { DagdaAppEvents } from "@dagda/shared/src/notification/events";
import { NotificationService } from "@dagda/shared/src/notification/service";
import { LogService } from "@dagda/shared/src/tools/log";
import { AppContexts } from "./entities/contexts";
import { AppEvents } from "./entities/events";
import { AppEntityTypes } from "./entities/types";

/**
 * Framework events plus the application's own.
 *
 * Declared in AppTypes["events"] (`app/types.ts`), which is what types the
 * notification service on both sides. Without it the events fall back to
 * `BaseAppTypes`'s default and an application event compiles as `unknown`.
 *
 * `DagdaAppEvents` rather than the more obvious `DagdaEvents`: it adds
 * `contextChanged`, which carries the application's own context type —
 * `AbstractServerApp._submit()` broadcasts it on every write, and without
 * this an application declaring `DagdaEvents & AppEvents` could not type
 * that broadcast at all.
 */
export type AppNotifications = DagdaAppEvents<AppContexts> & AppEvents;

/**
 * Shared services available to both the client and the server.
 * While the client and the server share the same definition of the services,
 * the implementation maybe different.
 */
export interface SharedServices extends LogService, EntitiesService<AppEntityTypes, AppContexts>, NotificationService<AppNotifications> {
}
