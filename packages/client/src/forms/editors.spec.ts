import { EntitiesModel } from "@dagda/shared/src/entities/model";
import { PUBLICATION_STATUS, TEST_MODEL } from "@dagda/shared/src/entities/_data";
import { JSTypes } from "@dagda/shared/src/entities/tools/javascript.types";
import { describe, expect, it } from "vitest";
import { EnumFieldEditor, FieldEditor, FieldEditorRegistry } from "./editors";

/** A minimal, fake editor: enough to exercise the registry without a real component */
function fakeEditor(tag = "fake-editor"): FieldEditor<string> {
    const element = document.createElement(tag) as unknown as FieldEditor<string>;
    element.value = null;
    element.getValueError = () => null;
    return element;
}

function fakeEnumEditor(): EnumFieldEditor {
    const element = fakeEditor("fake-enum-editor") as unknown as EnumFieldEditor;
    element.setEnumeration = () => { /* records nothing, just needs to exist */ };
    return element;
}

describe("FieldEditorRegistry", () => {

    it("throws when nothing is registered for a raw type", () => {
        const registry = new FieldEditorRegistry();
        expect(() => registry.createEditor(TEST_MODEL.getTypeDefinition("TEXT")!))
            .toThrow(/No editor registered/);
    });

    it("returns the default editor registered for a raw type", () => {
        const registry = new FieldEditorRegistry();
        const editor = fakeEditor();
        registry.registerDefault(JSTypes.string, () => editor);
        expect(registry.createEditor(TEST_MODEL.getTypeDefinition("TEXT")!)).toBe(editor);
    });

    it("prefers a named-type override over the default for its raw type", () => {
        const registry = new FieldEditorRegistry();
        registry.registerDefault(JSTypes.string, fakeEditor);
        const override = fakeEditor("markdown-editor");
        registry.registerForType("MARKDOWN", () => override);

        expect(registry.createEditor(TEST_MODEL.getTypeDefinition("MARKDOWN")!, "MARKDOWN")).toBe(override);
        // A different string type, same raw type, is unaffected by the override.
        expect(registry.createEditor(TEST_MODEL.getTypeDefinition("TEXT")!, "TEXT")).not.toBe(override);
    });

    it("routes an enumeration to the registered enum editor and configures it", () => {
        const registry = new FieldEditorRegistry();
        const editor = fakeEnumEditor();
        let received: unknown = null;
        editor.setEnumeration = (enumeration) => { received = enumeration; };
        registry.registerEnumDefault(() => editor);

        const result = registry.createEditor(PUBLICATION_STATUS, "PUBLICATION_STATUS");
        expect(result).toBe(editor);
        expect(received).toBe(PUBLICATION_STATUS);
    });

    it("throws when nothing is registered for enumerations", () => {
        const registry = new FieldEditorRegistry();
        expect(() => registry.createEditor(PUBLICATION_STATUS)).toThrow(/enumerations/);
    });

    it("configures a named override with the enumeration too, when it supports one", () => {
        const registry = new FieldEditorRegistry();
        const editor = fakeEnumEditor();
        let received: unknown = null;
        editor.setEnumeration = (enumeration) => { received = enumeration; };
        registry.registerForType("PUBLICATION_STATUS", () => editor);

        registry.createEditor(PUBLICATION_STATUS, "PUBLICATION_STATUS");
        expect(received).toBe(PUBLICATION_STATUS);
    });

    it("refuses a named override that cannot handle the enumeration it is handed", () => {
        const registry = new FieldEditorRegistry();
        registry.registerForType("PUBLICATION_STATUS", () => fakeEditor()); // no setEnumeration
        expect(() => registry.createEditor(PUBLICATION_STATUS, "PUBLICATION_STATUS")).toThrow(/does not support enumerations/);
    });

    it("uses a custom type() field's own type definition, not just fixture entries", () => {
        const registry = new FieldEditorRegistry();
        const definition = EntitiesModel.type({ rawType: JSTypes.number });
        const editor = fakeEditor();
        registry.registerDefault(JSTypes.number, () => editor);
        expect(registry.createEditor(definition)).toBe(editor);
    });

});
