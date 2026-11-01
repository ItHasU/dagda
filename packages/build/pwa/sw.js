/*
 * Dagda service worker (FEATURES §8, PWA), emitted at the root of the bundle
 * by `webpack-client.config.js` so its scope is the whole application.
 *
 * It caches nothing: offline mode is out of scope (FEATURES §0), and a cached
 * bundle would outlive a deployment. Its job is to make the application
 * installable and, when a page cannot be loaded at all, to say so plainly
 * instead of the browser's own error. API calls, event streams and assets are
 * left to the network untouched.
 */

const OFFLINE_PAGE = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hors ligne</title>
<style>
    :root { color-scheme: light dark; }
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1rem; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; text-align: center; }
    button { margin-top: 1rem; padding: 0.75rem 1.25rem; min-height: 2.75rem; font: inherit; border-radius: 0.5rem; cursor: pointer; }
</style>
</head>
<body>
<main>
    <h1>Hors ligne</h1>
    <p>Le serveur est injoignable. Vérifiez la connexion, puis réessayez.</p>
    <button type="button" onclick="location.reload()">Réessayer</button>
</main>
</body>
</html>`;

self.addEventListener("install", () => {
    // A new version takes over at once: there is no cache to migrate.
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
    if (event.request.mode !== "navigate") {
        return;
    }
    event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE_PAGE, {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
    })));
});
