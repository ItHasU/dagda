/**
 * The login page (FEATURES §7, §8).
 *
 * Rendered by the server, self-contained, and served before anything else is
 * reachable. That is the point: it is the one page an anonymous visitor gets,
 * so it must not depend on the client bundle, which stays behind the gate.
 *
 * The styles are inline and written against the design system tokens, with a
 * fallback value each. When the framework stylesheet lands (ROADMAP tranche 1)
 * this page picks up the theme by dropping the fallbacks — until then it is
 * readable on its own, which a page nobody can get past has to be.
 */

export interface LoginPageParams {
    /** Pre-filled after a failed attempt, so the login does not have to be retyped */
    login?: string;
    /** Displayed above the form */
    error?: string;
    /** Displayed above the form, for a first visit on a fresh database */
    notice?: string;
    /** Shown in the title bar */
    title?: string;
}

/**
 * Escape text going into HTML.
 *
 * The login is echoed back into the form after a failure, so it is attacker
 * controlled text landing in the page — the textbook injection point.
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function renderLoginPage(params: LoginPageParams): string {
    const title = escapeHtml(params.title ?? "Connexion");
    const login = escapeHtml(params.login ?? "");
    const error = params.error == null ? "" :
        `<p class="message error" role="alert">${escapeHtml(params.error)}</p>`;
    const notice = params.notice == null ? "" :
        `<p class="message notice">${escapeHtml(params.notice)}</p>`;

    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
    :root {
        color-scheme: light dark;
        --bg: var(--color-bg, #14161a);
        --surface: var(--color-surface, #1c1f26);
        --text: var(--color-text, #e6e8ec);
        --muted: var(--color-text-muted, #9aa1ad);
        --border: var(--color-border, #2b3038);
        --accent: var(--color-accent, #5b8def);
        --danger: var(--color-danger, #e5534b);
    }
    * { box-sizing: border-box; }
    body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bg);
        color: var(--text);
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    form {
        width: min(22rem, calc(100vw - 2rem));
        padding: 2rem;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 0.75rem;
    }
    h1 { margin: 0 0 1.5rem; font-size: 1.25rem; font-weight: 600; }
    label { display: block; margin-bottom: 0.375rem; font-size: 0.875rem; color: var(--muted); }
    input {
        width: 100%;
        margin-bottom: 1rem;
        padding: 0.625rem 0.75rem;
        background: var(--bg);
        color: inherit;
        border: 1px solid var(--border);
        border-radius: 0.5rem;
        font: inherit;
    }
    input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    button {
        width: 100%;
        padding: 0.625rem;
        background: var(--accent);
        color: #fff;
        border: 0;
        border-radius: 0.5rem;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
    }
    .message { margin: 0 0 1rem; padding: 0.625rem 0.75rem; border-radius: 0.5rem; font-size: 0.875rem; }
    .error { background: color-mix(in srgb, var(--danger) 15%, transparent); color: var(--danger); }
    .notice { background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); }
</style>
</head>
<body>
<form method="post" action="/login">
    <h1>${title}</h1>
    ${error}${notice}
    <label for="login">Identifiant</label>
    <input id="login" name="login" value="${login}" autocomplete="username" autofocus required>
    <label for="password">Mot de passe</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Se connecter</button>
</form>
</body>
</html>`;
}
