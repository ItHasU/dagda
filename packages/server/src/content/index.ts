import { UserInfo } from "@dagda/shared/src/auth/types";
import { IRouter, Request, Response } from "express";
import { Readable } from "node:stream";

/**
 * Serving binary content outside the entities cache (ROADMAP tranche 5,
 * "Contenus binaires volumineux hors cache"): `apiRegister` answers with a
 * JSON body built from a return value, which is the wrong shape for a large
 * file — it would have to be base64-encoded into a JSON string, buffered
 * whole in memory on both ends, and would never benefit from a browser's own
 * HTTP cache the way an `<img>`/`<video>` `src` does. This is the dedicated
 * counterpart: a plain `GET`, streamed, cacheable.
 */

/**
 * One piece of content, resolved by the application.
 *
 * Deliberately thin: the framework does not know or care whether the bytes
 * come from disk, object storage, or somewhere else — only that enough
 * metadata exists up front to negotiate HTTP caching *without* reading them,
 * and that they can be opened as a stream on the rare request that actually
 * needs the body.
 */
export interface ContentDescriptor {
    /** Sent as the response's `Content-Type` — never sniffed. */
    contentType: string;
    /**
     * When the content was last changed. Backs `Last-Modified` and, combined
     * with `size`, the `ETag` this module derives — a resolver never has to
     * hash a potentially huge body itself just to support conditional GETs.
     */
    lastModified: Date;
    /** Sent as `Content-Length` when known; omitted (chunked) when it isn't. */
    size?: number;
    /**
     * Opens the actual bytes. Called at most once per request, and only for
     * one that really needs a body — never for a request `contentRegister`
     * resolves as 304, which is the point: a resolver may do a real
     * disk/network read here without worrying about paying for it twice.
     */
    open(): Readable;
}

/**
 * @returns the content for `id`, as seen by `user` — or `null` when it does
 * not exist *or* does not belong to `user`. See `contentRegister`'s doc for
 * why those two cases deliberately share one answer.
 */
export type ContentResolver = (user: UserInfo, id: string) => Promise<ContentDescriptor | null>;

export interface ContentRegisterOptions {
    /**
     * Sent as `Cache-Control` on every 200 and every 304.
     *
     * Defaults to "private, no-cache": a browser may keep the bytes, but
     * must always revalidate with the server before reusing them. That
     * revalidation is a full conditional request, which re-runs `resolver`
     * — including its ownership check — so access revoked after the first
     * fetch (a project transferred, a share removed) stops being served the
     * moment it happens, not whenever a longer `max-age` would have expired.
     */
    cacheControl?: string;
}

const DEFAULT_CACHE_CONTROL = "private, no-cache";

/** A weak ETag derived from what the resolver already knows — never from reading the body. */
function computeETag(descriptor: Pick<ContentDescriptor, "lastModified" | "size">): string {
    return `W/"${descriptor.lastModified.getTime()}-${descriptor.size ?? 0}"`;
}

/** First value of a header that express may hand back as a single string or an array of them. */
function headerValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

/** @returns whether `etag` appears in the comma-separated tokens of an If-None-Match header (RFC 7232 §2.3.2), "*" included. */
function matchesETag(ifNoneMatch: string, etag: string): boolean {
    return ifNoneMatch.split(",").some((token) => {
        const trimmed = token.trim();
        return trimmed === "*" || trimmed === etag;
    });
}

/**
 * Registers a `GET /content/:name/:id` route serving one piece of binary
 * content (ROADMAP tranche 5) — the counterpart of `apiRegister` for a
 * payload too large, or too binary, to ever be a JSON response.
 *
 * Two things this does that `apiRegister` never has to:
 *
 * - **HTTP caching.** A resolved descriptor is never assumed fresh: this
 *   checks `If-None-Match` (falling back to `If-Modified-Since`) against it
 *   and answers 304 without ever calling `descriptor.open()` — the other
 *   half of the ROADMAP line this exists for, the part a route that always
 *   answers 200 would not have solved.
 * - **Streaming.** The body is piped straight from `descriptor.open()` to
 *   the response; it is never buffered whole in the process, which is what
 *   "volumineux" rules out.
 *
 * Authorization is deliberately *not* an option here, unlike `apiRegister`'s
 * `permission`: whether a given id belongs to the caller cannot be decided
 * without reading the row, so — same posture as `ServerApp._fetch()` in the
 * boilerplate, `WHERE "userId" = $2` in the query itself, not a check
 * bolted on after — that decision belongs entirely to `resolver`. A
 * resolver that finds nothing, and one that finds someone else's row,
 * return `null` either way, and this route always answers 404 for `null`,
 * never 403: the caller must not be able to tell "does not exist" from
 * "not yours".
 *
 * Not registered in the route manifest (`registerManifestEntry`), unlike
 * `apiRegister`: `dagda.system`/`dagda.api` dispatch every manifest entry
 * through `apiCall`'s POST-JSON `fetch`, which cannot express "open this id
 * as a GET url" — a content route is consumed as `<img src>`/`<video src>`
 * (see `@dagda/client/src/api/content`), never called like a route.
 */
export function contentRegister(router: IRouter, name: string, resolver: ContentResolver, options?: ContentRegisterOptions): void {
    const cacheControl = options?.cacheControl ?? DEFAULT_CACHE_CONTROL;

    router.get(`/content/${name}/:id`, async (req: Request, res: Response) => {
        // Same gate apiRegister has, and for the same reason: hiding a link
        // is not access control, the check has to hold on the route itself.
        // In practice AuthHandler's own catch-all middleware already refuses
        // an anonymous request before this handler ever runs — this is
        // defense in depth, not the actual gate.
        const user = req.user;
        if (user == null) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        const id = req.params["id"]!;
        let descriptor: ContentDescriptor | null;
        try {
            descriptor = await resolver(user, id);
        } catch (err) {
            console.error(`Error while resolving content "${name}" (id=${id}):`, err);
            res.status(500).json({ error: new String(err) });
            return;
        }

        if (descriptor == null) {
            // Not found and not authorized get the same answer on purpose —
            // see the doc comment above — never a 403 that would confirm the
            // id exists at all.
            res.status(404).json({ error: "Not found" });
            return;
        }

        // Sent on both the 304 below and the 200 further down: a revalidation
        // response still has to carry the cache metadata, or the browser has
        // nothing to compare on the next round.
        const etag = computeETag(descriptor);
        res.set("Cache-Control", cacheControl);
        res.set("ETag", etag);
        res.set("Last-Modified", descriptor.lastModified.toUTCString());

        const ifNoneMatch = headerValue(req.headers["if-none-match"]);
        const ifModifiedSince = headerValue(req.headers["if-modified-since"]);
        // If-None-Match wins when both are present (RFC 7232 §3.3): it is the
        // strong signal, If-Modified-Since is only the second-resort fallback
        // for a client that never learned an ETag in the first place.
        const notModified = ifNoneMatch != null
            ? matchesETag(ifNoneMatch, etag)
            : ifModifiedSince != null
                && Math.floor(descriptor.lastModified.getTime() / 1000) <= Math.floor(new Date(ifModifiedSince).getTime() / 1000);

        if (notModified) {
            res.status(304).end();
            return;
        }

        res.set("Content-Type", descriptor.contentType);
        if (descriptor.size != null) {
            res.set("Content-Length", String(descriptor.size));
        }

        const stream = descriptor.open();
        stream.on("error", (err) => {
            console.error(`Error while streaming content "${name}" (id=${id}):`, err);
            res.destroy(err);
        });
        stream.pipe(res);
    });
}
