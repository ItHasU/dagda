import { EventListener } from "../tools/events";
import { AbstractNotificationHandler } from "./abstract.notification.handler";
import { DagdaEvents } from "./events";

export interface NotificationService<Notifications extends DagdaEvents & Record<string, unknown>> {
    notification: {
        /** Register a notification listener */
        on: <NotificationKind extends keyof Notifications>(kind: NotificationKind, listener: EventListener<Notifications[NotificationKind]>) => void;
        /** Broadcast a notification */
        broadcast: <NotificationKind extends keyof Notifications>(kind: NotificationKind, data: Notifications[NotificationKind]) => void;
    }
}

export function buildNotificationService<Notifications extends DagdaEvents & Record<string, unknown>>(handler: AbstractNotificationHandler<Notifications>): NotificationService<Notifications> {
    return {
        notification: handler
    };
}