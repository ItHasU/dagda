import { UserStore } from "@dagda/server/src/auth/users";
import { createTestDatabase, TEST_DB_URL, TestDatabase } from "@dagda/server/src/test/pg.fixture";
import { UserInfo } from "@dagda/shared/src/auth/types";
import { OperationType, SQLOperation, SQLTransactionData, SQLTransactionResult } from "@dagda/shared/src/sql/transaction";
import { RequestOptionsFromClient } from "@dagda/server/src/api";
import { Express } from "express";
import { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import { APP_CONTEXT_ADAPTER, AppContexts } from "@dagda-app/shared/src/entities/contexts";
import { APP_MODEL, PROJECT_STATUS } from "@dagda-app/shared/src/entities/model";
import { AppEntityTypes } from "@dagda-app/shared/src/entities/types";
import { ServerApp } from "./app";

const available = inject("databaseAvailable");

/**
 * End-to-end coverage of `contentRegister` as wired into the boilerplate
 * (ROADMAP tranche 5, "Contenus binaires volumineux hors cache"): a real
 * `ServerApp`, a real HTTP server, real cookies — the same posture
 * `packages/server/src/notification/notification.spec.ts` uses for the
 * equivalent framework-level check, because a conditional GET's 304 and a
 * cross-account 404 are genuinely HTTP-level behaviour, not something a
 * direct method call can observe. `packages/server/src/content/index.spec.ts`
 * already covers the mechanism itself (caching, streaming) against a fake
 * resolver; what only this file can prove is that the boilerplate's own
 * resolver — `ServerApp._resolveProjectCover()` — really puts `userId` in
 * the query, the same rigor `app.spec.ts` exercises for `_fetch()`.
 */
describe.runIf(available)("bootstrap ServerApp — projectCover content route", () => {

    let db: TestDatabase;
    let app: ServerApp;
    let server: Server;
    let baseUrl: string;
    let owner: UserInfo;
    let projectId: number;

    beforeEach(async () => {
        db = await createTestDatabase("content");

        const url = new URL(TEST_DB_URL);
        url.searchParams.set("options", `-c search_path=${db.schema}`);
        process.env["APP_PORT"] = "0";
        process.env["APP_BASE_URL"] = "http://localhost";
        process.env["APP_DATABASE_URL"] = url.toString();

        app = new ServerApp({ staticFolder: "." }, APP_MODEL, APP_CONTEXT_ADAPTER);
        await (app as unknown as { migrate: () => Promise<void> }).migrate();

        const users: UserStore = (app as unknown as { _users: UserStore })._users;
        owner = (await users.getById((await users.create({ login: "alice", password: "hunter2" })).id))!;
        // Just needs to exist so `loginAs("bob", ...)` below succeeds — the
        // point of the "stranger" test is that bob's account owns no
        // project at all, so nothing further is asserted about it here.
        await users.create({ login: "bob", password: "hunter2" });

        // Real listen(), not the framework's own `AbstractServerApp.listen()`:
        // that one also starts the websocket notification server and logs to
        // the console, neither of which this test needs — the express app it
        // wraps already has every route (including our content one)
        // registered by the time the constructor above returns.
        const expressApp: Express = (app as unknown as { _app: Express })._app;
        server = expressApp.listen(0);
        await new Promise<void>((resolveListen) => server.once("listening", resolveListen));
        const port = (server.address() as { port: number }).port;
        baseUrl = `http://127.0.0.1:${port}`;

        function submitAs(user: UserInfo, operations: SQLOperation<AppEntityTypes, keyof AppEntityTypes>[]): Promise<SQLTransactionResult> {
            const options: RequestOptionsFromClient = {
                type: "client",
                request: {} as RequestOptionsFromClient["request"],
                response: {} as RequestOptionsFromClient["response"],
                user
            };
            const transactionData: SQLTransactionData<AppEntityTypes, AppContexts> = { operations, contexts: [] };
            return (app as unknown as {
                _submit: (t: SQLTransactionData<AppEntityTypes, AppContexts>, r: RequestOptionsFromClient) => Promise<SQLTransactionResult>
            })._submit(transactionData, options);
        }

        const result = await submitAs(owner, [{
            type: OperationType.INSERT,
            options: { table: "projects", item: { id: -1, name: "Trip", description: "", userId: owner.id, status: PROJECT_STATUS.values.ACTIVE } as never }
        }]);
        projectId = result.updatedIds[-1]!;
    });

    afterEach(async () => {
        await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
        await db?.dispose();
    });

    /** @returns the session cookie for a freshly logged-in account, the same way `notification.spec.ts` reads one back */
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

    it("serves the owner's project cover with a real image type and a Cache-Control header", async () => {
        const cookie = await loginAs("alice", "hunter2");
        const res = await fetch(`${baseUrl}/content/projectCover/${projectId}`, { headers: { Cookie: cookie } });

        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("image/svg+xml");
        expect(res.headers.get("cache-control")).toBeTruthy();
        expect(res.headers.get("etag")).toBeTruthy();
        expect(await res.text()).toContain("<svg");
    });

    it("answers 304 to a second request carrying the ETag the first one returned", async () => {
        const cookie = await loginAs("alice", "hunter2");
        const first = await fetch(`${baseUrl}/content/projectCover/${projectId}`, { headers: { Cookie: cookie } });
        const etag = first.headers.get("etag");
        expect(etag).toBeTruthy();

        const second = await fetch(`${baseUrl}/content/projectCover/${projectId}`, {
            headers: { Cookie: cookie, "If-None-Match": etag! }
        });

        expect(second.status).toBe(304);
        expect(await second.text()).toBe("");
    });

    it("refuses a stranger's request for someone else's project cover — an access test, not just a display one", async () => {
        const cookie = await loginAs("bob", "hunter2");
        const res = await fetch(`${baseUrl}/content/projectCover/${projectId}`, { headers: { Cookie: cookie } });

        // 404, not 403: the boilerplate's resolver looks the project up with
        // `AND "userId" = $2` in the query (same rigor as `_fetch()`), so a
        // project belonging to someone else is indistinguishable from one
        // that does not exist — see `ServerApp._resolveProjectCover()`.
        expect(res.status).toBe(404);
    });

    it("never reaches the route at all for an anonymous request — AuthHandler's own gate redirects to /login first", async () => {
        const res = await fetch(`${baseUrl}/content/projectCover/${projectId}`, { redirect: "manual" });

        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("/login");
    });

});
