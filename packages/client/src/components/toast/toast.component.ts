import { dagda } from "../../app/dagda";
import { AbstractWebComponent, Ref } from "../abstract.webcomponent";
import template from "./toast.component.html";

/** How long a toast stays before it dismisses itself */
const AUTO_DISMISS_MS = 6000;

/** Visual/semantic category of a toast — distinguishes a failure from a positive confirmation, a caution, or a plain heads-up */
export type ToastVariant = "success" | "danger" | "warning" | "info";

const VARIANT_ICON: Record<ToastVariant, string> = {
    success: "ph-check-circle",
    danger: "ph-warning",
    warning: "ph-warning-circle",
    info: "ph-info"
};

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
            dagda.entities.getHandler().on("writeFailed", (event) => {
                this.show(`Échec de l'enregistrement : ${this._describe(event.data.error)}`, "danger");
            });
        } catch {
            // No entities service: nothing to listen to.
        }
    }

    protected override async _refresh(): Promise<void> { }

    protected _describe(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }

    /**
     * Show one message. Several calls stack, each dismissing on its own timer.
     *
     * `variant` defaults to `"danger"` — every call site untouched by this
     * (FEATURES §8) keeps showing exactly the red failure toast it always
     * did; only a caller that explicitly knows its message is a success or a
     * plain heads-up passes something else.
     */
    public show(message: string, variant: ToastVariant = "danger"): void {
        const item = document.createElement("li");
        item.className = "dagda-toast";
        item.setAttribute("data-state", variant);

        const icon = document.createElement("i");
        icon.className = `ph ${VARIANT_ICON[variant]}`;
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
 * Surface a message to the user — a write failure by default (`variant`
 * defaults to `"danger"`), or a success/info notice when the caller passes
 * one explicitly.
 *
 * A no-op before the host has connected — which only happens before the
 * shell itself has rendered, i.e. before there is a screen to show it on.
 */
export function showToast(message: string, variant?: ToastVariant): void {
    _current?.show(message, variant);
}
