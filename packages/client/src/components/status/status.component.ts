import { EntitiesEvents } from "@dagda/shared/src/entities/events";
import { Event } from "@dagda/shared/src/tools/events";
import { dagda } from "../../app/dagda";
import { AbstractWebComponent, Ref } from "../abstract.webcomponent";
import template from "./status.component.html";

/** What the indicator can be saying, worst first */
interface StatusRendering {
    icon: string;
    label: string;
    /** Draws attention: something is wrong or unsaved, not merely in flight */
    alert?: true;
}

/**
 * Communication state of the entity handler (FEATURES §8).
 *
 * One row rather than the row of small icons it used to be. That is not
 * cosmetic: the indicator now lives in a navigation column that reduces to a
 * rail of single badges (`specs/navigation.md` §3.2), and four icons side by
 * side have nowhere to go there. One badge, one label, and the states ranked
 * so the most serious wins.
 */
export class EntitiesStatusComponent extends AbstractWebComponent {

    @Ref()
    protected _entry!: HTMLButtonElement;
    @Ref()
    protected _badge!: HTMLSpanElement;
    @Ref()
    protected _icon!: HTMLElement;
    @Ref()
    protected _label!: HTMLSpanElement;

    protected _state: EntitiesEvents["state"] = {
        downloading: 0,
        uploading: 0,
        dirty: false
    };

    /** Null until the server has said either way, which is not the same as offline */
    protected _connected: boolean | null = null;

    constructor() {
        super({ template });
    }

    protected override async _init(): Promise<void> {
        const log = dagda.log;
        try {
            dagda.entities.getHandler().on("state", (event: Event<EntitiesEvents["state"]>) => {
                this._state = event.data;
                this.refresh().catch(log.handleError);
            });
        } catch (e) {
            log.handleError(e);
        }
        dagda.notification.on("connected", (event) => {
            this._connected = !!event.data;
            this.refresh().catch(log.handleError);
        });
        this._entry.addEventListener("click", () => {
            dagda.pages.refresh().catch(log.handleError);
        });
    }

    protected override async _refresh(): Promise<void> {
        const rendering = this._render();
        this._icon.className = `ph ${rendering.icon}`;
        this._label.textContent = rendering.label;
        this._badge.setAttribute("data-state", rendering.alert === true ? "alert" : "normal");
        // The label is hidden in the rail, so the state has to be readable from
        // the accessible name too — otherwise the badge says nothing at all.
        this._entry.setAttribute("aria-label", `${rendering.label} — rafraîchir`);
        this._entry.title = this._entry.getAttribute("aria-label")!;
        // Announced when it changes: this is the only place the user learns a
        // write failed or the connection dropped.
        this._entry.setAttribute("role", "status");
    }

    /** Rank the states: the worst thing true is the thing to say */
    protected _render(): StatusRendering {
        if (this._connected === false) {
            return { icon: "ph-wifi-slash", label: "Hors ligne", alert: true };
        }
        if (this._state.dirty && !dagda.pages.isCurrentPageAutoRefresh()) {
            // The cache was invalidated and not reloaded: what is on screen may
            // not be what is stored. Unless the page declared `autoRefresh` —
            // then it is already catching up, and there is nothing left here
            // for the user to act on.
            return { icon: "ph-warning", label: "À rafraîchir", alert: true };
        }
        if (this._state.uploading > 0) {
            const suffix = this._state.uploading > 1 ? ` (${this._state.uploading})` : "";
            return { icon: "ph-arrow-up", label: `Envoi${suffix}` };
        }
        if (this._state.downloading > 0) {
            return { icon: "ph-arrow-down", label: "Chargement" };
        }
        return { icon: "ph-check-circle", label: "À jour" };
    }

}

customElements.define("dagda-status", EntitiesStatusComponent);
