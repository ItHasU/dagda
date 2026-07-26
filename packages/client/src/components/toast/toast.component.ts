import { Dagda } from "@dagda/shared/src/dagda";
import { EntitiesService } from "@dagda/shared/src/entities/service";
import { AbstractWebComponent, Ref } from "../abstract.webcomponent";
import template from "./toast.component.html";

/** How long a toast stays before it dismisses itself */
const AUTO_DISMISS_MS = 6000;

/**
 * Surfaces a write failure to the user (ROADMAP tranche 2).
 *
 * Before this, a failed `withTransaction`/`submit` or a failed action call
 * went to `console.error` alone — silent for anyone not watching devtools.
 * One instance is mounted by `<dagda-app>`; `showToast()` is the way the rest
 * of the application reaches it, since the failure can originate anywhere
 * (an entity write, an action call) with no DOM reference to this host at hand.
 */
export class ToastHost extends AbstractWebComponent {

    @Ref()
    protected _list!: HTMLUListElement;

    constructor() {
        super({ template });
        _current = this;
    }

    protected override async _init(): Promise<void> {
        // Every write failure reaches this, whichever screen caused it — the
        // caller no longer has to remember to surface its own (ROADMAP
        // tranche 2). A screen with something more specific to say may still
        // call showToast() itself; this is the floor, not the ceiling.
        try {
            Dagda.get<EntitiesService<any, any>>("entities").getHandler().on("writeFailed", (event) => {
                this.show(`Échec de l'enregistrement : ${this._describe(event.data.error)}`);
            });
        } catch {
            // No entities service: nothing to listen to.
        }
    }

    protected override async _refresh(): Promise<void> { }

    protected _describe(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }

    /** Show one message. Several calls stack, each dismissing on its own timer */
    public show(message: string): void {
        const item = document.createElement("li");
        item.className = "dagda-toast";
        item.setAttribute("data-state", "error");

        const icon = document.createElement("i");
        icon.className = "ph ph-warning";
        icon.setAttribute("aria-hidden", "true");
        item.appendChild(icon);

        const text = document.createElement("span");
        text.textContent = message;
        item.appendChild(text);

        const close = document.createElement("button");
        close.type = "button";
        close.className = "btn btn-ghost btn-icon";
        close.setAttribute("aria-label", "Fermer");
        const closeIcon = document.createElement("i");
        closeIcon.className = "ph ph-x";
        closeIcon.setAttribute("aria-hidden", "true");
        close.appendChild(closeIcon);
        close.addEventListener("click", () => item.remove());
        item.appendChild(close);

        this._list.appendChild(item);
        setTimeout(() => item.remove(), AUTO_DISMISS_MS);
    }

}

customElements.define("dagda-toast-host", ToastHost);

/** The one instance `<dagda-app>` mounts, reached by module state rather than a DOM lookup */
let _current: ToastHost | null = null;

/**
 * Surface a write failure to the user.
 *
 * A no-op before the host has connected — which only happens before the
 * shell itself has rendered, i.e. before there is a screen to show it on.
 */
export function showToast(message: string): void {
    _current?.show(message);
}
