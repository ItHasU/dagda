import { UserInfo } from "../auth/types";
import { EventHandlerData, EventHandlerImpl, EventListener } from "../tools/events";

/**
 * Decides who receives a broadcast (FEATURES §6, ROADMAP tranche 4).
 *
 * Resolved by the caller *before* the broadcast, into a plain predicate over
 * a `UserInfo` — never an async per-socket check, so filtering a broadcast
 * costs one query total, not one per connected client.
 */
export type NotificationRecipientFilter = (user: UserInfo) => boolean;

/**
 * A broadcast notification system. You should only instantiate one per node (server, client).
 * Communication is handled :
 * - by the implementation of the broadcast method to send notifications,
 * - by calling the _onNotificationReceived method when a notification is received.
 */
export abstract class AbstractNotificationHandler<Notifications extends Record<string, unknown>> {

    private readonly _eventHandlerData: EventHandlerData<Notifications> = {};

    constructor() { }

    /**
     * Broadcast a new notification to other clients.
     *
     * `recipients`, unset, means everyone — today's behaviour, and every
     * existing broadcast's default. `excludeSessionId` leaves out the
     * writer's own session, so a server-authored broadcast triggered by one
     * of its own requests doesn't mark that same session's cache dirty.
     */
    public abstract broadcast<NotificationKind extends keyof Notifications>(
        kind: NotificationKind,
        data: Notifications[NotificationKind],
        recipients?: NotificationRecipientFilter,
        excludeSessionId?: string
    ): void;

    /**
     * Fire a notification within this process only — it never reaches the
     * network, on either side.
     *
     * This is still the right primitive for a fact that is only ever true
     * *here* (e.g. "this is the account this session just resolved to") —
     * `broadcast()` now supports per-recipient filtering (ROADMAP tranche 4),
     * but resolving that filter is still work a purely local fact shouldn't
     * have to pay for.
     */
    public notifyLocal<NotificationKind extends keyof Notifications>(kind: NotificationKind, data: Notifications[NotificationKind]): void {
        this._fire(kind, data);
    }

    /** Register a listener on any notification kind */
    public on<NotificationKind extends keyof Notifications>(kind: NotificationKind, listener: EventListener<Notifications[NotificationKind]>): void {
        EventHandlerImpl.on<Notifications, NotificationKind>(this._eventHandlerData, kind, listener);
    }

    /** Fire a named event, utility function for the implementations */
    protected _fire<NotificationKind extends keyof Notifications>(kind: NotificationKind, data: Notifications[NotificationKind]): void {
        EventHandlerImpl.fire<Notifications, NotificationKind>(this._eventHandlerData, kind, data);
    }
}
