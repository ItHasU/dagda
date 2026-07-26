import { describe, expect, it } from "vitest";
import { BooleanFieldEditor } from "./boolean.editor";

describe("BooleanFieldEditor", () => {

    it("starts unchecked", () => {
        expect(new BooleanFieldEditor().value).toBe(false);
    });

    it("round-trips a value through the underlying checkbox", () => {
        const editor = new BooleanFieldEditor();
        editor.value = true;
        expect(editor.value).toBe(true);
        editor.value = false;
        expect(editor.value).toBe(false);
    });

    it("treats null as false, there being no third state", () => {
        const editor = new BooleanFieldEditor();
        editor.value = true;
        editor.value = null;
        expect(editor.value).toBe(false);
    });

    it("never reports an error", () => {
        expect(new BooleanFieldEditor().getValueError()).toBeNull();
    });

});
