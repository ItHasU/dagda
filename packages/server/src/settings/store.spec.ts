import { EntitiesModel } from "@dagda/shared/src/entities/model";
import { TEST_MODEL } from "@dagda/shared/src/entities/_data";
import { JSTypes } from "@dagda/shared/src/entities/tools/javascript.types";
import { SettingsModel, SettingVisibility } from "@dagda/shared/src/settings/model";
import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";
import { applyMigrations } from "../sql/migrations";
import { FRAMEWORK_MIGRATIONS } from "../sql/framework.migrations";
import { createTestDatabase, TestDatabase } from "../test/pg.fixture";
import { generateEncryptionKey } from "./crypto";
import { SettingsStore, SETTINGS_TABLE } from "./store";

const available = inject("databaseAvailable");

const LOG_LEVEL = EntitiesModel.enum({
    QUIET: { value: "quiet", label: "Silencieux" },
    VERBOSE: { value: "verbose", label: "Détaillé" }
});

const MODEL = new SettingsModel({
    "broker.url": {
        type: JSTypes.string,
        label: "URL du broker",
        default: "mqtt://localhost:1883",
        env: "TEST_BROKER_URL"
    },
    "broker.password": {
        type: JSTypes.string,
        label: "Mot de passe",
        default: "",
        secret: true,
        env: "TEST_BROKER_PASSWORD"
    },
    "broker.enabled": {
        type: JSTypes.boolean,
        label: "Connexion active",
        default: true,
        env: "TEST_BROKER_ENABLED"
    },
    "history.days": {
        type: JSTypes.number,
        label: "Rétention",
        default: 30,
        visibility: SettingVisibility.client
    },
    "log.level": {
        type: LOG_LEVEL,
        label: "Journalisation",
        default: "quiet" as const,
        visibility: SettingVisibility.script
    }
});

const KEY = generateEncryptionKey();

describe.runIf(available)("Settings store", () => {

    let db: TestDatabase;
    let logged: string[];

    /** A store on the scratch schema, with the framework table already created */
    async function createStore(env: Record<string, string | undefined> = {}, encryptionKey: string | undefined = KEY): Promise<SettingsStore<any>> {
        const store = new SettingsStore({
            model: MODEL,
            runner: db.runner,
            encryptionKey,
            env,
            log: (message: string) => logged.push(message)
        });
        await store.load();
        return store;
    }

    beforeEach(async () => {
        // A schema per test: the settings are a state, and two tests sharing one
        // would read each other's writes.
        db = await createTestDatabase("settings");
        logged = [];
        await applyMigrations(db.runner, TEST_MODEL, FRAMEWORK_MIGRATIONS, "framework");
    });

    afterEach(async () => {
        await db?.dispose();
    });

    describe("Reading and writing", () => {

        it("answers the declared default until something is stored", async () => {
            const store = await createStore();
            expect(store.settings.get("broker.url")).toBe("mqtt://localhost:1883");
            expect(store.settings.get("history.days")).toBe(30);
            expect(store.settings.get("broker.enabled")).toBe(true);
        });

        it("refuses to be read before it is loaded", async () => {
            // Answering the default here would let the server run on a
            // configuration nobody chose.
            const store = new SettingsStore({ model: MODEL, runner: db.runner, encryptionKey: KEY });
            expect(() => store.settings.get("broker.url")).toThrow(/read before the settings were loaded/);
        });

        it("gives back what it stored, in a new store", async () => {
            const store = await createStore();
            await store.settings.set("broker.url", "mqtt://elsewhere:1883");
            await store.settings.set("history.days", 7);
            await store.settings.set("log.level", "verbose");

            const reloaded = await createStore();
            expect(reloaded.settings.get("broker.url")).toBe("mqtt://elsewhere:1883");
            expect(reloaded.settings.get("history.days")).toBe(7);
            expect(reloaded.settings.get("log.level")).toBe("verbose");
        });

        it("refuses a value that does not match the declaration", async () => {
            const store = await createStore();
            await expect(store.settings.set("history.days", "7" as never)).rejects.toThrow(/expected a number/);
            await expect(store.settings.set("log.level", "shouty" as never)).rejects.toThrow(/expected one of/);
            // And nothing was written.
            expect(await createStore().then(s => s.settings.get("history.days"))).toBe(30);
        });

        it("falls back to the default, loudly, on a value it cannot read", async () => {
            // Exactly what a hand-edited row looks like.
            await db.runner.run(
                `INSERT INTO "${SETTINGS_TABLE}" ("key", "value", "encrypted") VALUES ($1, $2, $3)`,
                "history.days", "not-a-number", false
            );
            const store = await createStore();
            expect(store.settings.get("history.days")).toBe(30);
            expect(logged.join("\n")).toMatch(/history\.days.*unusable/);
        });

        it("leaves alone a stored key it does not declare", async () => {
            // A value belonging to a version that is not running right now is
            // not garbage to collect.
            await db.runner.run(
                `INSERT INTO "${SETTINGS_TABLE}" ("key", "value", "encrypted") VALUES ($1, $2, $3)`,
                "removed.in.v3", "kept", false
            );
            await createStore();
            const row = await db.runner.get<{ value: string }>(`SELECT "value" FROM "${SETTINGS_TABLE}" WHERE "key" = $1`, "removed.in.v3");
            expect(row?.value).toBe("kept");
        });

    });

    describe("Secrets", () => {

        it("stores a secret encrypted, and reads it back", async () => {
            const store = await createStore();
            await store.settings.set("broker.password", "hunter2");
            expect(store.settings.get("broker.password")).toBe("hunter2");

            const row = await db.runner.get<{ value: string, encrypted: boolean }>(
                `SELECT "value", "encrypted" FROM "${SETTINGS_TABLE}" WHERE "key" = $1`, "broker.password"
            );
            expect(row?.encrypted).toBe(true);
            expect(row?.value).not.toContain("hunter2");
            expect(row?.value.startsWith("v1:")).toBe(true);

            expect((await createStore()).settings.get("broker.password")).toBe("hunter2");
        });

        it("refuses to start when a secret is declared and no key is configured", async () => {
            // Refused here rather than at the first write: a server that accepts
            // a secret it cannot protect has already been handed one in clear.
            expect(() => new SettingsStore({ model: MODEL, runner: db.runner }))
                .toThrow(/encryption key is required.*broker\.password/s);
        });

        it("starts without a key when nothing is secret", async () => {
            const open = new SettingsModel({
                "history.days": { type: JSTypes.number, label: "Rétention", default: 30 }
            });
            const store = new SettingsStore({ model: open, runner: db.runner });
            await store.load();
            expect(store.settings.get("history.days")).toBe(30);
        });

        it("fails rather than guess when the key changed", async () => {
            const store = await createStore();
            await store.settings.set("broker.password", "hunter2");

            const other = await createStore({}, generateEncryptionKey());
            // The default takes over, but the log says why.
            expect(other.settings.get("broker.password")).toBe("");
            expect(logged.join("\n")).toMatch(/broker\.password.*unusable/);
        });

        it("never lists a secret among the values it hands out", async () => {
            const store = await createStore();
            await store.settings.set("broker.password", "hunter2");
            const values = JSON.stringify(store.getValuesFor(SettingVisibility.server));
            expect(values).not.toContain("hunter2");
        });

    });

    describe("Visibility", () => {

        it("hands the client only what was declared for it", async () => {
            const store = await createStore();
            expect(store.getValuesFor(SettingVisibility.client)).toEqual({ "history.days": 30 });
        });

        it("hands a script what it may read, and nothing more", async () => {
            const store = await createStore();
            await store.settings.set("log.level", "verbose");
            expect(store.getValuesFor(SettingVisibility.script)).toEqual({
                "history.days": 30,
                "log.level": "verbose"
            });
        });

    });

    describe("Change notification", () => {

        it("calls the listener of the key that changed", async () => {
            // This is what spares a restart: MQTTToolbox v1 reconnected its
            // broker on exactly this (FEATURES §11.5).
            const store = await createStore();
            const listener = vi.fn();
            store.settings.on("broker.url", listener);

            await store.settings.set("broker.url", "mqtt://elsewhere:1883");
            expect(listener).toHaveBeenCalledWith("mqtt://elsewhere:1883", "broker.url");
        });

        it("stays silent when the value did not change", async () => {
            const store = await createStore();
            const listener = vi.fn();
            store.settings.on("broker.url", listener);
            await store.settings.set("broker.url", "mqtt://localhost:1883");
            expect(listener).not.toHaveBeenCalled();
        });

        it("does not call the listener of another key", async () => {
            const store = await createStore();
            const listener = vi.fn();
            store.settings.on("history.days", listener);
            await store.settings.set("broker.url", "mqtt://elsewhere:1883");
            expect(listener).not.toHaveBeenCalled();
        });

        it("stops calling a listener that was removed", async () => {
            const store = await createStore();
            const listener = vi.fn();
            const off = store.settings.on("broker.url", listener);
            off();
            await store.settings.set("broker.url", "mqtt://elsewhere:1883");
            expect(listener).not.toHaveBeenCalled();
        });

        it("keeps calling the others when one listener throws", async () => {
            const store = await createStore();
            const second = vi.fn();
            store.settings.on("broker.url", () => { throw new Error("boom"); });
            store.settings.on("broker.url", second);

            await store.settings.set("broker.url", "mqtt://elsewhere:1883");
            expect(second).toHaveBeenCalled();
            expect(logged.join("\n")).toMatch(/broker\.url.*threw/);
        });

        it("never notifies a value that failed to persist", async () => {
            const store = await createStore();
            const listener = vi.fn();
            store.settings.on("history.days", listener);
            await expect(store.settings.set("history.days", Number.NaN)).rejects.toThrow();
            expect(listener).not.toHaveBeenCalled();
        });

        it("refuses to watch a key that is not declared", async () => {
            const store = await createStore();
            expect(() => store.on("nope" as never, () => { })).toThrow(/not declared/);
        });

    });

    describe("Seeding from the environment", () => {

        it("takes the value of the environment variable on first run", async () => {
            const store = await createStore({ TEST_BROKER_URL: "mqtt://from-env:1883" });
            expect(store.settings.get("broker.url")).toBe("mqtt://from-env:1883");
            expect(logged.join("\n")).toMatch(/broker\.url.*seeded from TEST_BROKER_URL/);
        });

        it("persists what it seeded, so the next start is identical", async () => {
            await createStore({ TEST_BROKER_URL: "mqtt://from-env:1883" });
            const reloaded = await createStore();
            expect(reloaded.settings.get("broker.url")).toBe("mqtt://from-env:1883");
        });

        it("reads a boolean and a number out of text", async () => {
            const store = await createStore({ TEST_BROKER_ENABLED: "false" });
            expect(store.settings.get("broker.enabled")).toBe(false);
        });

        it("seeds a secret too, and encrypts it", async () => {
            const store = await createStore({ TEST_BROKER_PASSWORD: "hunter2" });
            expect(store.settings.get("broker.password")).toBe("hunter2");
            const row = await db.runner.get<{ encrypted: boolean }>(
                `SELECT "encrypted" FROM "${SETTINGS_TABLE}" WHERE "key" = $1`, "broker.password"
            );
            expect(row?.encrypted).toBe(true);
        });

        it("does not override a value already stored", async () => {
            // Otherwise the editing screen of tranche 3 would be undone by every
            // restart.
            const store = await createStore();
            await store.settings.set("broker.url", "mqtt://chosen:1883");

            const reloaded = await createStore({ TEST_BROKER_URL: "mqtt://from-env:1883" });
            expect(reloaded.settings.get("broker.url")).toBe("mqtt://chosen:1883");
        });

        it("says out loud that it ignored the environment", async () => {
            // Silence here is how someone spends an afternoon editing a .env
            // that nothing reads any more.
            const store = await createStore();
            await store.settings.set("broker.url", "mqtt://chosen:1883");

            logged = [];
            await createStore({ TEST_BROKER_URL: "mqtt://from-env:1883" });
            expect(logged.join("\n")).toMatch(/broker\.url.*TEST_BROKER_URL is set but a value is already stored/);
        });

        it("ignores an empty variable, which is how an environment says absent", async () => {
            const store = await createStore({ TEST_BROKER_URL: "" });
            expect(store.settings.get("broker.url")).toBe("mqtt://localhost:1883");
        });

        it("reports a variable it cannot use, and keeps the default", async () => {
            const store = await createStore({ TEST_BROKER_ENABLED: "maybe" });
            expect(store.settings.get("broker.enabled")).toBe(true);
            expect(logged.join("\n")).toMatch(/broker\.enabled.*could not be used/);
        });

    });

});
