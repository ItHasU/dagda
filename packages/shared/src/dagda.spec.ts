import { describe, expect, it, vi } from "vitest";
import { BaseAppTypes } from "./app/types";
import { Dagda } from "./dagda";
import { TestContext, TestContextAdapter, TestPersistanceAdapter } from "./entities/impl/test.adapters";
import { EntitiesHandler } from "./entities/handler";
import { TEST_MODEL } from "./entities/_data";

type TablesFields = typeof TEST_MODEL.tablesFields;

interface TestAppTypes extends BaseAppTypes {
    entities: TablesFields;
    contexts: TestContext<keyof TablesFields>;
}

function buildParams() {
    return {
        model: TEST_MODEL,
        contextAdapter: new TestContextAdapter(),
        persistence: new TestPersistanceAdapter<TablesFields>(TEST_MODEL),
        notification: { on: vi.fn(), broadcast: vi.fn(), notifyLocal: vi.fn() }
    };
}

describe("Dagda", () => {

    it("assigns the given notification service as a real property", () => {
        const params = buildParams();
        const dagda = new Dagda<TestAppTypes>(params);
        expect(dagda.notification).toBe(params.notification);
    });

    it("builds the entities service around the given model/contextAdapter/persistence", () => {
        const dagda = new Dagda<TestAppTypes>(buildParams());
        expect(dagda.entities.getHandler()).toBeInstanceOf(EntitiesHandler);
    });

    it("defaults log to the console logger when none is given", () => {
        const dagda = new Dagda<TestAppTypes>(buildParams());
        expect(dagda.log.log).toBeTypeOf("function");
        expect(dagda.log.handleError).toBeTypeOf("function");
    });

    it("uses the given log instead of the default when provided", () => {
        const log = { log: vi.fn(), handleError: vi.fn() };
        const dagda = new Dagda<TestAppTypes>({ ...buildParams(), log });
        expect(dagda.log).toBe(log);
    });

    it("shares one entities handler across calls by default", () => {
        const dagda = new Dagda<TestAppTypes>(buildParams());
        expect(dagda.entities.getHandler()).toBe(dagda.entities.getHandler());
    });

    it("builds a new entities handler on every call when handlerPerCall is set", () => {
        const dagda = new Dagda<TestAppTypes>({ ...buildParams(), handlerPerCall: true });
        expect(dagda.entities.getHandler()).not.toBe(dagda.entities.getHandler());
    });

});
