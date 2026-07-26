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

    /**
     * @inheritdoc
     * A browser cannot author a broadcast (ROADMAP tranche 4): the server no
     * longer relays an inbound client message to other sockets — that relay
     * was both an unfiltered leak channel for owned/shared data and an
     * unauthenticated forgery hole (any logged-in browser could send any
     * notification kind). Every real broadcast is authored server-side now
     * (`AbstractServerApp._submit()`, the MQTT ingest path, …). Use
     * `notifyLocal()` for a fact that's only ever true in this process.
     */
    public override broadcast<NotificationKind extends keyof Notifications>(_kind: NotificationKind, _data: Notifications[NotificationKind]): never {
        throw new Error("A browser cannot author a broadcast — see AbstractNotificationHandler.broadcast()'s doc comment.");
    }

}