import { APICollection } from "@dagda/shared/src/api/types";
import { UserInfo } from "@dagda/shared/src/auth/types";
import { IRouter, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { apiRegister } from "./index";

/** Minimal stand-in for Express: `apiRegister` only ever calls `router.post`. */
function fakeRouter() {
    const handlers = new Map<string, (req: Partial<Request>, res: Response) => Promise<void>>();
    const router = {
        post: (path: string, handler: (req: Partial<Request>, res: Response) => Promise<void>) => {
            handlers.set(path, handler);
            return router;
        }
    } as unknown as IRouter;
    return { router, handlers };
}

/** Captures status/body the way an Express response would, JSON round-tripped like the real wire response. */
function fakeResponse() {
    const res = {
        statusCode: 200,
        body: undefined as unknown,
        status(code: number) { res.statusCode = code; return res; },
        json(body: unknown) { res.body = JSON.parse(JSON.stringify(body)); return res; }
    };
    return res as unknown as Response & { statusCode: number; body: unknown };
}

function user(overrides: Partial<UserInfo> = {}): UserInfo {
    return { id: 1, login: "alice", displayName: "Alice", isSuperAdmin: false, enabled: true, roleId: null, permissions: [], ...overrides };
}

interface TestAPI extends APICollection {
    ping: () => string;
}

describe("apiRegister", () => {

    it("refuses an anonymous caller with 401", async () => {
        const { router, handlers } = fakeRouter();
        apiRegister<TestAPI, "ping">(router, "ping", async () => "pong");
        const res = fakeResponse();

        await handlers.get("/ping")!({ body: [] }, res);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: "Unauthorized" });
    });

    it("calls the callback and returns its result when no permission is declared", async () => {
        const { router, handlers } = fakeRouter();
        apiRegister<TestAPI, "ping">(router, "ping", async () => "pong");
        const res = fakeResponse();

        await handlers.get("/ping")!({ body: [], user: user() }, res);

        expect(res.body).toBe("pong");
    });

    it("refuses a caller lacking the declared permission, without calling the callback", async () => {
        const { router, handlers } = fakeRouter();
        const callback = vi.fn(async () => "secret");
        apiRegister<TestAPI, "ping">(router, "ping", callback, { permission: "settings.manage" });
        const res = fakeResponse();

        await handlers.get("/ping")!({ body: [], user: user({ permissions: [] }) }, res);

        expect(callback).not.toHaveBeenCalled();
        // Same response shape as the actions layer's manual `requirePermission`
        // throw (packages/server/src/app/index.ts), since a permission
        // refusal here is thrown into the very same catch block.
        expect(res.statusCode).toBe(500);
        expect(res.body).toEqual({ error: "Error: Missing permission: settings.manage" });
    });

    it("allows a caller holding the declared permission", async () => {
        const { router, handlers } = fakeRouter();
        apiRegister<TestAPI, "ping">(router, "ping", async () => "pong", { permission: "settings.manage" });
        const res = fakeResponse();

        await handlers.get("/ping")!({ body: [], user: user({ permissions: ["settings.manage"] }) }, res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toBe("pong");
    });

    it("lets a super-admin bypass a declared permission", async () => {
        const { router, handlers } = fakeRouter();
        apiRegister<TestAPI, "ping">(router, "ping", async () => "pong", { permission: "settings.manage" });
        const res = fakeResponse();

        await handlers.get("/ping")!({ body: [], user: user({ isSuperAdmin: true, permissions: [] }) }, res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toBe("pong");
    });

});
