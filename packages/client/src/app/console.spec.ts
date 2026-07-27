import { Dagda, DagdaRegistry } from "@dagda/shared/src/dagda";
import { EntitiesService } from "@dagda/shared/src/entities/service";
import { SQLTransaction } from "@dagda/shared/src/sql/transaction";
import { SystemInfoRoute } from "@dagda/shared/src/api/impl/system.api";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({ apiCall: vi.fn().mockResolvedValue("api-result") }));
vi.mock("../actions", () => ({ actionCall: vi.fn().mockResolvedValue("action-result") }));

// Imported after the mocks so the mocked modules are what console.ts sees.
import { apiCall } from "../api";
import { actionCall } from "../actions";
import { encapsulate, installConsoleGlobal } from "./console";

/** A fake entities handler whose withTransaction/waitForSubmit are directly observable */
function buildFakeEntities(): { service: EntitiesService<any, any>, submitted: SQLTransaction<any, any>[] } {
    const submitted: SQLTransaction<any, any>[] = [];
    const handler = {
        withTransaction: vi.fn(async (f: (tr: SQLTransaction<any, any>) => Promise<void> | void) => {
            const tr = new SQLTransaction<any, any>({ getCache: () => ({ insert: () => {} }) } as any, []);
            submitted.push(tr);
            await f(tr);
        }),
        waitForSubmit: vi.fn(async () => { /* resolved immediately, mirrors an already-drained queue */ })
    };
    // EntitiesService is itself the Dagda.init() services-map shape (like
    // ThemeService's {themes: ThemeRegistry}) — the "entities" key holds
    // {getHandler()}, not getHandler() directly.
    const service: EntitiesService<any, any> = { entities: { getHandler: () => handler as any } };
    return { service, submitted };
}

describe("console.ts", () => {

    afterEach(() => {
        Dagda.reset(new DagdaRegistry());
        vi.clearAllMocks();
        delete (globalThis as any).dagda;
    });

    describe("encapsulate", () => {
        it("opens a transaction, runs the callback, submits and awaits it, and returns the callback's result", async () => {
            const { service, submitted } = buildFakeEntities();
            Dagda.init<EntitiesService<any, any>>(service);

            const result = await encapsulate(async (tr) => {
                expect(tr).toBeInstanceOf(SQLTransaction);
                return "done";
            });

            expect(result).toBe("done");
            expect(submitted).toHaveLength(1);
        });
    });

    describe("dagda.routes", () => {
        function install(routes: SystemInfoRoute[]): void {
            installConsoleGlobal<any>({ getRoutes: () => routes });
        }

        it("is enumerable — Object.keys() and tab-completion see every registered name", () => {
            install([
                { name: "getSystemInfo", kind: "route" },
                { name: "publishMessage", kind: "action" }
            ]);
            expect(Object.keys((globalThis as any).dagda.routes)).toEqual(["getSystemInfo", "publishMessage"]);
        });

        it("dispatches a 'route'-kind entry through apiCall", async () => {
            install([{ name: "getSystemInfo", kind: "route" }]);
            const result = await (globalThis as any).dagda.routes.getSystemInfo();
            expect(apiCall).toHaveBeenCalledWith("getSystemInfo", {});
            expect(result).toBe("api-result");
        });

        it("dispatches an 'action'-kind entry through actionCall", async () => {
            install([{ name: "publishMessage", kind: "action" }]);
            const result = await (globalThis as any).dagda.routes.publishMessage({ topic: "a" });
            expect(actionCall).toHaveBeenCalledWith("publishMessage", { topic: "a" });
            expect(result).toBe("action-result");
        });

        it("throws a clear error for an unregistered name instead of silently calling the server", async () => {
            install([]);
            await expect((globalThis as any).dagda.routes.doesNotExist()).rejects.toThrow(/Unknown route/);
        });
    });

    describe("dagda.actions", () => {
        it("is enumerable and lists both bare-function and {description, fn} entries", () => {
            installConsoleGlobal<any>({
                getRoutes: () => [],
                entityActions: {
                    bare: () => {},
                    described: { description: "does a thing", fn: () => {} }
                }
            });
            expect(Object.keys((globalThis as any).dagda.actions).sort()).toEqual(["bare", "described"]);
        });

        it("auto-opens and submits its own transaction when called without one", async () => {
            const { service, submitted } = buildFakeEntities();
            Dagda.init<EntitiesService<any, any>>(service);

            const fn = vi.fn((_tr: SQLTransaction<any, any>, name: string) => `hello ${name}`);
            installConsoleGlobal<any>({ getRoutes: () => [], entityActions: { greet: fn } });

            const result = await (globalThis as any).dagda.actions.greet("world");

            expect(result).toBe("hello world");
            expect(submitted).toHaveLength(1);
            expect(fn).toHaveBeenCalledWith(submitted[0], "world");
        });

        it("passes an explicit transaction straight through instead of opening a second one", async () => {
            const { service, submitted } = buildFakeEntities();
            Dagda.init<EntitiesService<any, any>>(service);

            const fn = vi.fn((_tr: SQLTransaction<any, any>, name: string) => `hi ${name}`);
            installConsoleGlobal<any>({ getRoutes: () => [], entityActions: { greet: fn } });

            const ownTr = new SQLTransaction<any, any>({ getCache: () => ({ insert: () => {} }) } as any, []);
            const result = await (globalThis as any).dagda.actions.greet(ownTr, "world");

            expect(result).toBe("hi world");
            // No transaction was opened by the proxy itself — the only one
            // that exists is the one the caller supplied.
            expect(submitted).toHaveLength(0);
            expect(fn).toHaveBeenCalledWith(ownTr, "world");
        });

        it("throws a clear error for an undeclared action name", async () => {
            installConsoleGlobal<any>({ getRoutes: () => [] });
            await expect((globalThis as any).dagda.actions.doesNotExist()).rejects.toThrow(/Unknown action/);
        });
    });

    describe("dagda.help()", () => {
        it("runs without throwing against a populated manifest and action registry", () => {
            installConsoleGlobal<any>({
                getRoutes: () => [{ name: "getSystemInfo", kind: "route", description: "system info" }],
                entityActions: { greet: { description: "says hello", fn: () => {} } }
            });
            expect(() => (globalThis as any).dagda.help()).not.toThrow();
        });
    });

});
