import { describe, expect, it } from "vitest";
import { POST_KIND, PUBLICATION_STATUS, TEST_MODEL } from "../_data";
import { asNamed } from "./named";
import { EntityValidationException } from "./validation";

/** A valid post, cloned by the tests that need to break one field */
function validPost(): Record<string, unknown> {
    return {
        id: asNamed(1),
        author: asNamed(2),
        title: asNamed("Title"),
        content: asNamed("Content"),
        status: asNamed(PUBLICATION_STATUS.values.DRAFT),
        kind: asNamed(POST_KIND.values.NOTE),
        pinned: null
    };
}

describe("Entity validation", () => {

    it("accepts a valid entity", () => {
        expect(TEST_MODEL.getEntityErrors("posts", validPost())).toEqual([]);
        expect(() => TEST_MODEL.validateEntity("posts", validPost())).not.toThrow();
    });

    it("accepts an optional field set to null or undefined, or missing", () => {
        expect(TEST_MODEL.getEntityErrors("posts", { ...validPost(), pinned: null })).toEqual([]);
        expect(TEST_MODEL.getEntityErrors("posts", { ...validPost(), pinned: undefined })).toEqual([]);
        const post = validPost();
        delete post["pinned"];
        expect(TEST_MODEL.getEntityErrors("posts", post)).toEqual([]);
    });

    it("reports a missing mandatory field, naming the table and the field", () => {
        const post = validPost();
        delete post["title"];
        const errors = TEST_MODEL.getEntityErrors("posts", post);
        expect(errors).toHaveLength(1);
        expect(errors[0]?.table).toBe("posts");
        expect(errors[0]?.field).toBe("title");
        expect(errors[0]?.message).toBe(`Table "posts", field "title": a value is required`);
    });

    it("reports a mandatory field explicitly set to null", () => {
        const errors = TEST_MODEL.getEntityErrors("posts", { ...validPost(), status: null });
        expect(errors).toHaveLength(1);
        expect(errors[0]?.message).toBe(`Table "posts", field "status": a value is required`);
    });

    it("reports an unknown field", () => {
        const errors = TEST_MODEL.getEntityErrors("posts", { ...validPost(), oops: 1 });
        expect(errors).toHaveLength(1);
        expect(errors[0]?.field).toBe("oops");
        expect(errors[0]?.message).toBe(`Table "posts": unknown field "oops"`);
    });

    it("reports a field of the wrong type, naming the declared type", () => {
        const errors = TEST_MODEL.getEntityErrors("posts", { ...validPost(), title: 42 });
        expect(errors).toHaveLength(1);
        expect(errors[0]?.message).toBe(`Table "posts", field "title": expected a string for the type "TEXT", got 42`);
    });

    it("reports every problem at once", () => {
        const errors = TEST_MODEL.getEntityErrors("posts", {
            id: 1,
            author: "not an id",
            title: "Title",
            content: 12,
            status: 42,
            kind: POST_KIND.values.NOTE,
            oops: true
        });
        expect(errors.map(error => error.field)).toEqual(["oops", "author", "content", "status"]);
    });

    it("checks the numbers", () => {
        expect(TEST_MODEL.getEntityErrors("posts", { ...validPost(), author: "1" })[0]?.message)
            .toBe(`Table "posts", field "author": expected a number for the type "USER_ID", got "1"`);
        expect(TEST_MODEL.getEntityErrors("posts", { ...validPost(), author: NaN })[0]?.message)
            .toBe(`Table "posts", field "author": expected a number for the type "USER_ID", got NaN`);
    });

    it("checks the booleans", () => {
        const errors = TEST_MODEL.getEntityErrors("posts", { ...validPost(), pinned: "yes" });
        expect(errors[0]?.message).toBe(`Table "posts", field "pinned": expected a boolean for the type "BOOLEAN", got "yes"`);
        expect(TEST_MODEL.getEntityErrors("posts", { ...validPost(), pinned: true })).toEqual([]);
    });

    it("reports a value outside of an integer enumeration", () => {
        const errors = TEST_MODEL.getEntityErrors("posts", { ...validPost(), status: 42 });
        expect(errors).toHaveLength(1);
        expect(errors[0]?.message).toBe(`Table "posts", field "status": 42 is not a valid value for the enumeration "PUBLICATION_STATUS" (expected one of 1, 2)`);
    });

    it("reports a value outside of a string enumeration", () => {
        const errors = TEST_MODEL.getEntityErrors("posts", { ...validPost(), kind: "poem" });
        expect(errors).toHaveLength(1);
        expect(errors[0]?.message).toBe(`Table "posts", field "kind": "poem" is not a valid value for the enumeration "POST_KIND" (expected one of "article", "note")`);
    });

    it("does not accept the uid of an enumeration in place of its value", () => {
        const errors = TEST_MODEL.getEntityErrors("posts", { ...validPost(), kind: "NOTE" });
        expect(errors).toHaveLength(1);
        expect(errors[0]?.field).toBe("kind");
    });

    it("rejects anything that is not an object", () => {
        expect(TEST_MODEL.getEntityErrors("posts", null)[0]?.message).toBe(`Table "posts": expected an object, got null`);
        expect(TEST_MODEL.getEntityErrors("posts", undefined)[0]?.message).toBe(`Table "posts": expected an object, got undefined`);
        expect(TEST_MODEL.getEntityErrors("posts", "post")[0]?.message).toBe(`Table "posts": expected an object, got string`);
        expect(TEST_MODEL.getEntityErrors("posts", [])[0]?.message).toBe(`Table "posts": expected an object, got array`);
    });

    it("rejects an unknown table", () => {
        expect(TEST_MODEL.getEntityErrors("nope" as any, validPost())[0]?.message).toBe(`Unknown table "nope"`);
    });

    it("only checks the provided fields in partial mode", () => {
        // What an update carries : a few fields, no id
        expect(TEST_MODEL.getEntityErrors("posts", { title: "New title" }, { partial: true })).toEqual([]);
        expect(TEST_MODEL.getEntityErrors("posts", { status: 42 }, { partial: true })).toHaveLength(1);
        // A mandatory field explicitly set to null is still reported
        expect(TEST_MODEL.getEntityErrors("posts", { title: null }, { partial: true })).toHaveLength(1);
        // An unknown field is still reported
        expect(TEST_MODEL.getEntityErrors("posts", { oops: 1 }, { partial: true })).toHaveLength(1);
    });

    it("validates against a given version of the model", () => {
        const user = {
            id: asNamed(1),
            name: asNamed("John"),
            surname: asNamed("Doe"),
            size: asNamed(180)
        };
        // "size" exists in version 0, "age" does not
        expect(TEST_MODEL.getEntityErrors("users", user, { version: 0 })).toEqual([]);
        // In the current version, "size" is gone and "age" is optional
        const errors = TEST_MODEL.getEntityErrors("users", user);
        expect(errors).toHaveLength(1);
        expect(errors[0]?.field).toBe("size");
    });

    it("throws an exception carrying every error", () => {
        try {
            TEST_MODEL.validateEntity("posts", { ...validPost(), status: 42, title: 1 });
            expect.unreachable("validateEntity should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(EntityValidationException);
            const exception = e as EntityValidationException;
            expect(exception.errors).toHaveLength(2);
            expect(exception.message).toContain(`field "title"`);
            expect(exception.message).toContain(`field "status"`);
        }
    });

});
