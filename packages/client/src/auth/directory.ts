import { UserId } from "@dagda/shared/src/auth/types";
import { UserName } from "@dagda/shared/src/auth/actions";

/**
 * Client-side user directory (ROADMAP tranche 3): loaded once, consultable
 * synchronously afterward — the same reason the entities cache and
 * `SettingsService` are both synchronous-read/async-load. Without it, no
 * screen could show an author's name during render without an async
 * round-trip.
 */
export class UsersDirectory {

    private _byId: Map<UserId, string> | null = null;

    /** @param _fetch how the names are obtained — `listUserNames()` in practice, injected so a test never needs a real server */
    public constructor(private readonly _fetch: () => Promise<UserName[]>) { }

    /** Loads the directory once, called during `DagdaClient.start()`'s bootstrap */
    public async load(): Promise<void> {
        try {
            const names = await this._fetch();
            this._byId = new Map(names.map(u => [u.id, u.displayName]));
        } catch (err) {
            // Anonymous on the login screen (the action requires a session),
            // or the request failed outright: getDisplayName() keeps
            // answering null, the same as `DagdaClient.currentUser` before
            // refreshSystemInfo() resolves — no reason to break the whole
            // bootstrap over a directory nothing needs yet.
            console.error("Error while loading the user directory", err);
        }
    }

    /**
     * @returns the display name for `id`, or null before the initial load
     * resolves or if no account carries this id — mirrors
     * `DagdaClient.currentUser`, which likewise answers null rather than
     * making the caller await something.
     */
    public getDisplayName(id: UserId): string | null {
        return this._byId?.get(id) ?? null;
    }

}
