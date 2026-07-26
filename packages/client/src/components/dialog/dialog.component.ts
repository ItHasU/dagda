import { AbstractWebComponent, Ref } from "../abstract.webcomponent";
import { showToast } from "../toast/toast.component";
import template from "./dialog.component.html";

/** One button of a dialog (FEATURES §8) */
export interface DialogAction {
    label: string;
    /** CSS class of the button. Defaults to `"btn-secondary"` */
    className?: string;
    /**
     * Called on click. Omit for a button that only closes the dialog (e.g.
     * "Annuler"). If it throws, the error is shown as a toast and the dialog
     * stays open — same as a form left as-is after a failed submit, so
     * whatever the user typed is not lost. Otherwise the dialog closes,
     * unless it returns exactly `false` — an action that opens a further
     * dialog of its own (e.g. "here is the invitation link") returns `false`
     * so the trigger that opened it does not immediately close it again.
     */
    onClick?: () => Promise<void | false> | void | false;
}

export interface DialogOptions {
    title: string;
    /** The dialog's content, built by the caller — a form, a message, anything */
    body: Node;
    actions: DialogAction[];
}

/**
 * A modal dialog, opened from anywhere via `openDialog()` (FEATURES §8),
 * same idiom as `showToast()`: one instance mounted by `<dagda-app>`, reached
 * by module state rather than a DOM reference threaded through every caller.
 *
 * Deliberately content-agnostic: `body` is a `Node` the caller builds and
 * owns, so a confirmation message and a form with its own field editors are
 * both just "a dialog", not two different components.
 */
export class DialogHost extends AbstractWebComponent {

    @Ref()
    protected _backdrop!: HTMLElement;
    @Ref()
    protected _title!: HTMLElement;
    @Ref()
    protected _body!: HTMLElement;
    @Ref()
    protected _actions!: HTMLElement;

    constructor() {
        super({ template });
        _current = this;
    }

    protected override async _init(): Promise<void> {
        // Clicking the backdrop itself (not something inside the dialog)
        // dismisses it, same convention as any overlay.
        this._backdrop.addEventListener("click", (event) => {
            if (event.target === this._backdrop) {
                this.close();
            }
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && !this._backdrop.hidden) {
                this.close();
            }
        });
    }

    protected override async _refresh(): Promise<void> { /* opened/closed imperatively, nothing to render on its own */ }

    /** Open the dialog. A second call while one is open replaces it */
    public open(options: DialogOptions): void {
        this._title.textContent = options.title;
        this._body.replaceChildren(options.body);

        this._actions.replaceChildren();
        for (const action of options.actions) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = `btn ${action.className ?? "btn-secondary"}`;
            button.textContent = action.label;
            button.addEventListener("click", () => { this._trigger(action).catch(() => { /* _trigger never throws */ }); });
            this._actions.appendChild(button);
        }

        this._backdrop.hidden = false;
    }

    /** Close the dialog, discarding its content */
    public close(): void {
        this._backdrop.hidden = true;
        this._body.replaceChildren();
    }

    protected async _trigger(action: DialogAction): Promise<void> {
        if (action.onClick == null) {
            this.close();
            return;
        }
        try {
            const result = await action.onClick();
            if (result !== false) {
                this.close();
            }
        } catch (err) {
            showToast(err instanceof Error ? err.message : String(err));
        }
    }

}

customElements.define("dagda-dialog-host", DialogHost);

/** The one instance `<dagda-app>` mounts, reached by module state rather than a DOM lookup */
let _current: DialogHost | null = null;

/**
 * Open a modal dialog.
 *
 * A no-op before the host has connected — which only happens before the
 * shell itself has rendered, i.e. before there is a screen to open one from.
 */
export function openDialog(options: DialogOptions): void {
    _current?.open(options);
}
