import { BasePageTypes, PageHandler } from "./handler";

/**
 * Deep-linkable pages by query string (ROADMAP tranche 4).
 *
 * `?page=<uid>&<attr>=<value>…`, not a path (`/dashboard/3`): a path would
 * need a server-side catch-all serving `index.html` for any unknown URL —
 * nothing does that today — *and* an absolute `output.publicPath` in the
 * webpack config, since the emitted `<script src="main.js">` is relative and
 * would 404 on any path but `/`. A query string on `/` needs neither; it
 * hits the same route that already serves the app.
 *
 * Deliberately a separate class from `PageHandler`, not folded into it —
 * same reasoning as `dagda-nav-toggle` between `Navbar` and `PageContainer`:
 * `PageHandler` knows nothing about URLs, `Router` knows nothing about pages
 * beyond the `uid`/`params` shape `pageChanged`/`pageParamsChanged` already
 * carry.
 */
export class Router<PageTypes extends BasePageTypes> {

    /**
     * Set for the duration of applying a URL to the page handler, so the
     * `pageChanged`/`pageParamsChanged` that `setPage()`/`replaceParams()`
     * themselves fire don't loop back into another history entry.
     */
    protected _applying = false;

    constructor(protected _pages: PageHandler<PageTypes>) {
        window.addEventListener("popstate", () => {
            this._applyFromLocation(false).catch((err) => console.error("Error while navigating", err));
        });
        this._pages.on("pageChanged", (event) => {
            if (!this._applying) {
                this._pushState(event.data.uid, event.data.params);
            }
        });
        this._pages.on("pageParamsChanged", (event) => {
            if (!this._applying) {
                this._replaceState(event.data.uid, event.data.params);
            }
        });
    }

    /**
     * Applies whatever the current URL names, falling back to the default
     * page if it names none — call once, during bootstrap, after every page
     * is registered. `replaceState`s the resolved page back into the URL
     * (not `pushState`): the very first load must not already leave a
     * history entry a single "back" press would undo into nothing new.
     */
    public async start(): Promise<void> {
        await this._applyFromLocation(true);
    }

    protected async _applyFromLocation(replace: boolean): Promise<void> {
        const search = new URLSearchParams(window.location.search);
        const uid = search.get("page") ?? this._pages.getDefaultPageUID();
        if (uid == null) {
            return;
        }
        const params: Record<string, string> = {};
        for (const [key, value] of search) {
            if (key !== "page") {
                params[key] = value;
            }
        }

        this._applying = true;
        let resolvedUid = uid;
        let resolvedParams = params;
        try {
            try {
                await this._pages.setPage(uid as keyof PageTypes, params);
            } catch (err) {
                // A deep link to an unknown page, or one the account cannot
                // see (setPage() itself checks canAccess) — this must not
                // take the whole bootstrap down with it. Same fallback as no
                // "page" param at all.
                console.error(`Could not open page "${uid}" from the URL, falling back to the default page`, err);
                const fallback = this._pages.getDefaultPageUID();
                if (fallback == null) {
                    // Nothing this account may see at all — same as the
                    // "page" param being absent and getDefaultPageUID()
                    // already answering null: give up quietly, an empty
                    // content area rather than a broken bootstrap.
                    return;
                }
                resolvedUid = fallback;
                resolvedParams = {};
                await this._pages.setPage(fallback as keyof PageTypes, resolvedParams);
            }
        } finally {
            this._applying = false;
        }

        if (replace) {
            this._replaceState(resolvedUid, resolvedParams);
        }
    }

    protected _pushState(uid: string, params: Record<string, string>): void {
        window.history.pushState({}, "", this._buildUrl(uid, params));
    }

    protected _replaceState(uid: string, params: Record<string, string>): void {
        window.history.replaceState({}, "", this._buildUrl(uid, params));
    }

    protected _buildUrl(uid: string, params: Record<string, string>): string {
        const search = new URLSearchParams();
        search.set("page", uid);
        for (const [key, value] of Object.entries(params)) {
            search.set(key, value);
        }
        return `${window.location.pathname}?${search.toString()}`;
    }

}
