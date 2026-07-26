import { Dagda } from "@dagda/shared/src/dagda";
import { EntitiesService } from "@dagda/shared/src/entities/service";
import { EventHandlerData, EventHandlerImpl, EventListener } from "@dagda/shared/src/tools/events";
import { AbstractPageElement } from "./abstract.page.element";
import { ALLOW_ALL, buildMenu, MenuGroup, MenuNode, MenuPlacement, PermissionPredicate, SectionInfo } from "./menu";

export type BasePageTypes = {
    [pageName: string]: AbstractPageElement;
};

export type PageEvents = {

    /** Event triggered when the page is changed */
    pageChanged: {
        /** The page that was set */
        page: AbstractPageElement;
    }
}

/** Page information mostly for the menu plus the constructor */
export interface PageInfo<Page extends AbstractPageElement> {
    /** Display name of the page, mostly used by the menu */
    title: string;
    /** Page constructor */
    constructor: { new(): Page };
    /**
     * Phosphor class of the page icon, e.g. `"ph-house"`.
     *
     * A class name, not markup: FEATURES §8 settled on writing `<i class="ph
     * ph-…">` directly, and a name cannot smuggle markup into the menu.
     */
    icon?: string;
    /**
     * Where the page sits in the menu.
     *
     * Absent means the page is reachable through the navigation service but
     * never listed — menu registration is optional (FEATURES §8), and a page
     * opened from a link or from another page has no reason to appear.
     */
    menu?: MenuPlacement;
    /** Permission required to see and open the page (FEATURES §7.1) */
    permission?: string;
    /**
     * Refresh the page itself when a websocket message makes its data stale,
     * instead of leaving that to the "à rafraîchir" indicator.
     *
     * A page opts in because only it knows whether re-rendering on every
     * change is cheap enough — the status page (a handful of rows) is; a page
     * mid-edit is not. While a page declares this, the indicator never shows
     * its dirty state: the page is already catching up, so there is nothing
     * left for the user to act on.
     */
    autoRefresh?: boolean;
}

/**
 * This class gather all the common code for the client application.
 */
export class PageHandler<PageTypes extends BasePageTypes> {

    /** The event handler data */
    private readonly _eventHandlerData: EventHandlerData<PageEvents> = {};

    // Storage for registered pages
    private readonly _registeredPages: { [PageName in keyof PageTypes]?: PageInfo<PageTypes[PageName]> } = {};

    // Menu sections the pages hang from
    private readonly _sections: Record<string, SectionInfo> = {};

    // Current active page
    private _currentPage: AbstractPageElement | null = null;
    private _currentPageUID: keyof PageTypes | null = null;

    /**
     * Whether the current account may see something.
     *
     * A hook rather than a lookup: the role matrix of FEATURES §7.1 is not
     * built yet, and the menu must not be rewritten when it is. Until then the
     * application supplies the answer — `DagdaClient` wires it to the
     * super-admin flag.
     */
    public canAccess: PermissionPredicate = ALLOW_ALL;

    /** Last seen value of the entities cache's dirty flag, to catch the false→true edge */
    private _wasDirty = false;

    constructor() {
        // Optional on purpose: an application without an entities service has
        // nothing to go dirty, and the subscription simply never fires.
        Dagda.loaded.then(() => {
            try {
                Dagda.get<EntitiesService<any, any>>("entities").getHandler().on("state", (event) => {
                    const dirty = event.data.dirty;
                    if (dirty && !this._wasDirty && this.isCurrentPageAutoRefresh()) {
                        // The page, not the indicator, is what re-fetches — it
                        // is what clears the flag this reacted to in the
                        // first place (FEATURES §8).
                        this.refresh().catch(err => console.error("Error while auto-refreshing the current page", err));
                    }
                    this._wasDirty = dirty;
                });
            } catch (err) {
                console.error("Error while subscribing to entities state for page auto-refresh", err);
            }
        });
    }

    /** Whether the current page declared `autoRefresh`, which the status indicator relies on to stay quiet */
    public isCurrentPageAutoRefresh(): boolean {
        if (this._currentPageUID == null) {
            return false;
        }
        return this._registeredPages[this._currentPageUID]?.autoRefresh === true;
    }

    //#region Events

    /** Register an event listener */
    public on<EventName extends keyof PageEvents>(
        eventName: EventName,
        callback: EventListener<PageEvents[EventName]>
    ): void {
        EventHandlerImpl.on(this._eventHandlerData, eventName, callback);
    }

    //#endregion

    //#region Registration and management of pages

    /** Register a page */
    public registerPage<PageName extends keyof PageTypes>(
        name: PageName,
        page: PageInfo<PageTypes[PageName]>
    ): void {
        this._registeredPages[name] = page;
    }

    /** Declare the sections pages hang from */
    public registerSections(sections: Record<string, SectionInfo>): void {
        Object.assign(this._sections, sections);
    }

    /**
     * The menu, filtered and sorted, as the four renderings consume it.
     *
     * Rebuilt on each call rather than cached: it depends on the permissions of
     * the account, which are known only after the session answers, and a stale
     * menu is a menu that shows what the account may not open.
     */
    public getMenu(group: MenuGroup = "primary"): MenuNode[] {
        const pages = Object.entries(this._registeredPages).map(([uid, info]) => ({
            uid,
            title: info!.title,
            icon: info!.icon,
            menu: info!.menu,
            permission: info!.permission
        }));
        return buildMenu(pages, this._sections, this.canAccess, group);
    }

    /** @returns the page to open on startup: the first one the menu offers */
    public getDefaultPageUID(): string | null {
        return this.getMenu()[0]?.target ?? null;
    }

    //#endregion

    //#region Current page management

    /** Get the current page */
    public get currentPageUID(): keyof PageTypes | null {
        return this._currentPageUID;
    }

    /**
     * Set and display a page.
     *
     * @param params Handed to the page as HTML attributes, read back with
     * `@Attribute()` — the mechanism the framework already has for a typed,
     * observable value on a custom element, rather than a second one just for
     * navigation. Reserved for what a page needs to open (e.g. which topic),
     * not application state: attributes are strings, and the page is free to
     * fetch whatever richer data that string identifies.
     */
    public async setPage<PageName extends keyof PageTypes>(
        name: PageName,
        params?: Record<string, string>
    ): Promise<PageTypes[PageName]> {
        // Dispose the current page if it exists
        if (this._currentPage) {
            try {
                await this._currentPage.dispose();
            } catch (err) {
                console.error("Error while disposing the current page", err);
            } finally {
                this._currentPage = null;
            }
        }

        // Retrieve the page constructor
        const pageInfo = this._registeredPages[name as string];
        if (!pageInfo) {
            console.error(`Page ${String(name)} not found`);
            throw new Error(`Page ${String(name)} not found`);
        }

        // Hiding a page from the menu is not access control: the navigation
        // service is reachable from the console (FEATURES §11.2). This refuses
        // the same thing the menu declines to offer. The gate that matters is
        // still the server's, on the data the page would ask for.
        if (!this.canAccess(pageInfo.permission)) {
            throw new Error(`Page ${String(name)} is not accessible with the current permissions`);
        }

        // Create and initialize the new page
        try {
            const newPage = new pageInfo.constructor();
            for (const [attribute, value] of Object.entries(params ?? {})) {
                // Set directly rather than through the page's own typed
                // setter: the page is not built yet from the caller's point of
                // view, and this is the one place allowed to reach past that.
                newPage.setAttribute(attribute, value);
            }
            this._currentPage = newPage;
            this._currentPageUID = name as string;

            // Refresh the page (if applicable)
            await newPage.refresh();

            // Fire the pageChanged event
            EventHandlerImpl.fire<PageEvents, "pageChanged">(this._eventHandlerData, "pageChanged", {
                page: newPage
            });

            return newPage as PageTypes[PageName];
        } catch (err) {
            console.error("Error while setting the page", err);
            this._currentPage = null;
            throw err;
        }
    }

    /** Refresh the current page (if any) */
    public refresh(): Promise<void> {
        if (this._currentPage != null) {
            return this._currentPage.refresh();
        } else {
            return Promise.resolve();
        }
    }

    //#endregion

}
