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
 * Width below which the shell switches from the landscape column to the
 * portrait bar-and-drawer (`specs/navigation.md` §1: "seuil exact non fixé
 * par la maquette"). No design-system breakpoint exists to derive this
 * from — there is no `--bp-*` token anywhere in the bundle — so this is a
 * chosen value, not a derived one. A `matchMedia` query in TypeScript,
 * with `shell.css` keyed entirely off the `[data-layout]` attribute it
 * writes rather than a second, driftable media query of its own: a CSS
 * custom property cannot be read inside `@media` anyway, so the
 * alternative was a literal duplicated in two files.
 */
export const PORTRAIT_MAX_WIDTH_PX = 768;

/**
 * The shell: navigation and content area, in either of the two layout
 * families of `specs/navigation.md` (§1) — landscape's column, portrait's
 * bar and drawer (§4, ROADMAP tranche 4).
 *
 * One component for both, same posture `Navbar` already takes for its own
 * four renderings: `[data-layout]` picks the family, `[data-nav]` the state
 * within it — "deployed" is the full column in landscape, the open drawer in
 * portrait. `Navbar`'s own TypeScript needs no change at all: it already
 * reads `[data-nav]` through `this.closest(...)`, never caring which layout
 * put it there.
 */
export class PageContainer extends AbstractWebComponent {

    @Ref()
    protected _shell!: HTMLDivElement;
    @Ref()
    protected _nav!: Navbar;
    @Ref()
    protected _page!: HTMLElement;
    @Ref()
    protected _backdrop!: HTMLElement;

    protected _portraitQuery = window.matchMedia(`(max-width: ${PORTRAIT_MAX_WIDTH_PX}px)`);

    constructor() {
        super({ template });
    }

    protected override async _init(): Promise<void> {
        // Applied before the first render rather than after: the shell must
        // not appear in one layout and then switch in front of the user.
        this._applyLayout(this._portraitQuery.matches);

        this._portraitQuery.addEventListener("change", (event) => this._applyLayout(event.matches));

        Dagda.get<PageService>("pages").on("pageChanged", (event: Event<PageEvents["pageChanged"]>) => {
            this._page.replaceChildren(event.data.page);
            // Third close trigger (§4.3, "sélection d'une page") — a no-op
            // in landscape, where collapsing on navigation was never asked
            // for and `data-layout` guards it out in the setter below.
            if (this._isPortrait) {
                this.collapsed = true;
            }
        });

        // The button lives in the navbar, the state lives here. An event rather
        // than a reference, so neither component has to know the other exists.
        // Second close trigger (§4.3, "deuxième tap sur ☰"): the same toggle
        // already opens the drawer, so closing it is simply toggling again.
        this.addEventListener("dagda-nav-toggle", () => {
            this.collapsed = !this.collapsed;
        });

        // First close trigger (§4.3, "clic hors panneau") — landscape has no
        // backdrop to click, shell.css keeps it hors de vue there.
        this._backdrop.addEventListener("click", () => {
            this.collapsed = true;
        });
    }

    protected override async _refresh(): Promise<void> {
        await this._nav.refresh();
    }

    //#region Layout — landscape vs. portrait -----------------------------------

    protected get _isPortrait(): boolean {
        return this._shell.getAttribute("data-layout") === "portrait";
    }

    /**
     * Switches layout family. The state that goes with it does NOT carry
     * over from the other family: a column remembered as deployed on a
     * desktop must not reopen as a drawer already covering the content on a
     * phone, and a drawer left open on a phone is not a "deployed" choice
     * that belongs on a desktop either. Portrait always starts closed;
     * landscape always restores whatever was remembered.
     */
    protected _applyLayout(isPortrait: boolean): void {
        this._shell.setAttribute("data-layout", isPortrait ? "portrait" : "landscape");
        this._applyCollapsed(isPortrait ? true : PageContainer.readCollapsed());
    }

    //#endregion

    //#region Collapsed state --------------------------------------------------

    /** Whether the column is currently reduced to a rail (landscape) or the drawer is closed (portrait) */
    public get collapsed(): boolean {
        return this._shell.getAttribute("data-nav") === "collapsed";
    }

    public set collapsed(value: boolean) {
        this._applyCollapsed(value);
        // Only in landscape (`specs/navigation.md` §1: the portrait/landscape
        // split itself is never remembered, and neither is a drawer's
        // transient open/closed state — every load starts with it closed).
        if (!this._isPortrait) {
            PageContainer.writeCollapsed(value);
        }
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
