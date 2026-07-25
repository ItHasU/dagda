import { AbstractNotificationHandler } from "@dagda/shared/src/notification/abstract.notification.handler";
import { Server } from "http";
import { WebSocket, WebSocketServer } from "ws";

/** Notification server based on websocket protocol */
export class ServerNotificationImpl<Notifications extends Record<string, unknown>> extends AbstractNotificationHandler<Notifications> {

    protected _socket: WebSocketServer | null = null;

    /**
     * Built before the HTTP server exists, so the service can be registered at
     * application startup rather than at listen() time. Notifications broadcast
     * before attach() are lost, with a warning.
     */
    public constructor() {
        super();
    }

    /** Bind to the HTTP server once it is listening */
    public attach(server: Server): void {
        if (this._socket != null) {
            throw new Error("The notification server is already attached");
        }

        // Register a websocket from ws on the Express server
        this._socket = new WebSocketServer({ server });
        this._socket.on('connection', (ws) => {
            ws.on('message', (message) => {
                // Forward to all other clients
                this._socket?.clients.forEach((client) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(message);
                    }
                });
                // Fire notification
                const notification = JSON.parse(message.toString());
                this._fire(notification.kind, notification.data);
            });
        });
    }

    /**
     * @inheritdoc
     * Broadcasting before attach() loses the notification, with a warning: it
     * can only happen between the application starting and the server
     * listening, which is a wiring mistake rather than a runtime condition.
     */
    public override broadcast<NotificationKind extends keyof Notifications>(kind: NotificationKind, data: Notifications[NotificationKind]): void {
        if (this._socket == null) {
            console.warn(`Notification "${String(kind)}" lost: the notification server is not attached yet.`);
            return;
        }
        this._socket.clients.forEach((client) => {
            client.send(JSON.stringify({ kind: kind, data: data }));
        });
    }

}