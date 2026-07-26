import { AbstractWebComponent, Ref } from "../../components/abstract.webcomponent";
import { FieldEditor } from "../editors";
import template from "./number.editor.html";

/** Default editor for `JSTypes.number` (FEATURES §8.1) */
export class NumberFieldEditor extends AbstractWebComponent implements FieldEditor<number> {

    @Ref()
    protected _input!: HTMLInputElement;

    constructor() {
        super({ template });
    }

    protected override async _refresh(): Promise<void> { /* static markup, nothing to render */ }

    public get value(): number | null {
        return this._input.value === "" ? null : Number(this._input.value);
    }

    public set value(value: number | null) {
        this._input.value = value == null ? "" : String(value);
    }

    public getValueError(): string | null {
        // Emptiness is a "required" concern, not this editor's. A number
        // input only ever lets through digits and one "-"/".", so the only
        // way _input.value is non-empty and non-finite is that browser typing
        // a bare "-" — still worth catching before it reaches the caller.
        if (this._input.value === "") {
            return null;
        }
        return Number.isFinite(this.value) ? null : "expected a number";
    }

}

customElements.define("dagda-field-number", NumberFieldEditor);
