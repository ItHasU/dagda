import { AbstractWebComponent, Ref } from "../../components/abstract.webcomponent";
import { FieldEditor } from "../editors";
import template from "./boolean.editor.html";

/** Default editor for `JSTypes.boolean` (FEATURES §8.1) */
export class BooleanFieldEditor extends AbstractWebComponent implements FieldEditor<boolean> {

    @Ref()
    protected _input!: HTMLInputElement;

    constructor() {
        super({ template });
    }

    protected override async _refresh(): Promise<void> { /* static markup, nothing to render */ }

    public get value(): boolean | null {
        return this._input.checked;
    }

    public set value(value: boolean | null) {
        this._input.checked = value === true;
    }

    public getValueError(): string | null {
        return null; // a checkbox is always either true or false
    }

}

customElements.define("dagda-field-boolean", BooleanFieldEditor);
