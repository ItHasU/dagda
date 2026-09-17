import { UserInfo } from "@dagda/shared/src/auth/types";
import { IRouter, Request } from "express";
import { Readable, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { ContentDescriptor, contentRegister } from "./index";

/** Minimal stand-in for Express: `contentRegister` only ever calls `router.get`. */
function fakeRouter() {
    const handlers = new Map<string, (req: Partial<Request>, res: FakeResponse) => Promise<void>>();
    const router = {
        get: (path: string, handler: (req: Partial<Request>, res: FakeResponse) => Promise<void>) => {
            handlers.set(path, handler);
            return router;
        }
    } as unknown as IRouter;
    return { router, handlers };
}

/**
 * A response double built on a real `Writable`, unlike `api/index.spec.ts`'s
 * `fakeResponse()`: `contentRegister` pipes a stream straight into it, and
 * only a real stream destination proves that piping actually delivers the
 * bytes, rather than merely being called.
 */
class FakeResponse extends Writable {
    public statusCode = 200;
    public jsonBody: unknown;
    public readonly headers = new Map<string, string>();
    private readonly _chunks: Buffer[] = [];

    public override _write(chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        this._chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        callback();
    }

    public status(code: number): this {
        this.statusCode = code;
        return this;
    }

    public set(key: string, value: string): this {
        this.headers.set(key.toLowerCase(), value);
        return this;
    }

    public json(body: unknown): this {
        this.jsonBody = body;
        return this;
    }

    public body(): string {
        return Buffer.concat(this._chunks).toString("utf8");
    }
}

function user(overrides: Partial<UserInfo> = {}): UserInfo {
    return { id: 1, login: "alice", displayName: "Alice", isSuperAdmin: false, enabled: true, roleId: null, permissions: [], ...overrides };
}

const LAST_MODIFIED = new Date("2026-01-01T00:00:00.000Z");

function descriptorOf(text: string, open: () => Readable = () => Readable.from(Buffer.from(text, "utf8"))): ContentDescriptor {
    return { contentType: "text/plain", lastModified: LAST_MODIFIED, size: Buffer.byteLength(text), open };
}

describe("contentRegister", () => {

    it("refuses an anonymous caller with 401, without calling the resolver", async () => {
        const { router, handlers } = fakeRouter();
        const resolver = vi.fn(async () => descriptorOf("hello"));
        contentRegister(router, "avatar", resolver);
        const res = new FakeResponse();

        await handlers.get("/content/avatar/:id")!({ params: { id: "1" }, headers: {} }, res);

        expect(res.statusCode).toBe(401);
        expect(resolver).not.toHaveBeenCalled();
    });

    it("answers 404 when the resolver finds nothing — not found and not owned share the same response", async () => {
        const { router, handlers } = fakeRouter();
        contentRegister(router, "avatar", async () => null);
        const res = new FakeResponse();

        await handlers.get("/content/avatar/:id")!({ params: { id: "1" }, headers: {}, user: user() }, res);

        expect(res.statusCode).toBe(404);
    });

    it("answers 500 without leaking the error's detail into a 200, when the resolver throws", async () => {
        const { router, handlers } = fakeRouter();
        contentRegister(router, "avatar", async () => { throw new Error("boom"); });
        const res = new FakeResponse();

        await handlers.get("/content/avatar/:id")!({ params: { id: "1" }, headers: {}, user: user() }, res);

        expect(res.statusCode).toBe(500);
    });

    it("streams the content, with its type, size and a default Cache-Control", async () => {
        const { router, handlers } = fakeRouter();
        contentRegister(router, "avatar", async () => descriptorOf("hello world"));
        const res = new FakeResponse();

        await handlers.get("/content/avatar/:id")!({ params: { id: "1" }, headers: {}, user: user() }, res);
        await new Promise((resolve) => res.on("finish", resolve));

        expect(res.statusCode).toBe(200);
        expect(res.headers.get("content-type")).toBe("text/plain");
        expect(res.headers.get("content-length")).toBe("11");
        expect(res.headers.get("cache-control")).toBe("private, no-cache");
        expect(res.headers.get("etag")).toBeDefined();
        expect(res.headers.get("last-modified")).toBe(LAST_MODIFIED.toUTCString());
        expect(res.body()).toBe("hello world");
    });

    it("honors a custom Cache-Control", async () => {
        const { router, handlers } = fakeRouter();
        contentRegister(router, "avatar", async () => descriptorOf("hi"), { cacheControl: "private, max-age=3600" });
        const res = new FakeResponse();

        await handlers.get("/content/avatar/:id")!({ params: { id: "1" }, headers: {}, user: user() }, res);
        await new Promise((resolve) => res.on("finish", resolve));

        expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
    });

    it("answers 304 to a matching If-None-Match, without ever opening the content", async () => {
        const { router, handlers } = fakeRouter();
        const open = vi.fn(() => Readable.from(Buffer.from("hello", "utf8")));
        contentRegister(router, "avatar", async () => descriptorOf("hello", open));

        const first = new FakeResponse();
        await handlers.get("/content/avatar/:id")!({ params: { id: "1" }, headers: {}, user: user() }, first);
        await new Promise((resolve) => first.on("finish", resolve));
        const etag = first.headers.get("etag")!;
        expect(open).toHaveBeenCalledTimes(1);

        const second = new FakeResponse();
        await handlers.get("/content/avatar/:id")!({ params: { id: "1" }, headers: { "if-none-match": etag }, user: user() }, second);

        expect(second.statusCode).toBe(304);
        expect(second.body()).toBe("");
        // Still present on the 304, so the browser can keep its cache entry fresh.
        expect(second.headers.get("etag")).toBe(etag);
        expect(open).toHaveBeenCalledTimes(1);
    });

    it("does not 304 an If-None-Match for a different ETag — the content changed", async () => {
        const { router, handlers } = fakeRouter();
        contentRegister(router, "avatar", async () => descriptorOf("hello"));
        const res = new FakeResponse();

        await handlers.get("/content/avatar/:id")!({ params: { id: "1" }, headers: { "if-none-match": 'W/"stale"' }, user: user() }, res);
        await new Promise((resolve) => res.on("finish", resolve));

        expect(res.statusCode).toBe(200);
        expect(res.body()).toBe("hello");
    });

    it("falls back to If-Modified-Since when there is no If-None-Match", async () => {
        const { router, handlers } = fakeRouter();
        const open = vi.fn(() => Readable.from(Buffer.from("hello", "utf8")));
        contentRegister(router, "avatar", async () => descriptorOf("hello", open));

        const notModified = new FakeResponse();
        await handlers.get("/content/avatar/:id")!(
            { params: { id: "1" }, headers: { "if-modified-since": LAST_MODIFIED.toUTCString() }, user: user() },
            notModified
        );
        expect(notModified.statusCode).toBe(304);
        expect(open).not.toHaveBeenCalled();

        const older = new Date(LAST_MODIFIED.getTime() - 1000);
        const modified = new FakeResponse();
        await handlers.get("/content/avatar/:id")!(
            { params: { id: "1" }, headers: { "if-modified-since": older.toUTCString() }, user: user() },
            modified
        );
        await new Promise((resolve) => modified.on("finish", resolve));
        expect(modified.statusCode).toBe(200);
        expect(modified.body()).toBe("hello");
    });

});
