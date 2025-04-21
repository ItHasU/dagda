import { EventHandlerData, EventHandlerImpl, EventListener } from "@dagda/shared/src/tools/events";
import "bootstrap";
import "bootstrap-icons/font/bootstrap-icons.css";
import "bootstrap/dist/css/bootstrap.css";
import { AbstractPageElement } from "./abstract.page.element";

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
    /** Option icon for the page. Space between icon and title will be automatically helped */
    iconHTML?: string;
    /** Page order in the menu */
    order?: number;
    /** Display name of the page, mostly used by the menu */
    title: string;
    /** Page constructor */
    constructor: { new(): Page };
}

/**
 * This class gather all the common code for the client application.
 */
export class PageHandler<PageTypes extends BasePageTypes> {

    /** The event handler data */
    private _eventHandlerData: EventHandlerData<PageEvents> = {};

    // Storage for registered pages
    private _registeredPages: { [PageName in keyof PageTypes]?: PageInfo<PageTypes[PageName]> } = {};

    // Current active page
    private _currentPage: AbstractPageElement | null = null;
    private _currentPageUID: keyof PageTypes | null = null;

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

    /** Get the list of pages, sorted */
    public getPageInfos(): ({ uid: string } & Omit<PageInfo<any>, "constructor">)[] {
        const result: ({ uid: string } & Omit<PageInfo<any>, "constructor">)[] = [];
        for (const [uid, info] of Object.entries(this._registeredPages)) {
            result.push({
                uid,
                iconHTML: info.iconHTML,
                order: info.order,
                title: info.title
            });
        }
        result.sort((a, b) => {
            let res = 0;
            if (res === 0) {
                // Sort by order
                res = (a.order ?? 0) - (b.order ?? 0);
            }
            if (res === 0) {
                // Sort by title
                res = a.title.localeCompare(b.title);
            }
            if (res === 0) {
                // Sort by uid
                res = a.uid.localeCompare(b.uid);
            }
            return res;
        });
        return result;
    }

    //#endregion

    //#region Current page management

    /** Get the current page */
    public get currentPageUID(): keyof PageTypes | null {
        return this._currentPageUID;
    }

    /** Set and display a page */
    public async setPage<PageName extends keyof PageTypes>(
        name: PageName
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

        // Create and initialize the new page
        try {
            const newPage = new pageInfo.constructor();
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
