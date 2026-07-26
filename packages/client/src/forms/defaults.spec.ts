import { PUBLICATION_STATUS, TEST_MODEL } from "@dagda/shared/src/entities/_data";
import { describe, expect, it } from "vitest";
import { registerDefaultFieldEditors } from "./defaults";
import { defaultFieldEditors } from "./editors";

describe("registerDefaultFieldEditors", () => {

    registerDefaultFieldEditors();

    it("builds a text editor for a string field", () => {
        const editor = defaultFieldEditors.createEditor(TEST_MODEL.getTypeDefinition("MARKDOWN")!, "MARKDOWN");
        expect(editor.tagName.toLowerCase()).toBe("dagda-field-text");
    });

    it("builds a number editor for a number field", () => {
        const editor = defaultFieldEditors.createEditor(TEST_MODEL.getTypeDefinition("INTEGER")!, "INTEGER");
        expect(editor.tagName.toLowerCase()).toBe("dagda-field-number");
    });

    it("builds a boolean editor for a boolean field", () => {
        const editor = defaultFieldEditors.createEditor(TEST_MODEL.getTypeDefinition("BOOLEAN")!, "BOOLEAN");
        expect(editor.tagName.toLowerCase()).toBe("dagda-field-boolean");
    });

    it("builds a configured dropdown for an enumeration", () => {
        const editor = defaultFieldEditors.createEditor(PUBLICATION_STATUS, "PUBLICATION_STATUS");
        expect(editor.tagName.toLowerCase()).toBe("dagda-field-enum");
        expect(editor.querySelector("select")!.options.length).toBe(3); // blank placeholder + 2 entries
    });

    it("lets an application override the editor for one named type without touching the others", () => {
        class CustomMarkdownEditor extends HTMLElement {
            public value: string | null = "";
            public getValueError(): string | null { return null; }
        }
        customElements.define("test-custom-markdown-editor", CustomMarkdownEditor);
        defaultFieldEditors.registerForType("MARKDOWN", () => new CustomMarkdownEditor());

        expect(defaultFieldEditors.createEditor(TEST_MODEL.getTypeDefinition("MARKDOWN")!, "MARKDOWN").tagName.toLowerCase())
            .toBe("test-custom-markdown-editor");
        // TEXT shares MARKDOWN's raw type but keeps the framework default.
        expect(defaultFieldEditors.createEditor(TEST_MODEL.getTypeDefinition("TEXT")!, "TEXT").tagName.toLowerCase())
            .toBe("dagda-field-text");
    });

});
