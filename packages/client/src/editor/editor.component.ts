import type * as Monaco from "monaco-editor/editor/editor.api";
import { Dagda } from "@dagda/shared/src/dagda";
import { ThemeService } from "../themes/service";
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
    protected _unsubscribeTheme: (() => void) | null = null;

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
        // Cmd/Ctrl+S (FEATURES §8): the host page decides what "save" means
        // (a dashboard's Ctrl+E overlay, the future script editor, ...) — this
        // component only needs to stop the browser's own save-page dialog and
        // hand the intent upward. F1 (command palette) and Cmd/Ctrl+P (quick
        // command) are untouched: nothing here overrides Monaco's defaults,
        // which already provide both.
        this._editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            this.dispatchEvent(new CustomEvent("dagda-editor-save", { bubbles: true }));
        });
        // Follows the app's light/dark choice (ROADMAP tranche 4) rather than
        // a theme id comparison, which would misfire for an application
        // declaring its own custom theme list — Monaco has no notion of
        // those, only its own built-in "vs"/"vs-dark".
        const themes = Dagda.get<ThemeService>("themes");
        const applyTheme = (): void => monaco.editor.setTheme(themes.currentInfo.dark ? "vs-dark" : "vs");
        applyTheme();
        this._unsubscribeTheme = themes.onChange(applyTheme);
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
        this._unsubscribeTheme?.();
        this._unsubscribeTheme = null;
    }

}
customElements.define("dagda-code-editor", CodeEditor);
