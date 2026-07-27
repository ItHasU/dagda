import { POST_KIND, PUBLICATION_STATUS } from "@dagda/shared/src/entities/_data";
import { describe, expect, it } from "vitest";
import { EnumFieldEditorComponent } from "./enum.editor";

describe("EnumFieldEditorComponent", () => {

    it("builds one option per entry, labelled and in declaration order, after a leading blank option", () => {
        const editor = new EnumFieldEditorComponent();
        editor.setEnumeration(PUBLICATION_STATUS);

        const select = editor.querySelector("select")!;
        expect(Array.from(select.options).map(o => o.textContent)).toEqual(["", "Draft", "Published"]);
    });

    it("resolves the selected option back to its declared value, numeric enumeration", () => {
        const editor = new EnumFieldEditorComponent();
        editor.setEnumeration(PUBLICATION_STATUS);
        editor.value = PUBLICATION_STATUS.values.PUBLISHED;
        expect(editor.value).toBe(2);
    });

    it("resolves the selected option back to its declared value, string enumeration", () => {
        const editor = new EnumFieldEditorComponent();
        editor.setEnumeration(POST_KIND);
        editor.value = POST_KIND.values.NOTE;
        expect(editor.value).toBe("note");
    });

    it("starts with nothing selected, reading back as null", () => {
        const editor = new EnumFieldEditorComponent();
        editor.setEnumeration(PUBLICATION_STATUS);
        expect(editor.value).toBeNull();
    });

    it("replaces the options when configured with a different enumeration", () => {
        const editor = new EnumFieldEditorComponent();
        editor.setEnumeration(PUBLICATION_STATUS);
        editor.setEnumeration(POST_KIND);

        const select = editor.querySelector("select")!;
        expect(Array.from(select.options).map(o => o.textContent)).toEqual(["", "Article", "Note"]);
    });

    it("reports an error when asked for one before an enumeration is configured", () => {
        const editor = new EnumFieldEditorComponent();
        expect(editor.getValueError()).toMatch(/no enumeration/);
    });

    it("accepts any declared value once configured", () => {
        const editor = new EnumFieldEditorComponent();
        editor.setEnumeration(PUBLICATION_STATUS);
        editor.value = PUBLICATION_STATUS.values.DRAFT;
        expect(editor.getValueError()).toBeNull();
    });

    it("skips the leading blank option when a default is coming (hasDefault=true) — it would otherwise be a selectable, meaningless entry", () => {
        const editor = new EnumFieldEditorComponent();
        editor.setEnumeration(PUBLICATION_STATUS, true);

        const select = editor.querySelector("select")!;
        expect(Array.from(select.options).map(o => o.textContent)).toEqual(["Draft", "Published"]);
    });

});
