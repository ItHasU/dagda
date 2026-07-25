import { describe, expect, it } from "vitest";
import { SQLTransactionData } from "../sql/transaction";
import { POST_KIND, PUBLICATION_STATUS, TEST_MODEL } from "./_data";
import { EntitiesHandler } from "./handler";
import { Data, PersistenceAdapter, SQLTransactionResult } from "./tools/adapters";
import { alsoIntersectsOtherTypes, alwaysIntersects, buildContextAdapter, intersectsOnEqualOptions } from "./tools/contexts";
import { asNamed } from "./tools/named";
import { BaseContext } from "./types";

type TablesFields = typeof TEST_MODEL.tablesFields;

/** The whole list of users, no option */
type UsersContext = BaseContext<"users", undefined>;
/** The posts of one author : the context with options EurekAI needs */
type PostsContext = BaseContext<"posts", { authorId: number }>;

type AppContexts = UsersContext | PostsContext;

/**
 * An application declares one rule per context type instead of writing
 * a full ContextAdapter by hand.
 */
const CONTEXT_ADAPTER = buildContextAdapter<AppContexts>({
    users: alwaysIntersects(),
    posts: intersectsOnEqualOptions()
});

/** Minimal persistence adapter counting the fetches, to observe the cache */
class ContextPersistenceAdapter implements PersistenceAdapter<TablesFields, AppContexts> {

    public readonly fetchedContexts: AppContexts[] = [];

    constructor(protected readonly _users: TablesFields["users"][], protected readonly _posts: TablesFields["posts"][]) { }

    public fetch(context: AppContexts): Promise<Data<TablesFields>> {
        this.fetchedContexts.push(context);
        switch (context.type) {
            case "users":
                return Promise.resolve({ users: this._users });
            case "posts":
                return Promise.resolve({ posts: this._posts.filter(post => post.author === context.options.authorId) });
        }
    }

    public submit(_transactionData: SQLTransactionData<TablesFields, AppContexts>): Promise<SQLTransactionResult> {
        return Promise.resolve({ updatedIds: {} });
    }
}

function buildHandler(): { handler: EntitiesHandler<TablesFields, AppContexts>, adapter: ContextPersistenceAdapter } {
    const users: TablesFields["users"][] = [
        { id: asNamed(1), name: asNamed("John"), surname: asNamed("Doe"), age: asNamed(42), size: null },
        { id: asNamed(2), name: asNamed("Jane"), surname: asNamed("Doe"), age: null, size: null }
    ];
    const posts: TablesFields["posts"][] = [
        { id: asNamed(1), author: asNamed(1), title: asNamed("A"), content: asNamed("a"), status: asNamed(PUBLICATION_STATUS.values.DRAFT), kind: asNamed(POST_KIND.values.ARTICLE), pinned: null },
        { id: asNamed(2), author: asNamed(2), title: asNamed("B"), content: asNamed("b"), status: asNamed(PUBLICATION_STATUS.values.PUBLISHED), kind: asNamed(POST_KIND.values.NOTE), pinned: null }
    ];
    const adapter = new ContextPersistenceAdapter(users, posts);
    return {
        handler: new EntitiesHandler<TablesFields, AppContexts>(TEST_MODEL, CONTEXT_ADAPTER, adapter),
        adapter
    };
}

describe("EntitiesHandler with contexts holding options", () => {

    it("fetches a context with options and keeps it in cache", async () => {
        const { handler, adapter } = buildHandler();
        const context: PostsContext = { type: "posts", options: { authorId: 1 } };

        expect(await handler.fetch(context)).toBe(true);
        expect(handler.getItems("posts").map(post => post.id)).toEqual([1]);

        // Same options : the context is already loaded, nothing is fetched again
        expect(await handler.fetch({ type: "posts", options: { authorId: 1 } })).toBe(false);
        expect(adapter.fetchedContexts).toHaveLength(1);
    });

    it("fetches again when the options differ", async () => {
        const { handler, adapter } = buildHandler();

        await handler.fetch({ type: "posts", options: { authorId: 1 } });
        expect(await handler.fetch({ type: "posts", options: { authorId: 2 } })).toBe(true);
        expect(adapter.fetchedContexts).toHaveLength(2);
        // Both contexts are merged in the same cache
        expect(handler.getItems("posts").map(post => post.id).sort()).toEqual([1, 2]);
    });

    it("only marks dirty the contexts whose options intersect", async () => {
        const { handler, adapter } = buildHandler();

        await handler.fetch({ type: "posts", options: { authorId: 1 } });
        await handler.fetch({ type: "posts", options: { authorId: 1 } }, { type: "users", options: undefined });
        const fetchesBefore = adapter.fetchedContexts.length;

        // A change on the posts of the author 2 does not concern the author 1
        handler.markCacheDirty({ type: "posts", options: { authorId: 2 } });
        expect(await handler.fetch({ type: "posts", options: { authorId: 1 } })).toBe(false);
        expect(adapter.fetchedContexts).toHaveLength(fetchesBefore);

        // A change on the posts of the author 1 does
        handler.markCacheDirty({ type: "posts", options: { authorId: 1 } });
        expect(await handler.fetch({ type: "posts", options: { authorId: 1 } })).toBe(true);
        expect(adapter.fetchedContexts).toHaveLength(fetchesBefore + 1);
    });

    it("marks dirty every context of an always intersecting type", async () => {
        const { handler } = buildHandler();

        await handler.fetch({ type: "users", options: undefined }, { type: "posts", options: { authorId: 1 } });
        handler.markCacheDirty({ type: "users", options: undefined });

        expect(await handler.fetch({ type: "users", options: undefined })).toBe(true);
        // The posts context was not touched
        expect(await handler.fetch({ type: "posts", options: { authorId: 1 } })).toBe(false);
    });

    it("carries the active contexts in the transactions", async () => {
        const { handler } = buildHandler();
        const context: PostsContext = { type: "posts", options: { authorId: 1 } };
        await handler.fetch(context);

        let broadcastedContexts: AppContexts[] = [];
        await handler.withTransaction(transaction => {
            broadcastedContexts = transaction.contexts;
        });
        await handler.waitForSubmit();

        expect(broadcastedContexts).toEqual([context]);
    });

});

//#region Cross type invalidation ---------------------------------------------

/**
 * Same shape as MQTTToolbox 2 : the "users" list carries a summary of what
 * happens in "posts", so the invalidation has to cross the context types.
 *
 * The relation is declared on the list side only.
 */
const CROSS_TYPE_ADAPTER = buildContextAdapter<AppContexts>({
    users: alsoIntersectsOtherTypes(alwaysIntersects()),
    posts: intersectsOnEqualOptions()
});

function buildCrossTypeHandler(): EntitiesHandler<TablesFields, AppContexts> {
    const users: TablesFields["users"][] = [
        { id: asNamed(1), name: asNamed("John"), surname: asNamed("Doe"), age: asNamed(42), size: null }
    ];
    const posts: TablesFields["posts"][] = [
        { id: asNamed(1), author: asNamed(1), title: asNamed("A"), content: asNamed("a"), status: asNamed(PUBLICATION_STATUS.values.DRAFT), kind: asNamed(POST_KIND.values.ARTICLE), pinned: null },
        { id: asNamed(2), author: asNamed(2), title: asNamed("B"), content: asNamed("b"), status: asNamed(PUBLICATION_STATUS.values.PUBLISHED), kind: asNamed(POST_KIND.values.NOTE), pinned: null }
    ];
    return new EntitiesHandler<TablesFields, AppContexts>(TEST_MODEL, CROSS_TYPE_ADAPTER, new ContextPersistenceAdapter(users, posts));
}

describe("EntitiesHandler with contexts intersecting across types", () => {

    it("marks a context of another type dirty", async () => {
        const handler = buildCrossTypeHandler();
        await handler.fetch(
            { type: "users", options: undefined },
            { type: "posts", options: { authorId: 1 } },
            { type: "posts", options: { authorId: 2 } });

        // What a client does when the server reports a change it made itself,
        // here on the posts of the author 1 only.
        handler.markCacheDirty({ type: "posts", options: { authorId: 1 } });

        // The list is stale although it is a context of another type
        expect(await handler.fetch({ type: "users", options: undefined })).toBe(true);
        // The posts of the author 2 are untouched
        expect(await handler.fetch({ type: "posts", options: { authorId: 2 } })).toBe(false);
        // The posts of the author 1 are stale too
        expect(await handler.fetch({ type: "posts", options: { authorId: 1 } })).toBe(true);
    });

    it("invalidates in the other direction too, with no extra declaration", async () => {
        const handler = buildCrossTypeHandler();
        await handler.fetch(
            { type: "users", options: undefined },
            { type: "posts", options: { authorId: 1 } });

        handler.markCacheDirty({ type: "users", options: undefined });

        expect(await handler.fetch({ type: "posts", options: { authorId: 1 } })).toBe(true);
        expect(await handler.fetch({ type: "users", options: undefined })).toBe(true);
    });

    it("leaves the other type alone when no relation is declared", async () => {
        const handler = buildHandler().handler; // Adapter without any cross type rule
        await handler.fetch(
            { type: "users", options: undefined },
            { type: "posts", options: { authorId: 1 } });

        handler.markCacheDirty({ type: "posts", options: { authorId: 1 } });

        expect(await handler.fetch({ type: "users", options: undefined })).toBe(false);
        expect(await handler.fetch({ type: "posts", options: { authorId: 1 } })).toBe(true);
    });

});

//#endregion
