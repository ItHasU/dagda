import { describe, expect, it } from "vitest";
import { POST_KIND, PUBLICATION_STATUS, TEST_MODEL } from "./_data";
import { JSTypes } from "./tools/javascript.types";
import { asNamed } from "./tools/named";

describe("EntitiesModel", () => {

    it("returns undefined for typing getters", () => {
        expect(TEST_MODEL.typeNames).toBeUndefined();
        expect(TEST_MODEL.fieldTypes).toBeUndefined();
        expect(TEST_MODEL.tableNames).toBeUndefined();
        expect(TEST_MODEL.tablesFields).toBeUndefined();
    });

    it("returns the list of types", () => {
        expect(TEST_MODEL.getTypeNames()).toEqual(["USER_ID", "POST_ID", "INTEGER", "BOOLEAN", "TEXT", "NAME", "SURNAME", "MARKDOWN", "PUBLICATION_STATUS", "POST_KIND"]);
    });

    it("returns the list of tables", () => {
        expect(TEST_MODEL.getTableNames()).toEqual(["users", "posts"]);
    });

    it("returns the list of fields for a table", () => {
        expect(TEST_MODEL.getTableFieldNames("users", 0)).toEqual(["id", "name", "surname", "size"]);
        expect(TEST_MODEL.getTableFieldNames("users", 1)).toEqual(["id", "name", "surname", "age"]);
        expect(TEST_MODEL.getTableFieldNames("users", 2)).toEqual(["id", "name", "surname", "age"]);
        expect(TEST_MODEL.getTableFieldNames("users")).toEqual(["id", "name", "surname", "age"]);
    });

    it("returns the type of a field", () => {
        expect(TEST_MODEL.getFieldTypeName("users", "age")).toBe("INTEGER");
    });

    it("returns if a field is optional or not", () => {
        expect(TEST_MODEL.isFieldOptional("users", "name")).toBe(false);
        expect(TEST_MODEL.isFieldOptional("users", "age")).toBe(true);
    });

    it("returns if a field is an identity or not", () => {
        expect(TEST_MODEL.isFieldIdentity("users", "id")).toBe(true);
        expect(TEST_MODEL.isFieldIdentity("users", "name")).toBe(false);
    });

    it("returns if a field is a foreign key or not", () => {
        expect(TEST_MODEL.isFieldForeign("posts", "author")).toBe(true);
        expect(TEST_MODEL.isFieldForeign("posts", "title")).toBe(false);
    });

    it("returns the foreign table name of a field", () => {
        expect(TEST_MODEL.getFieldForeignTableName("posts", "author")).toBe("users");
        expect(TEST_MODEL.getFieldForeignTableName("posts", "title")).toBe(null);
    });

    it("returns the foreign keys of a table", () => {
        expect(TEST_MODEL.getTableForeignKeys("users")).toEqual({
            id: null,
            name: null,
            surname: null,
            age: null
        });
        expect(TEST_MODEL.getTableForeignKeys("posts")).toEqual({
            id: null,
            author: "users",
            title: null,
            content: null,
            status: null,
            kind: null,
            pinned: null
        });
    });

    it("provides typings", () => {
        const user: typeof TEST_MODEL.tablesFields["users"] = {
            id: asNamed(0),
            name: asNamed("John"),
            surname: asNamed("Doe"),
            age: null,
            size: null
        };
        expect(user.name).toBe("John");
    });

    it("provides the enumeration of a type and of a field", () => {
        expect(TEST_MODEL.getEnum("PUBLICATION_STATUS")).toBe(PUBLICATION_STATUS);
        expect(TEST_MODEL.getEnum("TEXT")).toBe(null);
        expect(TEST_MODEL.getFieldEnum("posts", "status")).toBe(PUBLICATION_STATUS);
        expect(TEST_MODEL.getFieldEnum("posts", "kind")).toBe(POST_KIND);
        expect(TEST_MODEL.getFieldEnum("posts", "title")).toBe(null);
    });

    it("exposes the raw type of an enumeration through the model", () => {
        // The enumeration doubles as the field type definition,
        // so the storage type stays available for the schema generation.
        expect(TEST_MODEL.getTypeDefinition("PUBLICATION_STATUS")?.rawType).toBe(JSTypes.number);
        expect(TEST_MODEL.getTypeDefinition("POST_KIND")?.rawType).toBe(JSTypes.string);
        expect(TEST_MODEL.getTypeDefinition("UNKNOWN" as any)).toBeUndefined();
    });

    it("types an enumeration field with the union of its values", () => {
        const post: typeof TEST_MODEL.tablesFields["posts"] = {
            id: asNamed(0),
            author: asNamed(1),
            title: asNamed("Hello"),
            content: asNamed("World"),
            status: asNamed(PUBLICATION_STATUS.values.DRAFT),
            kind: asNamed(POST_KIND.values.NOTE),
            pinned: null
        };
        expect(post.status).toBe(1);
        expect(post.kind).toBe("note");

        // @ts-expect-error a value outside of the enumeration is a compilation error
        post.status = asNamed(3);
        // @ts-expect-error a value of the wrong enumeration is a compilation error
        post.kind = asNamed(PUBLICATION_STATUS.values.DRAFT);
    });

});
