import { AbstractNotificationHandler, NotificationRecipientFilter } from "@dagda/shared/src/notification/abstract.notification.handler";
import { UserInfo } from "@dagda/shared/src/auth/types";
import { RequestHandler } from "express";
import { IncomingMessage, Server } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { UserStore } from "../auth/users";

/** What `attach()` needs to resolve a websocket upgrade to the account behind it (ROADMAP tranche 4) */
export interface AttachParams {
    /** The same session middleware the HTTP routes use — an upgrade request never goes through Express's own chain */
    sessionParser: RequestHandler;
    users: UserStore;
}

/** A connected socket, alongside the account and session it resolved to at connection time */
interface Recipient {
    user: UserInfo;
    sessionId: string;
}

/** Notification server based on websocket protocol */
export class ServerNotificationImpl<Notifications extends Record<string, unknown>> extends AbstractNotificationHandler<Notifications> {

    protected _socket: WebSocketServer | null = null;

    /**
     * Populated once per connection, on the upgrade — not re-resolved on
     * every request the way `req.user` is. An account disabled mid-session
     * keeps its socket until the socket itself drops; an accepted, documented
     * gap rather than a re-resolution path nobody asked for.
     */
    protected readonly _recipients = new Map<WebSocket, Recipient>();

    public constructor() {
        super();
    }

    /** Bind to the HTTP server once it is listening */
    public attach(server: Server, params: AttachParams): void {
        if (this._socket != null) {
            throw new Error("The notification server is already attached");
        }

        // Register a websocket from ws on the Express server
        this._socket = new WebSocketServer({ server });
        this._socket.on('connection', (ws, request) => {
            this._resolveRecipient(request, params).then((recipient) => {
                if (recipient == null) {
                    // No legitimate anonymous socket exists: the HTTP gate
                    // already refuses everything else an anonymous caller
                    // could reach (Dagda FEATURES §7).
                    ws.close(1008, "Unauthorized");
                    return;
                }
                this._recipients.set(ws, recipient);
                ws.on('close', () => this._recipients.delete(ws));
            }).catch((err) => {
                console.error("Error resolving the session of a websocket connection:", err);
                ws.close(1011);
            });

            // Inbound client messages are never relayed or trusted as
            // notifications any more (ROADMAP tranche 4): a browser
            // forwarding its own message to "all other clients" was both the
            // actual leak channel for a shared/owned entity (nothing here
            // checked who the recipients were) and an unauthenticated
            // authorship hole (any logged-in browser could forge any
            // notification kind). Every real broadcast is now authored
            // server-side, by `AbstractServerApp` — see `_submit()` and the
            // MQTT ingest path.
        });
    }

    /** @returns the account and session id behind a websocket upgrade, or null if it doesn't resolve to one */
    protected _resolveRecipient(request: IncomingMessage, params: AttachParams): Promise<Recipient | null> {
        return new Promise((resolve, reject) => {
            // The canonical `ws` + `express-session` recipe: a dummy response
            // object is safe here because `saveUninitialized: false` /
            // `resave: false` mean express-session never writes to it during
            // an upgrade — it only reads/decorates the request.
            params.sessionParser(request as any, {} as any, (err) => {
                if (err != null) {
                    reject(err);
                    return;
                }
                const userId = (request as any).session?.userId;
                const sessionId = (request as any).sessionID as string | undefined;
                if (userId == null || sessionId == null) {
                    resolve(null);
                    return;
                }
                params.users.getById(userId).then((user) => {
                    resolve(user != null && user.enabled ? { user, sessionId } : null);
                }).catch(reject);
            });
        });
    }

    /**
     * @inheritdoc
     * Broadcasting before attach() loses the notification, with a warning: it
     * can only happen between the application starting and the server
     * listening, which is a wiring mistake rather than a runtime condition.
     */
    public override broadcast<NotificationKind extends keyof Notifications>(
        kind: NotificationKind,
        data: Notifications[NotificationKind],
        recipients?: NotificationRecipientFilter,
        excludeSessionId?: string
    ): void {
        if (this._socket == null) {
            console.warn(`Notification "${String(kind)}" lost: the notification server is not attached yet.`);
            return;
        }
        const message = JSON.stringify({ kind: kind, data: data });
        for (const [client, recipient] of this._recipients) {
            if (client.readyState !== WebSocket.OPEN) {
                continue;
            }
            if (excludeSessionId != null && recipient.sessionId === excludeSessionId) {
                continue;
            }
            if (recipients != null && !recipients(recipient.user)) {
                continue;
            }
            client.send(message);
        }
    }

}
