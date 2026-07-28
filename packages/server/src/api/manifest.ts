import { ManifestOrigin, APIType } from "@dagda/shared/src/api/types";

/**
 * Process-wide list of every route/action registered via `apiRegister`/
 * `actionRegister` (Dagda FEATURES §11.2) — what makes `dagda.system`/
 * `dagda.api` and `dagda.help()` enumerable and self-documenting
 * client-side, instead of a proxy that only works if you already know a
 * name to call.
 *
 * Populated once per registration, at server boot — not per-request. There
 * is deliberately no "unregister": nothing in this framework ever
 * de-registers a route after boot.
 */
export type ManifestEntryKind = "route" | "action";

export interface ManifestEntry {
    name: string;
    kind: ManifestEntryKind;
    /** The framework itself ("system") or the application ("app") — what splits `dagda.system` from `dagda.api` */
    origin: ManifestOrigin;
    /** Where it may be called from (FEATURES §5 refactor) */
    type: APIType;
    /**
     * Permission required to call it, if any (mirrors `RegisterAPIOptions.permission`).
     * Only the plain-string form is recorded here — a permission function
     * can't be displayed, so an entry gated by one simply shows none.
     */
    permission?: string;
    /** Free-text explanation supplied by the developer at registration time, surfaced by `dagda.help()` */
    description?: string;
}

const _entries: ManifestEntry[] = [];

export function registerManifestEntry(entry: ManifestEntry): void {
    _entries.push(entry);
}

/** @returns every route/action registered so far — a snapshot, not a live view */
export function getManifest(): ManifestEntry[] {
    return [..._entries];
}
