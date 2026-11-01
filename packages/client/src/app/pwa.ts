/**
 * Registration of the framework's service worker (FEATURES §8, PWA).
 *
 * The worker itself is `@dagda/build/pwa/sw.js`, emitted at the root of the
 * bundle; the server serves it, with the manifest and icons, before the
 * session gate.
 */

/** URL of the worker, at the root so its scope is the whole application */
export const SERVICE_WORKER_URL = "/sw.js";

/**
 * Registers the service worker when the browser allows it: a secure context
 * (HTTPS, or `localhost`) with the Service Worker API.
 *
 * @returns whether it was registered. A failure is logged, never thrown — the
 *          application works the same without it, it is just not installable.
 */
export async function registerServiceWorker(env: { navigator: Navigator, isSecureContext: boolean } = window): Promise<boolean> {
    if (!env.isSecureContext || !("serviceWorker" in env.navigator)) {
        return false;
    }
    try {
        await env.navigator.serviceWorker.register(SERVICE_WORKER_URL);
        return true;
    } catch (error) {
        console.warn("Service worker registration failed", error);
        return false;
    }
}
