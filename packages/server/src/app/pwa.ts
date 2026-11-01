import express, { NextFunction, Request, Response } from "express";
import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

/**
 * Progressive Web App support (FEATURES §8): the few files a browser needs to
 * install the application, served **before the session gate**.
 *
 * The browser fetches the manifest without credentials, and the home-screen
 * icon is fetched the same way: behind the gate, both would be redirected to
 * /login and the application could not be installed. Only these files are
 * opened — never the bundle, which stays behind the gate like the rest of
 * the static folder.
 */

/** Where the application's manifest is published (the `assets/` folder the client build copies) */
export const PWA_MANIFEST_PATH = "/assets/manifest.json";
/** The service worker emitted by `@dagda/build` at the root of the bundle (scope `/`) */
export const PWA_SERVICE_WORKER_PATH = "/sw.js";
/** iOS reads its home-screen icon from `<link rel="apple-touch-icon">`, never from the manifest */
export const PWA_APPLE_TOUCH_ICON_PATH = "/assets/icon.png";

/**
 * The public URL paths: the manifest, the service worker, the Apple icon and
 * every icon the manifest declares (`icons[].src`, relative to the manifest).
 * A missing or unreadable manifest only leaves its icons out.
 */
export function pwaPublicPaths(staticFolder: string): Set<string> {
    const paths = new Set([PWA_MANIFEST_PATH, PWA_SERVICE_WORKER_PATH, PWA_APPLE_TOUCH_ICON_PATH]);
    try {
        const manifest = JSON.parse(readFileSync(resolve(staticFolder, `.${PWA_MANIFEST_PATH}`), "utf8")) as { icons?: Array<{ src?: unknown }> };
        for (const icon of manifest.icons ?? []) {
            if (typeof icon.src === "string") {
                paths.add(new URL(icon.src, `http://app${PWA_MANIFEST_PATH}`).pathname);
            }
        }
    } catch {
        // No manifest (yet): the application is simply not installable.
    }
    return paths;
}

/**
 * Router answering the public PWA files from `staticFolder`. The list is
 * read on each request, so a client rebuilt under a running server is seen
 * at once; anything else falls through to the gate.
 */
export function pwaRouter(staticFolder: string): express.Router {
    const root = resolve(staticFolder);
    const router = express.Router();
    router.get(/.*/, (req: Request, res: Response, next: NextFunction) => {
        if (!pwaPublicPaths(root).has(req.path)) {
            next();
            return;
        }
        const file = resolve(root, `.${decodeURIComponent(req.path)}`);
        if (!file.startsWith(root + sep) || !existsSync(file)) {
            next();
            return;
        }
        if (req.path === PWA_SERVICE_WORKER_PATH) {
            // Checked by the browser at each navigation: a stale copy would pin an old worker.
            res.setHeader("Cache-Control", "no-cache");
        } else if (req.path === PWA_MANIFEST_PATH) {
            res.type("application/manifest+json");
        }
        res.sendFile(file);
    });
    return router;
}

/** `<head>` lines of a page served outside the bundle (login, invitation), so it can be installed too */
export const PWA_HEAD = `<link rel="manifest" href="${PWA_MANIFEST_PATH}">
<link rel="apple-touch-icon" href="${PWA_APPLE_TOUCH_ICON_PATH}">
<meta name="apple-mobile-web-app-capable" content="yes">
<script>if ("serviceWorker" in navigator && window.isSecureContext) { navigator.serviceWorker.register("${PWA_SERVICE_WORKER_PATH}").catch(function () {}); }</script>`;
