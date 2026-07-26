import { describe, expect, it } from "vitest";
import { NumberFieldEditor } from "./number.editor";

describe("NumberFieldEditor", () => {

    it("starts empty, reading back as null", () => {
        expect(new NumberFieldEditor().value).toBeNull();
    });

    it("round-trips a value through the underlying input", () => {
        const editor = new NumberFieldEditor();
        editor.value = 42;
        expect(editor.value).toBe(42);
    });

    it("treats null as clearing the field", () => {
        const editor = new NumberFieldEditor();
        editor.value = 42;
        editor.value = null;
        expect(editor.value).toBeNull();
    });

    it("accepts an empty field, leaving 'required' to the caller", () => {
        const editor = new NumberFieldEditor();
        expect(editor.getValueError()).toBeNull();
    });

    it("accepts a valid number", () => {
        const editor = new NumberFieldEditor();
        editor.value = 3.5;
        expect(editor.getValueError()).toBeNull();
    });

});
