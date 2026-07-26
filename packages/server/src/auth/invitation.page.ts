/**
 * The invitation / password-reset page (FEATURES §7, §8).
 *
 * Same shape as the login page for the same reason: served before the client
 * bundle is reachable, self-contained, no dependency on the gate it sits in
 * front of. One template, two states — a valid token gets a form, an
 * invalid or expired one gets a message and nowhere else to go but /login.
 */

export interface InvitationPageParams {
    /** Whether the token in the URL still resolves to a pending invitation */
    valid: boolean;
    /** Login of the account, shown so the person confirms it is theirs */
    login?: string;
    /** Displayed above the form */
    error?: string;
    /** Shown in the title bar */
    title?: string;
}

/** Escape text going into HTML — the login is attacker-controlled once stored */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function renderInvitationPage(params: InvitationPageParams): string {
    const title = escapeHtml(params.title ?? "Choisir un mot de passe");
    const error = params.error == null ? "" :
        `<p class="message error" role="alert">${escapeHtml(params.error)}</p>`;

    const body = !params.valid
        ? `<h1>Lien invalide</h1>
           <p class="message error" role="alert">Ce lien d'invitation n'existe pas ou a expiré. Demandez-en un nouveau à un administrateur.</p>
           <a href="/login">Retour à la connexion</a>`
        : `<h1>${title}</h1>
           <p class="message notice">Compte : ${escapeHtml(params.login ?? "")}</p>
           ${error}
           <label for="password">Nouveau mot de passe</label>
           <input id="password" name="password" type="password" autocomplete="new-password" autofocus required>
           <label for="confirm">Confirmation</label>
           <input id="confirm" name="confirm" type="password" autocomplete="new-password" required>
           <button type="submit">Valider</button>`;

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
    form, .panel {
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
    a { color: var(--accent); }
    .message { margin: 0 0 1rem; padding: 0.625rem 0.75rem; border-radius: 0.5rem; font-size: 0.875rem; }
    .error { background: color-mix(in srgb, var(--danger) 15%, transparent); color: var(--danger); }
    .notice { background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); }
</style>
</head>
<body>
${params.valid ? `<form method="post">${body}</form>` : `<div class="panel">${body}</div>`}
</body>
</html>`;
}
