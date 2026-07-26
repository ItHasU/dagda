import { PreferencesDirectory } from "../preferences/directory";

/** One theme the shell may switch to */
export interface ThemeInfo {
    id: string;
    /** Displayed in the theme picker */
    label: string;
}

/** The framework's own themes, both declared in `styles/themes.css` (FEATURES §8, ROADMAP tranche 4) */
export const DAGDA_THEMES: ThemeInfo[] = [
    { id: "nocturne", label: "Nocturne" },
    { id: "aurore", label: "Aurore" }
];

/**
 * Pre-first-paint mirror, read synchronously by `themes/boot.ts` before the
 * bundle's own stylesheet import runs. Same idiom as
 * `container.component.ts`'s `NAV_COLLAPSED_KEY` — a local mirror of a
 * choice whose real source is a server-held preference, kept only because
 * the preference is not known this early.
 */
export const THEME_STORAGE_KEY = "dagda.theme";

/** What `Dagda.get<ThemeService>("themes")` exposes */
export interface ThemeService {
    themes: ThemeRegistry;
}

/**
 * The available themes and the current choice (ROADMAP tranche 4).
 *
 * Reachable via `Dagda.get<ThemeService>("themes")`. Mirror-only when no app
 * declares a preference key — `set()` still switches the theme and writes
 * the mirror, it just never round-trips to the server, which is the right
 * default: Dagda must not hardcode a preference key the app never declared
 * (FEATURES §11.6, the same posture `PreferencesModel` already takes).
 */
export class ThemeRegistry {

    constructor(
        protected readonly _available: ThemeInfo[],
        protected readonly _preferences: PreferencesDirectory,
        protected readonly _preferenceKey?: string
    ) { }

    /** Every theme the app may switch to */
    public list(): ThemeInfo[] {
        return this._available;
    }

    /**
     * The theme currently applied.
     *
     * Read from the root element, not from a field of this class: `boot.ts`
     * may already have applied the mirror before this object even exists,
     * and the attribute is the one thing both agree on.
     */
    public get current(): string {
        return document.documentElement.dataset["theme"] ?? this._available[0]?.id ?? "nocturne";
    }

    /**
     * Switches theme: the root attribute, the mirror, and — if the app
     * declared a preference key — the server-held choice.
     *
     * An id outside `list()` is not rejected here: `themes.css`'s own
     * `:root, [data-theme="nocturne"]` selector already falls back to the
     * default for an id matching no block, the same behaviour `reconcile()`
     * below relies on for an id that has since been removed.
     */
    public async set(id: string): Promise<void> {
        this._apply(id);
        if (this._preferenceKey != null) {
            await this._preferences.set(this._preferenceKey, id);
        }
    }

    /**
     * Reconciles the pre-paint mirror against the real preference, once
     * `preferences.load()` has resolved (`DagdaClient.start()`).
     *
     * The preference wins on a disagreement — it changed in another browser,
     * say — but this is not validation: an id the mirror already applied
     * that turns out to match nothing is left alone here too, same fallback
     * as above.
     */
    public reconcile(): void {
        if (this._preferenceKey == null) {
            return;
        }
        const stored = this._preferences.get(this._preferenceKey);
        if (typeof stored === "string" && stored !== this.current) {
            this._apply(stored);
        }
    }

    protected _apply(id: string): void {
        document.documentElement.dataset["theme"] = id;
        try {
            window.localStorage?.setItem(THEME_STORAGE_KEY, id);
        } catch {
            // Storage can be denied outright (private browsing, blocked
            // cookies). A theme that forgets beats a theme that fails to
            // switch — same posture as NAV_COLLAPSED_KEY.
        }
    }

}
