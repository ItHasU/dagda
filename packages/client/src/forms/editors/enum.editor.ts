import { EnumDefinition, EnumValue } from "@dagda/shared/src/entities/tools/enums";
import { JSTypes } from "@dagda/shared/src/entities/tools/javascript.types";
import { AbstractWebComponent, Ref } from "../../components/abstract.webcomponent";
import { EnumFieldEditor } from "../editors";
import template from "./enum.editor.html";

/**
 * Default editor for a declarative enumeration (FEATURES §2, §8.1): a
 * dropdown built from `getEntries()`, the label carried by each entry doing
 * the work a hand-written lookup table used to do in every screen.
 */
export class EnumFieldEditorComponent extends AbstractWebComponent implements EnumFieldEditor {

    @Ref()
    protected _select!: HTMLSelectElement;

    protected _enumeration: EnumDefinition<any> | null = null;

    constructor() {
        super({ template });
    }

    protected override async _refresh(): Promise<void> { /* options are (re)built by setEnumeration() */ }

    public setEnumeration(enumeration: EnumDefinition<any>, hasDefault = false): void {
        this._enumeration = enumeration;
        this._select.textContent = "";
        // A native <select> auto-selects its first option, unlike a text or
        // number input starting empty; without this, the field would read as
        // its first entry before the user ever touched it. Not needed when a
        // default is coming right behind this call: the field is never truly
        // unset, so the placeholder would only ever be a confusing, dead
        // entry the user could select but that means nothing (FEATURES §8).
        if (!hasDefault) {
            this._select.appendChild(document.createElement("option"));
        }
        for (const entry of enumeration.getEntries()) {
            const option = document.createElement("option");
            option.value = String(entry.value);
            option.textContent = entry.label;
            this._select.appendChild(option);
        }
    }

    public get value(): EnumValue | null {
        if (this._enumeration == null || this._select.value === "") {
            return null;
        }
        return this._enumeration.getEntryByValue(this._parse(this._select.value))?.value ?? null;
    }

    public set value(value: EnumValue | null) {
        this._select.value = value == null ? "" : String(value);
    }

    public getValueError(): string | null {
        if (this._enumeration == null) {
            return "no enumeration configured";
        }
        if (this._select.value === "") {
            return null; // emptiness is a "required" concern, not this editor's
        }
        return this._enumeration.isValidValue(this._parse(this._select.value)) ? null : "not one of the declared values";
    }

    /** The `<select>` only ever hands out strings; a numeric enumeration needs them read back as numbers */
    protected _parse(text: string): EnumValue {
        return this._enumeration?.rawType === JSTypes.number ? Number(text) : text;
    }

}

customElements.define("dagda-field-enum", EnumFieldEditorComponent);
