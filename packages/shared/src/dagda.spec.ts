import { describe, expect, it } from "vitest";
import { Dagda, DagdaRegistry } from "./dagda";

type StringService = {
    str: () => string;
}

type NumberService = {
    num: () => number;
}

type MixedService = {
    str: () => string;
    num: () => number;
}

describe("Dagda", () => {

    it("can register one service", () => {
        Dagda.init<StringService>({
            str: () => "result",
        });
        expect(Dagda.get<StringService>("str")()).toBe("result");
    });

    it("can register another service", () => {
        Dagda.init<NumberService>({
            num: () => 42,
        });
        expect(Dagda.get<NumberService>("num")()).toBe(42);
    });

    it("can register both services", () => {
        Dagda.init<MixedService>({
            str: () => "result",
            num: () => 42,
        });
        expect(Dagda.get<MixedService>("str")()).toBe("result");
        expect(Dagda.get<MixedService>("num")()).toBe(42);
        expect(Dagda.get<StringService>("str")()).toBe("result");
        expect(Dagda.get<NumberService>("num")()).toBe(42);
    });

    it("can access a restricted set of services", () => {
        Dagda.init<MixedService>({
            str: () => "result",
            num: () => 42,
        });
        expect(Dagda.get<StringService>("str")()).toBe("result");
        expect(Dagda.get<NumberService>("num")()).toBe(42);
    });

    it("resolves loaded only once init has been called", async () => {
        // The tests above have already called init(), so the running registry is
        // settled by now. A fresh one is the only way to observe that `loaded`
        // stays pending until init().
        const registry = new DagdaRegistry();

        let resolved = false;
        registry.loaded.then(() => {
            resolved = true;
        });
        // Let any already-queued microtask run: if `loaded` were resolved,
        // the flag would be set by now.
        await Promise.resolve();
        expect(resolved, "loaded must not resolve before init()").toBe(false);

        registry.init<MixedService>({
            str: () => "result",
            num: () => 42,
        });
        await registry.loaded;
        expect(resolved).toBe(true);
    });

    it("fails when trying to access a service that doesn't exist", () => {
        Dagda.init<MixedService>({
            str: () => "result",
            num: () => 42,
        });
        expect(() => {
            Dagda.get<{ nonExistent: () => {} }>("nonExistent")();
        }).toThrow();
    });

});

describe("DagdaRegistry", () => {

    it("keeps two registries independent", () => {
        const first = new DagdaRegistry();
        const second = new DagdaRegistry();

        first.init<StringService>({ str: () => "first" });
        second.init<StringService>({ str: () => "second" });

        expect(first.get<StringService>("str")()).toBe("first");
        expect(second.get<StringService>("str")()).toBe("second");
    });

    it("lets a test install its own registry and put the previous one back", () => {
        Dagda.init<StringService>({ str: () => "running" });

        const previous = Dagda.reset();
        try {
            Dagda.init<StringService>({ str: () => "isolated" });
            expect(Dagda.get<StringService>("str")()).toBe("isolated");
        } finally {
            Dagda.reset(previous);
        }

        // The isolated registry left no trace on the running one.
        expect(Dagda.get<StringService>("str")()).toBe("running");
    });

});
