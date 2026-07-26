import { describe, expect, it } from "vitest";
import { TextFieldEditor } from "./text.editor";

describe("TextFieldEditor", () => {

    it("starts empty", () => {
        expect(new TextFieldEditor().value).toBe("");
    });

    it("round-trips a value through the underlying input", () => {
        const editor = new TextFieldEditor();
        editor.value = "hello";
        expect(editor.value).toBe("hello");
    });

    it("treats null as clearing the field", () => {
        const editor = new TextFieldEditor();
        editor.value = "hello";
        editor.value = null;
        expect(editor.value).toBe("");
    });

    it("never reports an error: any string is acceptable", () => {
        const editor = new TextFieldEditor();
        expect(editor.getValueError()).toBeNull();
        editor.value = "";
        expect(editor.getValueError()).toBeNull();
    });

});
