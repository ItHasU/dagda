import { THEME_STORAGE_KEY } from "./service";

/**
 * Applies the remembered theme before anything else runs (ROADMAP tranche
 * 4) — imported as the literal first line of `app/index.ts`, ahead of the
 * `../styles/index.css` import.
 *
 * That ordering is what makes this flash-free without an inline `<script>`
 * in `index.html` (which `specs/navigation.md` §6.1 reserves for the one
 * `<dagda-app>` tag, and which the framework has no way to inject anyway —
 * its whole surface is the bundle): `style-loader` injects the shell's CSS
 * *from the bundle itself*, so there is no themed pixel painted before this
 * module has already run. An id the app no longer declares degrades to the
 * default for free — `themes.css`'s `:root, [data-theme="nocturne"]`
 * selector matches nothing for an unknown id, `:root` still does.
 */
try {
    const stored = window.localStorage?.getItem(THEME_STORAGE_KEY);
    if (stored != null) {
        document.documentElement.dataset["theme"] = stored;
    }
} catch {
    // Storage denied outright — the default theme paints instead, same
    // fallback ThemeRegistry.set() uses when it can't remember either.
}
