import { PUBLICATION_STATUS, TEST_MODEL } from "@dagda/shared/src/entities/_data";
import { JSTypes } from "@dagda/shared/src/entities/tools/javascript.types";
import { FormFieldDeclaration } from "@dagda/shared/src/forms/types";
import { beforeEach, describe, expect, it } from "vitest";
import { _setDagda } from "../app/dagda";
import { registerDefaultFieldEditors } from "./defaults";
import { FieldEditor, FieldEditorRegistry } from "./editors";
import { DagdaForm, FormSubmitDetail } from "./form.component";

registerDefaultFieldEditors();

function textField(overrides: Partial<FormFieldDeclaration> = {}): FormFieldDeclaration {
    return { key: "name", label: "Nom", type: TEST_MODEL.getTypeDefinition("TEXT")!, typeName: "TEXT", ...overrides };
}

describe("DagdaForm", () => {

    let form: DagdaForm;

    beforeEach(async () => {
        _setDagda({} as any);
        form = new DagdaForm();
        await form.refresh();
    });

    it("renders one labelled editor per declared field", () => {
        form.setFields([
            textField({ key: "name", label: "Nom" }),
            { key: "age", label: "Âge", type: TEST_MODEL.getTypeDefinition("INTEGER")!, typeName: "INTEGER" }
        ]);

        const labels = Array.from(form.querySelectorAll(".field > label")).map(el => el.textContent);
        expect(labels).toEqual(["Nom", "Âge"]);
        expect(form.querySelectorAll("dagda-field-text").length).toBe(1);
        expect(form.querySelectorAll("dagda-field-number").length).toBe(1);
    });

    it("marks a required field's label", () => {
        form.setFields([textField({ label: "Nom", required: true })]);
        expect(form.querySelector(".field > label")!.textContent).toBe("Nom *");
    });

    it("shows the description under the field, when declared", () => {
        form.setFields([textField({ description: "Le nom complet" })]);
        expect(form.querySelector(".field p")!.textContent).toBe("Le nom complet");
    });

    it("applies a declared default value", () => {
        form.setFields([textField({ default: "Ada" })]);
        expect(form.getValues()).toEqual({ name: "Ada" });
    });

    it("collects the values, keyed like the declarations", () => {
        form.setFields([
            textField({ key: "name" }),
            { key: "active", label: "Actif", type: TEST_MODEL.getTypeDefinition("BOOLEAN")!, typeName: "BOOLEAN", default: true }
        ]);
        expect(form.getValues()).toEqual({ name: "", active: true });
    });

    it("builds a configured dropdown for an enumeration field", () => {
        form.setFields([{ key: "status", label: "Statut", type: PUBLICATION_STATUS, typeName: "PUBLICATION_STATUS", default: PUBLICATION_STATUS.values.DRAFT }]);
        expect(form.getValues()).toEqual({ status: 1 });
    });

    it("refuses to collect values when a required field is empty", () => {
        form.setFields([textField({ required: true })]);
        expect(form.getValues()).toBeNull();
        expect(form.querySelector("[ref=error]")!.textContent).toMatch(/Nom est obligatoire/);
        expect((form.querySelector("[ref=error]") as HTMLElement).hidden).toBe(false);
    });

    it("does not require a field that was not declared required", () => {
        form.setFields([textField({ required: false })]);
        expect(form.getValues()).toEqual({ name: "" });
    });

    it("surfaces an editor's own validation error", () => {
        // A DOM input sanitizes away most ways of making a real editor
        // invalid (type="number" refuses non-numeric text outright), so this
        // exercises the wiring with a registry pointed at a stand-in editor
        // that always refuses, rather than fighting the DOM for a real one.
        const registry = new FieldEditorRegistry();
        const failing = document.createElement("div") as unknown as FieldEditor<string>;
        failing.value = null;
        failing.getValueError = () => "always invalid";
        registry.registerDefault(JSTypes.string, () => failing);

        form.setFields([textField()], registry);

        expect(form.getValues()).toBeNull();
        expect(form.querySelector("[ref=error]")!.textContent).toBe("Nom : always invalid");
    });

    it("clears a previously shown error once the form validates", () => {
        form.setFields([textField({ required: true })]);
        expect(form.getValues()).toBeNull();
        (form.querySelector("dagda-field-text input") as HTMLInputElement).value = "Ada";
        expect(form.getValues()).toEqual({ name: "Ada" });
        expect((form.querySelector("[ref=error]") as HTMLElement).hidden).toBe(true);
    });

    it("replaces the previous fields when setFields is called again", () => {
        form.setFields([textField({ key: "name" })]);
        form.setFields([{ key: "age", label: "Âge", type: TEST_MODEL.getTypeDefinition("INTEGER")!, typeName: "INTEGER" }]);
        expect(form.getValues()).toEqual({ age: null });
        expect(form.querySelectorAll(".field").length).toBe(1);
    });

    it("fires dagda-form-submit with the validated values on a valid submit", () => {
        form.setFields([textField({ default: "Ada" })]);
        let detail: FormSubmitDetail | null = null;
        form.addEventListener("dagda-form-submit", (event) => { detail = (event as CustomEvent<FormSubmitDetail>).detail; });

        form.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));

        expect(detail).toEqual({ values: { name: "Ada" } });
    });

    it("does not fire dagda-form-submit when the form is invalid", () => {
        form.setFields([textField({ required: true })]);
        let fired = false;
        form.addEventListener("dagda-form-submit", () => { fired = true; });

        form.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));

        expect(fired).toBe(false);
    });

    it("labels its submit button 'Enregistrer' by default, overridable through the submit-label attribute", async () => {
        expect(form.querySelector("[ref=submit]")!.textContent).toBe("Enregistrer");
        form.submitLabel = "Publier";
        await form.refresh();
        expect(form.querySelector("[ref=submit]")!.textContent).toBe("Publier");
    });

});
