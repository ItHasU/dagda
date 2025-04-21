import * as assert from "assert";
import { describe, it } from "mocha";
import { Dagda } from "./dagda";

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
        assert.equal(Dagda<StringService>("str")(), "result");
    });

    it("can register another service", () => {
        Dagda.init<NumberService>({
            num: () => 42,
        });
        assert.equal(Dagda<NumberService>("num")(), 42);
    });

    it("can register both services", () => {
        Dagda.init<MixedService>({
            str: () => "result",
            num: () => 42,
        });
        assert.equal(Dagda<MixedService>("str")(), "result");
        assert.equal(Dagda<MixedService>("num")(), 42);
        assert.equal(Dagda<StringService>("str")(), "result");
        assert.equal(Dagda<NumberService>("num")(), 42);
    });

    it("can access a restricted set of services", () => {
        Dagda.init<MixedService>({
            str: () => "result",
            num: () => 42,
        });
        assert.equal(Dagda<StringService>("str")(), "result");
        assert.equal(Dagda<NumberService>("num")(), 42);
    });

    it("resolves when initialized", async () => {
        let resolved = false;
        Dagda.loaded.then(() => {
            resolved = true;
        });
        assert.equal(resolved, false);
        Dagda.init<MixedService>({
            str: () => "result",
            num: () => 42,
        });
        await Dagda.loaded;
        assert.equal(resolved, true);
    });

    it("fails when trying to access a service that doesn't exist", () => {
        Dagda.init<MixedService>({
            str: () => "result",
            num: () => 42,
        });
        assert.throws(() => {
            Dagda<{ nonExistent: () => {} }>("nonExistent")();
        }, "Service nonExistent found");
    });

});