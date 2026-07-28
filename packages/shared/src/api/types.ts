/**
 * Defines a collection of APIs.
 * @template Options - Specifies the type of options, varying based on client or server usage.
 */

export interface APICollection {
    [name: string]: (...args: any[]) => unknown;
}

/** Whether a registered API/action was declared by the framework itself or by the application (FEATURES §5 refactor) — what splits `dagda.system` from `dagda.api` in the console */
export type ManifestOrigin = "system" | "app";

/**
 * Where an API/action may be called from.
 * - `"internal"` (default): the client, a direct server-side call, a user script.
 * - `"external"`: a token-authenticated HTTP call from outside the application — declared for now, not yet enforced (no token mechanism exists yet).
 * - `"both"`: internal and external.
 */
export type APIType = "internal" | "external" | "both";