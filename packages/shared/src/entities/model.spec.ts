import * as assert from "assert";
import { describe, it } from "mocha";
import { TEST_MODEL } from "./_data.spec";
import { asNamed } from "./tools/named";

describe("EntitiesModel", () => {

    it("returns undefined for typing getters", () => {
        assert.equal(undefined, TEST_MODEL.typeNames);
        assert.equal(undefined, TEST_MODEL.fieldTypes);
        assert.equal(undefined, TEST_MODEL.tableNames);
        assert.equal(undefined, TEST_MODEL.tablesFields);
    });

    it("returns the list of types", () => {
        assert.deepEqual(["USER_ID", "POST_ID", "INTEGER", "TEXT", "NAME", "SURNAME", "MARKDOWN", "PUBLICATION_STATUS"], TEST_MODEL.getTypeNames());
    });

    it("returns the list of tables", () => {
        assert.deepEqual(["users", "posts"], TEST_MODEL.getTableNames());
    });

    it("returns the list of fields for a table", () => {
        assert.deepEqual(["id", "name", "surname", "size"], TEST_MODEL.getTableFieldNames("users", 0));
        assert.deepEqual(["id", "name", "surname", "age"], TEST_MODEL.getTableFieldNames("users", 1));
        assert.deepEqual(["id", "name", "surname", "age"], TEST_MODEL.getTableFieldNames("users", 2));
        assert.deepEqual(["id", "name", "surname", "age"], TEST_MODEL.getTableFieldNames("users"));
    });

    it("returns the type of a field", () => {
        assert.equal("INTEGER", TEST_MODEL.getFieldTypeName("users", "age"));
    });

    it("returns if a field is optional or not", () => {
        assert.equal(false, TEST_MODEL.isFieldOptional("users", "name"));
        assert.equal(true, TEST_MODEL.isFieldOptional("users", "age"));
    });

    it("returns if a field is an identity or not", () => {
        assert.equal(true, TEST_MODEL.isFieldIdentity("users", "id"));
        assert.equal(false, TEST_MODEL.isFieldIdentity("users", "name"));
    });

    it("returns if a field is a foreign key or not", () => {
        assert.equal(true, TEST_MODEL.isFieldForeign("posts", "author"));
        assert.equal(false, TEST_MODEL.isFieldForeign("posts", "title"));
    });

    it("returns the foreign table name of a field", () => {
        assert.equal("users", TEST_MODEL.getFieldForeignTableName("posts", "author"));
        assert.equal(null, TEST_MODEL.getFieldForeignTableName("posts", "title"));
    });

    it("returns the foreign keys of a table", () => {
        assert.deepEqual({
            id: null,
            name: null,
            surname: null,
            age: null
        }, TEST_MODEL.getTableForeignKeys("users"));
        assert.deepEqual({
            id: null,
            author: "users",
            title: null,
            content: null,
            status: null
        }, TEST_MODEL.getTableForeignKeys("posts"));
    });

    it("provides typings", () => {
        const user: typeof TEST_MODEL.tablesFields["users"] = {
            id: asNamed(0),
            name: asNamed("John"),
            surname: asNamed("Doe"),
            age: null,
            size: null
        };
    });

});
