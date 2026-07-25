import { PageService } from "@dagda/client/src/pages/service";
import { Dagda } from "@dagda/shared/src/dagda";
import { LogService } from "@dagda/shared/src/tools/log";
import { BrandInfo, BrandService } from "../../app/brand";
import { isActive, MenuNode } from "../../pages/menu";
import { AbstractWebComponent, Ref } from "../abstract.webcomponent";
import template from "./navbar.component.html";

/** Fallback icon for an entry that declared none, so the rail is never blank */
const DEFAULT_ICON = "ph-circle";

/**
 * The navigation column (`specs/navigation.md` §3).
 *
 * One component for both states. Deployed and collapsed are the same tree with
 * a different stylesheet, not two renderings to keep in step — which is the
 * whole point of §5: four layouts, one declaration.
 *
 * What it deliberately does not hold: any menu state. Sections are always all
 * expanded, so there is nothing to remember and nothing to recompute when the
 * page changes (`specs/navigation.md`, decisions). The single piece of state,
 * deployed versus collapsed, belongs to the container that owns the layout.
 */
export class Navbar extends AbstractWebComponent {

    @Ref()
    protected _brand!: HTMLElement;
    @Ref()
    protected _primaryGroup!: HTMLUListElement;
    @Ref()
    protected _secondaryGroup!: HTMLUListElement;
    @Ref()
    protected _toggle!: HTMLButtonElement;

    constructor() {
        super({ template });
    }

    protected override async _init(): Promise<void> {
        this._toggle.addEventListener("click", () => {
            // The container owns the state; the button only asks. Bubbles so
            // it reaches the container without the two holding a reference to
            // each other.
            this.dispatchEvent(new CustomEvent("dagda-nav-toggle", { bubbles: true }));
        });
    }

    protected override async _refresh(): Promise<void> {
        const pages = Dagda.get<PageService>("pages");
        this._renderBrand(Dagda.get<BrandService>("brand"));
        this._renderGroup(this._primaryGroup, pages.getMenu("primary"), pages.currentPageUID as string | null);
        this._renderGroup(this._secondaryGroup, pages.getMenu("secondary"), pages.currentPageUID as string | null);
        this._renderToggle();

        // The two components of the secondary group are in the template, so
        // they render once when they connect — which is before the server has
        // said who is signed in. Without this pass the account badge stays
        // blank for the whole session.
        await Promise.all(
            Array.from(this.querySelectorAll<AbstractWebComponent>("dagda-status, dagda-login"))
                .map(component => component.refresh())
        );
    }

    /** Whether the column is currently a rail, read from the container */
    protected get _collapsed(): boolean {
        return this.closest("[data-nav]")?.getAttribute("data-nav") === "collapsed";
    }

    //#region Rendering --------------------------------------------------------

    /**
     * Both renderings of the brand, at once.
     *
     * The compact one is a second rendering, never a truncation of the first
     * (`specs/navigation.md` §3.2): the stylesheet swaps them, so the column
     * does not reflow through a half-drawn state on the way.
     */
    protected _renderBrand(brand: BrandInfo | undefined): void {
        const label = brand?.label ?? "Dagda";
        const compact = brand?.compact ?? label.slice(0, 2);
        this._brand.replaceChildren();

        if (brand?.icon != null) {
            const icon = document.createElement("i");
            icon.className = `ph ${brand.icon} shell-brand-icon`;
            // Decorative: the name is written right next to it, and a font
            // glyph lives in a private code point that reads as gibberish.
            icon.setAttribute("aria-hidden", "true");
            this._brand.appendChild(icon);
        }

        const full = document.createElement("span");
        full.className = "shell-brand-full";
        full.textContent = label;
        this._brand.appendChild(full);

        const short = document.createElement("span");
        short.className = "shell-brand-compact";
        short.textContent = compact;
        this._brand.appendChild(short);

        // Hidden from assistive technology while collapsed, so the name is
        // announced once rather than twice.
        full.setAttribute("aria-hidden", String(this._collapsed));
        short.setAttribute("aria-hidden", String(!this._collapsed));
    }

    /** Render one group: its nodes, and the pages under each of them */
    protected _renderGroup(host: HTMLUListElement, nodes: MenuNode[], currentPageUID: string | null): void {
        host.replaceChildren();
        for (const node of nodes) {
            const item = document.createElement("li");
            host.appendChild(item);

            // A section with children is a header, and heading straight to its
            // first page is what a click on the collapsed badge does
            // (`specs/navigation.md`, decisions). Same target in both states:
            // one behaviour to explain, not two.
            item.appendChild(this._renderEntry({
                label: node.label,
                icon: node.icon,
                target: node.target,
                active: isActive(node, currentPageUID)
            }));

            if (node.pages.length === 0) {
                continue;
            }

            const list = document.createElement("ul");
            list.className = "shell-pages";
            item.appendChild(list);
            for (const page of node.pages) {
                const pageItem = document.createElement("li");
                list.appendChild(pageItem);
                pageItem.appendChild(this._renderEntry({
                    label: page.title,
                    icon: page.icon,
                    target: page.uid,
                    active: page.uid === currentPageUID
                }));
            }
        }
    }

    /**
     * One clickable row: badge, then label.
     *
     * A button rather than a link: there is no URL to go to yet — routing is a
     * later slice — and a link with `href="#"` is a link that lies to the
     * browser and to assistive technology.
     */
    protected _renderEntry(entry: { label: string, icon?: string, target: string, active: boolean }): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "shell-entry";
        if (entry.active) {
            button.setAttribute("aria-current", "page");
        }

        const badge = document.createElement("span");
        badge.className = "shell-badge";
        const icon = document.createElement("i");
        icon.className = `ph ${entry.icon ?? DEFAULT_ICON}`;
        icon.setAttribute("aria-hidden", "true");
        badge.appendChild(icon);
        button.appendChild(badge);

        const label = document.createElement("span");
        label.className = "shell-label";
        // textContent, not innerHTML: a page title is data, and the menu is not
        // a place to interpret markup.
        label.textContent = entry.label;
        button.appendChild(label);

        // The label is hidden by the stylesheet in the rail, so the accessible
        // name has to come from somewhere else — otherwise the collapsed menu
        // is a column of unnamed buttons.
        button.setAttribute("aria-label", entry.label);
        button.title = entry.label;

        button.addEventListener("click", () => {
            this._goTo(entry.target).catch(Dagda.get<LogService>("log").handleError);
        });
        return button;
    }

    /** The collapse control, labelled for what it will do, not for what it is */
    protected _renderToggle(): void {
        const collapsed = this._collapsed;
        const label = collapsed ? "Déployer le menu" : "Rétracter le menu";
        this._toggle.replaceChildren();
        const icon = document.createElement("i");
        icon.className = `ph ${collapsed ? "ph-caret-right" : "ph-caret-left"}`;
        icon.setAttribute("aria-hidden", "true");
        this._toggle.appendChild(icon);
        // A button whose only content is an icon has no accessible name at all
        // without this (FEATURES §8).
        this._toggle.setAttribute("aria-label", label);
        this._toggle.title = label;
        this._toggle.setAttribute("aria-expanded", String(!collapsed));
    }

    //#endregion

    /** Open a page, or refresh it when it is already the current one */
    protected async _goTo(uid: string): Promise<void> {
        const pages = Dagda.get<PageService>("pages");
        if (pages.currentPageUID === uid) {
            await pages.refresh();
            return;
        }
        await pages.setPage(uid);
        // The active mark moved, and it is this component that draws it.
        await this.refresh();
    }

}

customElements.define("dagda-navbar", Navbar);
