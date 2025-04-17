import * as assert from "assert";
import { describe } from "mocha";
import { PublicationStatus, TEST_MODEL } from "./_data.spec";
import { EntitiesHandler } from "./handler";
import { TestContext, TestContextAdapter, TestPersistanceAdapter } from "./impl/test.adapters";
import { asNamed } from "./tools/named";

describe("EntitiesHandler", () => {
    type TablesFields = typeof TEST_MODEL.tablesFields;

    it("inserts independent entities and can refetch", async () => {
        const comparator = new TestContextAdapter();
        const adapter = new TestPersistanceAdapter<TablesFields>(TEST_MODEL);
        const handler = new EntitiesHandler<TablesFields, TestContext<keyof TablesFields>>(TEST_MODEL, comparator, adapter);

        const user1: TablesFields["users"] = {
            id: asNamed(0),
            name: asNamed("John"),
            surname: asNamed("Doe"),
            age: asNamed(42),
            size: null
        };
        const user2: TablesFields["users"] = {
            id: asNamed(0),
            name: asNamed("Jane"),
            surname: asNamed("Doe"),
            age: null, // It is not polite to ask a lady her age
            size: null
        };

        // -- First user --
        await handler.withTransaction((tr) => {
            tr.insert("users", user1);
        });
        await handler.waitForSubmit();
        // Make sure the ids were updated
        assert.equal(user1.id, 1, "The id should have been updated");

        // -- Second user --
        await handler.withTransaction((tr) => {
            tr.insert("users", user2);
        });
        await handler.waitForSubmit();
        // Make sure the id is updated
        assert.equal(user2.id, 2, "The id should have been updated");

        // -- Fetch --
        // Force a refresh
        handler.markCacheDirty();
        await handler.fetch({ table: "users" });

        // -- Check --
        const users = handler.getCache("users").getItems();
        assert.equal(users.length, 2, "There should be two users");
    });

    it("inserts a related item and refetch", async () => {
        const comparator = new TestContextAdapter();
        const adapter = new TestPersistanceAdapter<TablesFields>(TEST_MODEL);
        const handler = new EntitiesHandler<TablesFields, TestContext<keyof TablesFields>>(TEST_MODEL, comparator, adapter);

        // -- Insert an user and its first post -------------------------------
        await handler.withTransaction((tr) => {
            const user1: TablesFields["users"] = {
                id: asNamed(0),
                name: asNamed("John"),
                surname: asNamed("Doe"),
                age: asNamed(42),
                size: null
            };
            tr.insert("users", user1);
            const user1TmpId = user1.id;
            const post1: TablesFields["posts"] = {
                id: asNamed(0),
                author: user1TmpId, // Here we use the temporary id of the author
                title: asNamed("My first post"),
                content: asNamed("Hello **world**!"),
                status: asNamed(PublicationStatus.PUBLISHED)
            };
            tr.insert("posts", post1);
        });
        await handler.waitForSubmit();

        const user1 = handler.getCache("users").getById(1);
        const post1 = handler.getCache("posts").getById(2);

        assert.ok(user1, "The user should have been inserted");
        assert.ok(post1, "The post should have been inserted");

        // Make sure the related ids were updated
        assert.equal(post1.author, 1, "The related id should have been updated");

        // -- Update the post with a newly inserted user ----------------------
        await handler.withTransaction((tr) => {
            const user2: TablesFields["users"] = {
                id: asNamed(0),
                name: asNamed("Jane"),
                surname: asNamed("Doe"),
                age: null, // It is not polite to ask a lady her age
                size: null
            };
            tr.insert("users", user2);
            tr.update("posts", post1, { author: user2.id });
        });
        await handler.waitForSubmit();

        const user2 = handler.getCache("users").getById(3);
        assert.ok(user2, "The user should have been inserted");

        // Make sure the related ids were updated
        assert.equal(post1.author, 3, "The related id should have been updated");

        // -- Fetch --
        // Force a refresh
        handler.markCacheDirty();
        await handler.fetch({ table: "users", id: 1 });

        // -- Check --
        const users = handler.getCache("users").getItems();
        assert.equal(users.length, 1, "There should be one users as we only fetched one");
        const posts = handler.getCache("posts").getItems();
        assert.equal(posts.length, 0, "There should be no post since we reassigned the author");
    });

});