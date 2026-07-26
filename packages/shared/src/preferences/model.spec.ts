import { describe, expect, it } from "vitest";
import { EntitiesModel } from "../entities/model";
import { JSTypes } from "../entities/tools/javascript.types";
import { PreferencesModel } from "./model";

/** An enumeration used as a preference type, as an application would declare it */
const THEME = EntitiesModel.enum({
    LIGHT: { value: "light", label: "Clair" },
    DARK: { value: "dark", label: "Sombre" }
});

const MODEL = new PreferencesModel({
    "theme": {
        type: THEME,
        default: "light" as const
    },
    "compactView": {
        type: JSTypes.boolean,
        default: false
    },
    "pageSize": {
        type: JSTypes.number,
        default: 25
    }
});

describe("Preferences model", () => {

    describe("Declaration", () => {

        it("resolves an enumeration to the type of its values", () => {
            expect(MODEL.getRawType("theme")).toBe(JSTypes.string);
            expect(MODEL.getEnum("theme")?.getValues()).toEqual(["light", "dark"]);
            expect(MODEL.getEnum("compactView")).toBeNull();
        });

        it("checks its own defaults", () => {
            expect(() => new PreferencesModel({
                theme: { type: THEME, default: "purple" as any }
            })).toThrow(/invalid default value/);
        });

        it("rejects a default of the wrong type, at compile time and at runtime", () => {
            // The @ts-expect-error is the real assertion, same reasoning as the
            // settings model: without the self-referential constraint the
            // default is checked against every value type at once.
            expect(() => new PreferencesModel({
                // @ts-expect-error a boolean default on a string preference
                nickname: { type: JSTypes.string, default: true }
            })).toThrow(/expected a string, got boolean/);
        });

        it("types the value of a key from its declaration", () => {
            // The annotations are the assertion: a wrong one fails the build.
            const theme: "light" | "dark" = MODEL.getDefault("theme");
            const size: number = MODEL.getDefault("pageSize");
            expect([theme, size]).toEqual(["light", 25]);
        });

    });

    describe("Validation", () => {

        it("accepts a value of the declared type", () => {
            expect(MODEL.getValueError("theme", "dark")).toBeNull();
            expect(MODEL.getValueError("compactView", true)).toBeNull();
            expect(MODEL.getValueError("pageSize", 50)).toBeNull();
        });

        it("refuses a value of another type", () => {
            expect(MODEL.getValueError("pageSize", "50")).toMatch(/expected a number/);
            expect(MODEL.getValueError("compactView", 1)).toMatch(/expected a boolean/);
        });

        it("refuses a value outside the enumeration", () => {
            expect(MODEL.getValueError("theme", "purple")).toMatch(/expected one of/);
        });

        it("refuses NaN, which typeof calls a number", () => {
            expect(MODEL.getValueError("pageSize", Number.NaN)).toMatch(/finite/);
        });

        it("throws for a key that is not declared", () => {
            expect(() => MODEL.getDeclaration("nope" as never)).toThrow(/not declared/);
        });

    });

    describe("Reading and writing text", () => {

        it("reads back what it wrote", () => {
            for (const [key, value] of [
                ["theme", "dark"],
                ["compactView", true],
                ["pageSize", 7]
            ] as const) {
                expect(MODEL.parseValue(key, MODEL.serializeValue(key, value as never))).toBe(value);
            }
        });

        it("checks an enumeration read from text", () => {
            expect(MODEL.parseValue("theme", "dark")).toBe("dark");
            expect(() => MODEL.parseValue("theme", "purple")).toThrow(/expected one of/);
        });

    });

});
