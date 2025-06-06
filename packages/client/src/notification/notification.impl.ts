import { AbstractNotificationHandler } from "@dagda/shared/src/notification/abstract.notification.handler";
import { DagdaEvents } from "@dagda/shared/src/notification/events";

/** Notification server based on websocket protocol */
export class ClientNotificationImpl<Notifications extends DagdaEvents & Record<string, unknown>> extends AbstractNotificationHandler<Notifications> {

    protected _socket: WebSocket | null = null;

    public constructor() {
        super();
        this._connect();
    }

    protected _connect(): void {
        if (this._socket) {
            this._socket.close();
            this._socket = null;
        }

        try {
            this._socket = new WebSocket(`ws${window.location.protocol.includes("s") ? "s" : ""}://${window.location.host}`);
            this._socket.onopen = () => {
                console.log("Socket opened");
                this._fire("connected", true);
            };
            this._socket.onmessage = async (event) => {
                // Convert the blob to a string
                const str = typeof event.data === "string" ? event.data : (await (event.data as Blob).text());
                const notification = JSON.parse(str);
                this._fire(notification.kind, notification.data);
            };
            this._socket.onclose = () => {
                this._fire("connected", false);
                console.log("Socket closed, reconnecting in 1 seconds");
                setTimeout(() => this._connect(), 1000);
            }
        } catch (e) {
            this._socket = null;
            this._fire("connected", false);
        }
    }

    /** @inheritdoc */
    public override broadcast<NotificationKind extends keyof Notifications>(kind: NotificationKind, data: Notifications[NotificationKind]): void {
        this._socket?.send(JSON.stringify({ kind: kind, data: data }));
    }

}