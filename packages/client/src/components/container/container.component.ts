import { Dagda } from "@dagda/shared/src/dagda";
import { Event } from "@dagda/shared/src/tools/events";
import { PageEvents } from "../../pages/handler";
import { PageService } from "../../pages/service";
import { AbstractWebComponent, Ref } from "../abstract.webcomponent";
import { Navbar } from "../navbar/navbar.component";
import template from "./container.component.html";

/**
 * Where the remembered collapse state lives, until user preferences exist.
 *
 * A local mirror on purpose (`specs/navigation.md`, decisions): the preference
 * comes from the server and is only known after the session answers, so
 * reading it there would show the deployed column for one round trip before
 * snapping shut. Slice 3 makes the server the source and keeps this as the
 * mirror.
 */
export const NAV_COLLAPSED_KEY = "dagda.nav.collapsed";

/**
 * The landscape layout: navigation column and content area
 * (`specs/navigation.md` §3).
 *
 * It owns the one piece of state the shell has — deployed or collapsed — and
 * nothing else. The portrait family (top bar and drawer) lands in slice 4; it
 * will be a second value of `data-layout` here, not a second component.
 */
export class PageContainer extends AbstractWebComponent {

    @Ref()
    protected _shell!: HTMLDivElement;
    @Ref()
    protected _nav!: Navbar;
    @Ref()
    protected _page!: HTMLElement;

    constructor() {
        super({ template });
    }

    protected override async _init(): Promise<void> {
        // Applied before the first render rather than after: the column must
        // not appear deployed and then collapse in front of the user.
        this._applyCollapsed(PageContainer.readCollapsed());

        Dagda.get<PageService>("pages").on("pageChanged", (event: Event<PageEvents["pageChanged"]>) => {
            this._page.replaceChildren(event.data.page);
        });

        // The button lives in the navbar, the state lives here. An event rather
        // than a reference, so neither component has to know the other exists.
        this.addEventListener("dagda-nav-toggle", () => {
            this.collapsed = !this.collapsed;
        });
    }

    protected override async _refresh(): Promise<void> {
        await this._nav.refresh();
    }

    //#region Collapsed state --------------------------------------------------

    /** Whether the column is currently reduced to a rail */
    public get collapsed(): boolean {
        return this._shell.getAttribute("data-nav") === "collapsed";
    }

    public set collapsed(value: boolean) {
        this._applyCollapsed(value);
        PageContainer.writeCollapsed(value);
        // The navbar draws the toggle and hides the brand's full rendering, so
        // it has to hear about it. The width itself is the stylesheet's job.
        this._nav.refresh();
    }

    protected _applyCollapsed(value: boolean): void {
        this._shell.setAttribute("data-nav", value ? "collapsed" : "deployed");
    }

    /**
     * @returns the remembered state, deployed when nothing is remembered
     *
     * `window.localStorage` rather than `globalThis.localStorage`: they are the
     * same object in a browser, but Node 24 ships a `localStorage` global of
     * its own that shadows the document's under a test runner.
     */
    public static readCollapsed(): boolean {
        try {
            return window.localStorage?.getItem(NAV_COLLAPSED_KEY) === "true";
        } catch {
            // Storage can be denied outright (private browsing, blocked
            // cookies). A menu that throws on startup is worse than a menu
            // that forgets.
            return false;
        }
    }

    /** Remember the state, or carry on without remembering it */
    public static writeCollapsed(value: boolean): void {
        try {
            window.localStorage?.setItem(NAV_COLLAPSED_KEY, String(value));
        } catch {
            // See readCollapsed().
        }
    }

    //#endregion

}

customElements.define("dagda-page-container", PageContainer);
