import { AbstractWebComponent, Ref } from "../../components/abstract.webcomponent";
import { FieldEditor } from "../editors";
import template from "./text.editor.html";

/** Default editor for `JSTypes.string` (FEATURES §8.1): a single-line text input */
export class TextFieldEditor extends AbstractWebComponent implements FieldEditor<string> {

    @Ref()
    protected _input!: HTMLInputElement;

    constructor() {
        super({ template });
    }

    protected override async _refresh(): Promise<void> { /* static markup, nothing to render */ }

    public get value(): string | null {
        return this._input.value;
    }

    public set value(value: string | null) {
        this._input.value = value ?? "";
    }

    public getValueError(): string | null {
        return null; // any string is acceptable, emptiness is a "required" concern, not this editor's
    }

}

customElements.define("dagda-field-text", TextFieldEditor);
