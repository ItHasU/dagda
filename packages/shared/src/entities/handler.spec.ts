import { describe, expect, it } from "vitest";
import { PublicationStatus, TEST_MODEL } from "./_data";
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
        expect(user1.id, "The id should have been updated").toBe(1);

        // -- Second user --
        await handler.withTransaction((tr) => {
            tr.insert("users", user2);
        });
        await handler.waitForSubmit();
        // Make sure the id is updated
        expect(user2.id, "The id should have been updated").toBe(2);

        // -- Fetch --
        // Force a refresh
        handler.markCacheDirty();
        await handler.fetch({ table: "users" });

        // -- Check --
        const users = handler.getCache("users").getItems();
        expect(users.length, "There should be two users").toBe(2);
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

        // Non-null assertions: the expectations right below are what actually
        // guard these lookups, but they do not narrow the type for the compiler.
        const user1 = handler.getCache("users").getById(1)!;
        const post1 = handler.getCache("posts").getById(2)!;

        expect(user1, "The user should have been inserted").toBeTruthy();
        expect(post1, "The post should have been inserted").toBeTruthy();

        // Make sure the related ids were updated
        expect(post1.author, "The related id should have been updated").toBe(1);

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

        const user2 = handler.getCache("users").getById(3)!;
        expect(user2, "The user should have been inserted").toBeTruthy();

        // Make sure the related ids were updated
        expect(post1.author, "The related id should have been updated").toBe(3);

        // -- Fetch --
        // Force a refresh
        handler.markCacheDirty();
        await handler.fetch({ table: "users", id: 1 });

        // -- Check --
        const users = handler.getCache("users").getItems();
        expect(users.length, "There should be one users as we only fetched one").toBe(1);
        const posts = handler.getCache("posts").getItems();
        expect(posts.length, "There should be no post since we reassigned the author").toBe(0);
    });

});