import { FormFieldDeclaration } from "@dagda/shared/src/forms/types";
import { AbstractWebComponent, Attribute, Ref } from "../components/abstract.webcomponent";
import { defaultFieldEditors, FieldEditor, FieldEditorRegistry } from "./editors";
import template from "./form.component.html";

/** Carried by the `dagda-form-submit` event, once every field has validated */
export interface FormSubmitDetail {
    values: Record<string, unknown>;
}

function isEmpty(value: unknown): boolean {
    return value == null || value === "";
}

/**
 * Renders a form from a list of typed fields, and validates it on submit
 * (FEATURES §8.1): one editor per field, built through a `FieldEditorRegistry`
 * (defaulting to `defaultFieldEditors`), so a field's type is the only thing
 * that decides how it is edited.
 *
 * Deliberately dumb about what happens next: it fires `dagda-form-submit`
 * with the validated values and nothing else — writing them (to a setting, an
 * entity, an action call) is the caller's business, not this component's.
 */
export class DagdaForm extends AbstractWebComponent {

    @Ref()
    protected _form!: HTMLFormElement;
    @Ref()
    protected _fields!: HTMLElement;
    @Ref()
    protected _error!: HTMLElement;
    @Ref()
    protected _submit!: HTMLButtonElement;

    @Attribute({ name: "submit-label", defaultValue: "Enregistrer" })
    public submitLabel!: string;

    protected _declarations: FormFieldDeclaration[] = [];
    protected readonly _editors = new Map<string, FieldEditor>();

    constructor() {
        super({ template });
    }

    protected override async _init(): Promise<void> {
        this._form.addEventListener("submit", (event) => {
            event.preventDefault();
            this._trySubmit();
        });
    }

    protected override async _refresh(): Promise<void> {
        this._submit.textContent = this.submitLabel;
    }

    /**
     * Declares the fields to render, replacing whatever was there before.
     * @param registry where the editors come from. Defaults to the
     * application-wide `defaultFieldEditors`; a caller with its own overrides
     * not meant to be global may pass one of its own.
     */
    public setFields(declarations: FormFieldDeclaration[], registry: FieldEditorRegistry = defaultFieldEditors): void {
        this._declarations = declarations;
        this._editors.clear();
        this._fields.replaceChildren();
        this._hideError();

        for (const declaration of declarations) {
            const editor = registry.createEditor(declaration.type, declaration.typeName);
            if (declaration.default !== undefined) {
                editor.value = declaration.default;
            }
            this._editors.set(declaration.key, editor);

            const field = document.createElement("div");
            field.className = "field";

            const label = document.createElement("label");
            label.textContent = declaration.required === true ? `${declaration.label} *` : declaration.label;
            field.appendChild(label);
            field.appendChild(editor);

            if (declaration.description != null) {
                const description = document.createElement("p");
                description.className = "text-muted";
                description.textContent = declaration.description;
                field.appendChild(description);
            }

            this._fields.appendChild(field);
        }
    }

    /**
     * Validates every field.
     * @returns the collected values keyed like the declarations, or null if a
     * field refuses its value — the first refusal is also shown in the form.
     */
    public getValues(): Record<string, unknown> | null {
        for (const declaration of this._declarations) {
            const editor = this._editors.get(declaration.key)!;
            const error = editor.getValueError();
            if (error != null) {
                this._showError(`${declaration.label} : ${error}`);
                return null;
            }
            if (declaration.required === true && isEmpty(editor.value)) {
                this._showError(`${declaration.label} est obligatoire.`);
                return null;
            }
        }

        this._hideError();
        const values: Record<string, unknown> = {};
        for (const declaration of this._declarations) {
            values[declaration.key] = this._editors.get(declaration.key)!.value;
        }
        return values;
    }

    protected _trySubmit(): void {
        const values = this.getValues();
        if (values == null) {
            return;
        }
        this.dispatchEvent(new CustomEvent<FormSubmitDetail>("dagda-form-submit", { detail: { values }, bubbles: true }));
    }

    protected _showError(message: string): void {
        this._error.textContent = message;
        this._error.hidden = false;
    }

    protected _hideError(): void {
        this._error.hidden = true;
        this._error.textContent = "";
    }

}

customElements.define("dagda-form", DagdaForm);
