/**
 * Client-side preferences (ROADMAP tranche 3, FEATURES §11.6): loaded once,
 * read synchronously afterward, same shape as `UsersDirectory` and for the
 * same reason — a screen reading a preference during render must never await
 * a round trip for it.
 *
 * `get()` only ever needs the local cache: `getPreferences()` already
 * resolves every declared key against its default server-side, so once
 * loaded there is nothing here that isn't already a real value — the same
 * "no special case in the calling code" guarantee the server side carries.
 * Before the initial load resolves, `get()` answers undefined, the same
 * caveat `UsersDirectory.getDisplayName()` documents for its own null.
 */
export class PreferencesDirectory {

    private _values: Record<string, unknown> | null = null;

    /**
     * @param _fetch how the current values are obtained — `getPreferences()` in practice
     * @param _update how a change is sent — `setPreference()` in practice
     * Both injected so a test never needs a real server.
     */
    public constructor(
        private readonly _fetch: () => Promise<Record<string, unknown>>,
        private readonly _update: (key: string, value: unknown) => Promise<void>
    ) { }

    /** Loads the preferences once, called during `DagdaClient.start()`'s bootstrap */
    public async load(): Promise<void> {
        try {
            this._values = await this._fetch();
        } catch (err) {
            // Same posture as UsersDirectory: no session yet, or the request
            // failed outright — get() keeps answering undefined rather than
            // breaking the whole bootstrap over a preference nothing needs yet.
            console.error("Error while loading the preferences", err);
        }
    }

    /** @returns the current value of a preference, or undefined before the initial load resolves */
    public get(key: string): unknown {
        return this._values?.[key];
    }

    /**
     * Stores a value, then updates the local cache so the next get() reflects
     * it without another round trip.
     */
    public async set(key: string, value: unknown): Promise<void> {
        await this._update(key, value);
        this._values = { ...this._values, [key]: value };
    }

}
