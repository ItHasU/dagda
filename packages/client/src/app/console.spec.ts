import { EntitiesService } from "@dagda/shared/src/entities/service";
import { SQLTransaction } from "@dagda/shared/src/sql/transaction";
import { SystemInfoRoute } from "@dagda/shared/src/api/impl/system.api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({ apiCall: vi.fn().mockResolvedValue("api-result") }));
vi.mock("../actions", () => ({ actionCall: vi.fn().mockResolvedValue("action-result") }));

// Imported after the mocks so the mocked modules are what console.ts sees.
import { apiCall } from "../api";
import { actionCall } from "../actions";
import { installConsoleGlobal } from "./console";
import { buildModelProxy, encapsulate } from "./model";
import { _setDagda } from "./dagda";

/** A fake entities handler whose withTransaction/waitForSubmit are directly observable */
function buildFakeEntities(): { entities: EntitiesService<any, any>["entities"], submitted: SQLTransaction<any, any>[] } {
    const submitted: SQLTransaction<any, any>[] = [];
    const handler = {
        withTransaction: vi.fn(async (f: (tr: SQLTransaction<any, any>) => Promise<void> | void) => {
            const tr = new SQLTransaction<any, any>({ getCache: () => ({ insert: () => {} }) } as any, []);
            submitted.push(tr);
            await f(tr);
        }),
        waitForSubmit: vi.fn(async () => { /* resolved immediately, mirrors an already-drained queue */ })
    };
    // dagda.entities is directly {getHandler}, the same shape a real ClientDagda field holds.
    return { entities: { getHandler: () => handler as any }, submitted };
}

describe("console.ts", () => {

    beforeEach(() => {
        // A minimal stand-in for the running application's dagda instance —
        // real fields are added per-test (entities), the rest is untouched.
        _setDagda({} as any);
    });

    afterEach(() => {
        vi.clearAllMocks();
        delete (globalThis as any).dagda;
    });

    describe("encapsulate", () => {
        it("opens a transaction, runs the callback, submits and awaits it, and returns the callback's result", async () => {
            const { entities, submitted } = buildFakeEntities();
            _setDagda({ entities } as any);

            const result = await encapsulate(async (tr) => {
                expect(tr).toBeInstanceOf(SQLTransaction);
                return "done";
            });

            expect(result).toBe("done");
            expect(submitted).toHaveLength(1);
        });
    });

    describe("dagda.system / dagda.api", () => {
        function install(routes: SystemInfoRoute[]): void {
            installConsoleGlobal<any>({ getRoutes: () => routes });
        }

        it("splits by origin — dagda.system only lists the framework's own, dagda.api only the application's", () => {
            install([
                { name: "getSystemInfo", kind: "route", origin: "system", type: "internal" },
                { name: "publishMessage", kind: "action", origin: "app", type: "internal" }
            ]);
            expect(Object.keys((globalThis as any).dagda.system)).toEqual(["getSystemInfo"]);
            expect(Object.keys((globalThis as any).dagda.api)).toEqual(["publishMessage"]);
        });

        it("dispatches a 'route'-kind entry through apiCall", async () => {
            install([{ name: "getSystemInfo", kind: "route", origin: "system", type: "internal" }]);
            const result = await (globalThis as any).dagda.system.getSystemInfo();
            expect(apiCall).toHaveBeenCalledWith("getSystemInfo", {});
            expect(result).toBe("api-result");
        });

        it("dispatches an 'action'-kind entry through actionCall", async () => {
            install([{ name: "publishMessage", kind: "action", origin: "app", type: "internal" }]);
            const result = await (globalThis as any).dagda.api.publishMessage({ topic: "a" });
            expect(actionCall).toHaveBeenCalledWith("publishMessage", { topic: "a" });
            expect(result).toBe("action-result");
        });

        it("throws a clear error for an unregistered name instead of silently calling the server", async () => {
            install([]);
            await expect((globalThis as any).dagda.system.doesNotExist()).rejects.toThrow(/Unknown dagda.system entry/);
            await expect((globalThis as any).dagda.api.doesNotExist()).rejects.toThrow(/Unknown dagda.api entry/);
        });

        it("keeps an app-origin entry out of dagda.system, and vice versa", async () => {
            install([{ name: "publishMessage", kind: "action", origin: "app", type: "internal" }]);
            await expect((globalThis as any).dagda.system.publishMessage()).rejects.toThrow(/Unknown dagda.system entry/);
        });
    });

    describe("dagda.model", () => {
        it("is a real, typed field of dagda — set at construction, not by installConsoleGlobal", () => {
            _setDagda({ model: buildModelProxy({ bare: () => {}, described: { description: "does a thing", fn: () => {} } }) } as any);
            installConsoleGlobal<any>({ getRoutes: () => [] });
            expect(Object.keys((globalThis as any).dagda.model).sort()).toEqual(["bare", "described"]);
        });

        it("auto-opens and submits its own transaction when called without one", async () => {
            const { entities, submitted } = buildFakeEntities();
            const fn = vi.fn((_tr: SQLTransaction<any, any>, name: string) => `hello ${name}`);
            _setDagda({ entities, model: buildModelProxy({ greet: fn }) } as any);
            installConsoleGlobal<any>({ getRoutes: () => [] });

            const result = await (globalThis as any).dagda.model.greet("world");

            expect(result).toBe("hello world");
            expect(submitted).toHaveLength(1);
            expect(fn).toHaveBeenCalledWith(submitted[0], "world");
        });

        it("passes an explicit transaction straight through instead of opening a second one", async () => {
            const { entities, submitted } = buildFakeEntities();
            const fn = vi.fn((_tr: SQLTransaction<any, any>, name: string) => `hi ${name}`);
            _setDagda({ entities, model: buildModelProxy({ greet: fn }) } as any);
            installConsoleGlobal<any>({ getRoutes: () => [] });

            const ownTr = new SQLTransaction<any, any>({ getCache: () => ({ insert: () => {} }) } as any, []);
            const result = await (globalThis as any).dagda.model.greet(ownTr, "world");

            expect(result).toBe("hi world");
            // No transaction was opened by the proxy itself — the only one
            // that exists is the one the caller supplied.
            expect(submitted).toHaveLength(0);
            expect(fn).toHaveBeenCalledWith(ownTr, "world");
        });

        it("throws a clear error for an undeclared model function name", async () => {
            _setDagda({ model: buildModelProxy({}) } as any);
            installConsoleGlobal<any>({ getRoutes: () => [] });
            await expect((globalThis as any).dagda.model.doesNotExist()).rejects.toThrow(/Unknown model function/);
        });
    });

    describe("dagda.help()", () => {
        it("runs without throwing against a populated manifest and model function registry", () => {
            _setDagda({ model: buildModelProxy({ greet: { description: "says hello", fn: () => {} } }) } as any);
            installConsoleGlobal<any>({
                getRoutes: () => [{ name: "getSystemInfo", kind: "route", origin: "system", type: "internal", description: "system info" }],
                model: { greet: { description: "says hello", fn: () => {} } }
            });
            expect(() => (globalThis as any).dagda.help()).not.toThrow();
        });
    });

});
