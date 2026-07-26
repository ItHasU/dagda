import { EventHandlerData, EventHandlerImpl, EventListener } from "../tools/events";

/** 
 * A broadcast notification system. You should only instantiate one per node (server, client).
 * Communication is handled : 
 * - by the implementation of the broadcast method to send notifications,
 * - by calling the _onNotificationReceived method when a notification is received.
 */
export abstract class AbstractNotificationHandler<Notifications extends Record<string, unknown>> {

    private readonly _eventHandlerData: EventHandlerData<Notifications> = {};

    constructor() { }

    /** Broadcast a new notification to all other clients */
    public abstract broadcast<NotificationKind extends keyof Notifications>(kind: NotificationKind, data: Notifications[NotificationKind]): void;

    /**
     * Fire a notification within this process only — it never reaches the
     * network, on either side.
     *
     * `broadcast()` has no per-recipient filtering yet (FEATURES §6): every
     * other connected client receives it, whoever they are logged in as. A
     * fact that is only true *here* — "this is the account this session just
     * resolved to" — must never go through it, or every other open session
     * would receive this one's identity. This is the primitive for that case.
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
