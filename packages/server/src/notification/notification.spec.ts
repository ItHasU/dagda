import { TEST_MODEL } from "@dagda/shared/src/entities/_data";
import express, { Express } from "express";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import { WebSocket } from "ws";
import { AuthHandler } from "../auth";
import { RoleStore } from "../auth/roles";
import { UserStore } from "../auth/users";
import { FRAMEWORK_MIGRATIONS } from "../sql/framework.migrations";
import { applyMigrations } from "../sql/migrations";
import { createTestDatabase, TestDatabase } from "../test/pg.fixture";
import { ServerNotificationImpl } from "./notification.impl";

const available = inject("databaseAvailable");

interface TestEvents extends Record<string, unknown> {
    ping: string;
}

/** Real HTTP + websocket server, real accounts, real cookies — this is the exit-gate plumbing (ROADMAP tranche 4) */
describe.runIf(available)("Server notifications", () => {

    let db: TestDatabase;
    let users: UserStore;
    let app: Express;
    let server: Server;
    let notification: ServerNotificationImpl<TestEvents>;
    let baseUrl: string;
    let wsUrl: string;

    beforeEach(async () => {
        db = await createTestDatabase("notifications");
        await applyMigrations(db.runner, TEST_MODEL, FRAMEWORK_MIGRATIONS, "framework");
        users = new UserStore(db.runner, new RoleStore(db.runner));

        app = express();
        app.use(express.urlencoded({ extended: false }));
        const auth = new AuthHandler({ app, users, log: () => { } });
        // Registered after AuthHandler's own catch-all: reachable only once
        // authenticated, exactly like any other route in a real app — this is
        // how the test reads back the real session id a login produced,
        // without parsing the signed cookie by hand.
        app.get("/whoami", (req, res) => { res.json({ sessionId: req.sessionID }); });

        notification = new ServerNotificationImpl<TestEvents>();

        server = app.listen(0);
        await new Promise<void>((resolve) => server.once("listening", resolve));
        const port = (server.address() as { port: number }).port;
        baseUrl = `http://127.0.0.1:${port}`;
        wsUrl = `ws://127.0.0.1:${port}`;

        notification.attach(server, { sessionParser: auth.sessionParser, users });
    });

    afterEach(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await db?.dispose();
    });

    /** @returns the session cookie for a freshly logged-in account */
    async function loginAs(login: string, password: string): Promise<string> {
        const res = await fetch(`${baseUrl}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            redirect: "manual",
            body: `login=${encodeURIComponent(login)}&password=${encodeURIComponent(password)}`
        });
        const cookie = res.headers.getSetCookie()[0];
        if (cookie == null) {
            throw new Error(`Login as "${login}" failed: no session cookie in the response`);
        }
        return cookie.split(";")[0]!;
    }

    /** @returns the real session id behind a cookie, read back from the server rather than parsed out of the signed cookie */
    async function sessionIdOf(cookie: string): Promise<string> {
        const res = await fetch(`${baseUrl}/whoami`, { headers: { Cookie: cookie } });
        const body = await res.json() as { sessionId: string };
        return body.sessionId;
    }

    /** Opens a websocket with a session cookie and collects every message it receives */
    function connect(cookie?: string): Promise<{ ws: WebSocket, messages: { kind: string, data: unknown }[] }> {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(wsUrl, cookie == null ? undefined : { headers: { Cookie: cookie } });
            const messages: { kind: string, data: unknown }[] = [];
            ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
            ws.once("open", () => resolve({ ws, messages }));
            ws.once("error", reject);
        });
    }

    function closeCodeOf(ws: WebSocket): Promise<number> {
        return new Promise((resolve) => ws.once("close", (code) => resolve(code)));
    }

    async function settle(): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, 150));
    }

    /**
     * A socket's `'open'` event fires as soon as the handshake completes —
     * before the server has finished resolving its session (a real DB
     * lookup, `_resolveRecipient()`). Broadcasting immediately after
     * `connect()` would be racy; wait for the server to actually have
     * resolved as many recipients as the test just opened.
     */
    async function waitForRecipients(count: number): Promise<void> {
        const recipients = (notification as unknown as { _recipients: Map<unknown, unknown> })._recipients;
        const deadline = Date.now() + 2000;
        while (recipients.size < count) {
            if (Date.now() > deadline) {
                throw new Error(`Timed out waiting for ${count} resolved recipient(s), got ${recipients.size}`);
            }
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
    }

    it("delivers a broadcast only to the recipients the filter selects", async () => {
        const alice = await users.create({ login: "alice", password: "hunter2" });
        await users.create({ login: "bob", password: "hunter2" });

        const { ws: aliceWs, messages: aliceMessages } = await connect(await loginAs("alice", "hunter2"));
        const { ws: bobWs, messages: bobMessages } = await connect(await loginAs("bob", "hunter2"));
        await waitForRecipients(2);

        notification.broadcast("ping", "hello", (user) => user.id === alice.id);
        await settle();

        expect(aliceMessages).toEqual([{ kind: "ping", data: "hello" }]);
        expect(bobMessages).toEqual([]);

        aliceWs.close();
        bobWs.close();
    });

    it("delivers to everyone when no filter is given, unchanged from before tranche 4", async () => {
        await users.create({ login: "alice", password: "hunter2" });
        await users.create({ login: "bob", password: "hunter2" });

        const { ws: aliceWs, messages: aliceMessages } = await connect(await loginAs("alice", "hunter2"));
        const { ws: bobWs, messages: bobMessages } = await connect(await loginAs("bob", "hunter2"));
        await waitForRecipients(2);

        notification.broadcast("ping", "hello");
        await settle();

        expect(aliceMessages).toEqual([{ kind: "ping", data: "hello" }]);
        expect(bobMessages).toEqual([{ kind: "ping", data: "hello" }]);

        aliceWs.close();
        bobWs.close();
    });

    it("excludes the writer's own session", async () => {
        await users.create({ login: "alice", password: "hunter2" });
        const cookie = await loginAs("alice", "hunter2");
        const sessionId = await sessionIdOf(cookie);
        const { ws, messages } = await connect(cookie);
        await waitForRecipients(1);

        notification.broadcast("ping", "hello", undefined, sessionId);
        await settle();

        expect(messages).toEqual([]);
        ws.close();
    });

    it("refuses a websocket upgrade with no session", async () => {
        const ws = await connect(undefined).catch(() => null);
        // Some environments fire 'open' before the immediate server-side
        // close reaches the client; either outcome is fine as long as the
        // socket ends up closed with 1008 and never resolves as a member of
        // any future broadcast.
        const code = ws == null ? undefined : await closeCodeOf(ws.ws);
        if (ws != null) {
            expect(code).toBe(1008);
        }
    });

    it("stops delivering to a socket once it disconnects", async () => {
        const alice = await users.create({ login: "alice", password: "hunter2" });
        const { ws, messages } = await connect(await loginAs("alice", "hunter2"));
        ws.close();
        await settle();

        notification.broadcast("ping", "hello", (user) => user.id === alice.id);
        await settle();

        expect(messages).toEqual([]);
    });

});
