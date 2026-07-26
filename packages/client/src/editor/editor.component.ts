import type * as Monaco from "monaco-editor/editor/editor.api";
import { AbstractWebComponent, Attribute, Ref } from "../components/abstract.webcomponent";
import { loadExtraLibs, ExtraLib } from "./monaco.service";
import { loadMonaco } from "./monaco.loader";
import template from "./editor.component.html";

/**
 * A Monaco-backed code editor (ROADMAP tranche 4), first built for the
 * dashboard's `Ctrl+E` HTML editor overlay (FEATURES §6) — scoped to
 * syntax highlighting there, not real autocompletion: `.d.ts`-based extra
 * libs (`monaco.service.ts`) only feed the TypeScript/JavaScript language
 * service, and a dashboard's model is HTML. The script editor (tranche
 * 5 bis) and the automation editor (tranche 6) are what will actually load
 * extra libs into an instance of this component.
 *
 * The host element must be sized by its container — Monaco fills whatever
 * box it's given (`automaticLayout: true` keeps it in step with resizes),
 * it does not pick a height of its own.
 */
export class CodeEditor extends AbstractWebComponent {

    @Ref()
    protected _host!: HTMLDivElement;

    @Attribute({ defaultValue: "html" })
    protected _language!: string;

    protected _editor: Monaco.editor.IStandaloneCodeEditor | null = null;
    /** Guards against a change event fired by setValue() itself being reported as a user edit */
    protected _settingValue = false;

    constructor() {
        super({ template });
    }

    protected override async _init(): Promise<void> {
        const monaco = await loadMonaco();
        // The component could have been disposed while the chunk was
        // loading (a user closing the overlay before the network settled).
        if (!this.isConnected) {
            return;
        }
        this._editor = monaco.editor.create(this._host, {
            value: this.getAttribute("value") ?? "",
            language: this._language,
            automaticLayout: true,
            minimap: { enabled: false }
        });
        this._editor.onDidChangeModelContent(() => {
            if (this._settingValue) {
                return;
            }
            this.dispatchEvent(new CustomEvent<{ value: string }>("dagda-editor-change", {
                detail: { value: this._editor!.getValue() },
                bubbles: true
            }));
        });
    }

    protected override async _refresh(): Promise<void> {
        // Nothing to do on a generic refresh: the editor's own content is
        // owned by the user typing into it, not re-derived from state the
        // way a page's _refresh() re-derives its rendering.
    }

    /** The current source, synchronously — undefined before Monaco has finished loading */
    public get value(): string | undefined {
        return this._editor?.getValue();
    }

    /** Replaces the source without firing dagda-editor-change (that event is for the user's own edits) */
    public set value(value: string) {
        if (this._editor == null) {
            this.setAttribute("value", value);
            return;
        }
        this._settingValue = true;
        try {
            this._editor.setValue(value);
        } finally {
            this._settingValue = false;
        }
    }

    /** Feeds `.d.ts` sources to the TypeScript/JavaScript language service — see `monaco.service.ts` for why this has no effect in HTML mode */
    public async loadExtraLibs(libs: ExtraLib[]): Promise<void> {
        await loadExtraLibs(libs);
    }

    /** Native lifecycle hook, not AbstractWebComponent's own: releases the Monaco instance (and its model) when this element leaves the DOM */
    public disconnectedCallback(): void {
        this._editor?.dispose();
        this._editor = null;
    }

}
customElements.define("dagda-code-editor", CodeEditor);
