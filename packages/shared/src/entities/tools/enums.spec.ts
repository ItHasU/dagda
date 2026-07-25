import { describe, expect, it } from "vitest";
import { EntitiesModel } from "../model";
import { EnumDefinition } from "./enums";
import { JSTypes } from "./javascript.types";

/** Integer backed enumeration, with values that are neither contiguous nor in order */
const COMPUTATION_STATUS = EntitiesModel.enum({
    PENDING: { value: 10, label: "Pending" },
    DONE: { value: 2, label: "Done" },
    ERROR: { value: 99, label: "Error" }
});

/** String backed enumeration */
const PICTURE_TYPE = EntitiesModel.enum({
    PREFERRED: { value: "preferred", label: "Preferred picture" },
    ALTERNATE: { value: "alternate", label: "Alternate picture" }
});

describe("EnumDefinition", () => {

    it("keeps the values chosen by the developer", () => {
        // This is the guarantee that makes the EurekAI conversion possible :
        // values are never derived from the declaration order.
        expect(COMPUTATION_STATUS.values.PENDING).toBe(10);
        expect(COMPUTATION_STATUS.values.DONE).toBe(2);
        expect(COMPUTATION_STATUS.values.ERROR).toBe(99);
        expect(PICTURE_TYPE.values.PREFERRED).toBe("preferred");
    });

    it("derives the raw type from the values", () => {
        expect(COMPUTATION_STATUS.rawType).toBe(JSTypes.number);
        expect(PICTURE_TYPE.rawType).toBe(JSTypes.string);
    });

    it("returns the uids and the values in declaration order", () => {
        expect(COMPUTATION_STATUS.getUids()).toEqual(["PENDING", "DONE", "ERROR"]);
        expect(COMPUTATION_STATUS.getValues()).toEqual([10, 2, 99]);
        expect(PICTURE_TYPE.getUids()).toEqual(["PREFERRED", "ALTERNATE"]);
    });

    it("returns the entries a dropdown needs", () => {
        expect(PICTURE_TYPE.getEntries()).toEqual([
            { uid: "PREFERRED", value: "preferred", label: "Preferred picture" },
            { uid: "ALTERNATE", value: "alternate", label: "Alternate picture" }
        ]);
    });

    it("resolves an entry from its uid", () => {
        expect(COMPUTATION_STATUS.getEntry("DONE")).toEqual({ uid: "DONE", value: 2, label: "Done" });
        expect(() => COMPUTATION_STATUS.getEntry("MISSING" as any)).toThrowError(/Unknown enumeration uid "MISSING"/);
    });

    it("resolves an entry, a label and an uid from a value", () => {
        expect(COMPUTATION_STATUS.getEntryByValue(99)).toEqual({ uid: "ERROR", value: 99, label: "Error" });
        expect(COMPUTATION_STATUS.getLabel(10)).toBe("Pending");
        expect(COMPUTATION_STATUS.getUid(2)).toBe("DONE");
        expect(PICTURE_TYPE.getLabel("alternate")).toBe("Alternate picture");
    });

    it("returns null for a value that is not declared", () => {
        expect(COMPUTATION_STATUS.getEntryByValue(3)).toBe(null);
        expect(COMPUTATION_STATUS.getLabel(3)).toBe(null);
        expect(COMPUTATION_STATUS.getUid(3)).toBe(null);
        expect(COMPUTATION_STATUS.getLabel(null)).toBe(null);
        expect(COMPUTATION_STATUS.getLabel(undefined)).toBe(null);
    });

    it("tells if a value is declared", () => {
        expect(COMPUTATION_STATUS.isValidValue(10)).toBe(true);
        expect(COMPUTATION_STATUS.isValidValue(3)).toBe(false);
        expect(COMPUTATION_STATUS.isValidValue("10")).toBe(false);
        expect(COMPUTATION_STATUS.isValidValue(null)).toBe(false);
        expect(COMPUTATION_STATUS.isValidValue(undefined)).toBe(false);
        expect(PICTURE_TYPE.isValidValue("preferred")).toBe(true);
        expect(PICTURE_TYPE.isValidValue("PREFERRED")).toBe(false);
    });

    it("returns undefined for the typing getters", () => {
        expect(COMPUTATION_STATUS.type).toBeUndefined();
        expect(COMPUTATION_STATUS.uidType).toBeUndefined();
    });

    it("provides the type of its values", () => {
        // Compilation is the actual test here
        const status: typeof COMPUTATION_STATUS.type = COMPUTATION_STATUS.values.DONE;
        expect(status).toBe(2);

        // @ts-expect-error a value outside of the enumeration is a compilation error
        const invalid: typeof COMPUTATION_STATUS.type = 3;
        expect(invalid).toBe(3);

        // @ts-expect-error an uid that was not declared is a compilation error
        expect(COMPUTATION_STATUS.values.MISSING).toBeUndefined();

        const uid: typeof COMPUTATION_STATUS.uidType = "ERROR";
        expect(uid).toBe("ERROR");
    });

    it("rejects an empty declaration", () => {
        expect(() => new EnumDefinition({})).toThrowError(/at least one entry/);
    });

    it("rejects values of mixed types", () => {
        expect(() => EntitiesModel.enum({
            A: { value: 1, label: "A" },
            B: { value: "b", label: "B" }
        })).toThrowError(/all values must share the same type/);
    });

    it("rejects duplicated values", () => {
        expect(() => EntitiesModel.enum({
            A: { value: 1, label: "A" },
            B: { value: 1, label: "B" }
        })).toThrowError(/reuses the value 1 of "A"/);
    });

    it("rejects values that are neither numbers nor strings", () => {
        expect(() => new EnumDefinition({
            A: { value: true as any, label: "A" }
        })).toThrowError(/invalid value type \(boolean\)/);
    });

});
