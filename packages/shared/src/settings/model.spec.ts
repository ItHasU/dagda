import { describe, expect, it } from "vitest";
import { EntitiesModel } from "../entities/model";
import { JSTypes } from "../entities/tools/javascript.types";
import { SettingsModel, SettingVisibility, isVisibleAt } from "./model";

/** An enumeration used as a setting type, as an application would declare it */
const LOG_LEVEL = EntitiesModel.enum({
    QUIET: { value: "quiet", label: "Silencieux" },
    NORMAL: { value: "normal", label: "Normal" },
    VERBOSE: { value: "verbose", label: "Détaillé" }
});

const MODEL = new SettingsModel({
    "broker.url": {
        type: JSTypes.string,
        label: "URL du broker",
        default: "mqtt://localhost:1883",
        env: "BROKER_URL"
    },
    "broker.password": {
        type: JSTypes.string,
        label: "Mot de passe",
        default: "",
        secret: true,
        env: "BROKER_PASSWORD"
    },
    "broker.enabled": {
        type: JSTypes.boolean,
        label: "Connexion active",
        default: true
    },
    "history.days": {
        type: JSTypes.number,
        label: "Rétention",
        default: 30,
        visibility: SettingVisibility.client
    },
    "log.level": {
        type: LOG_LEVEL,
        label: "Niveau de journalisation",
        default: "normal" as const,
        visibility: SettingVisibility.script
    }
});

describe("Settings model", () => {

    describe("Declaration", () => {

        it("defaults to the most closed visibility", () => {
            // A setting only opens up through an explicit declaration.
            expect(MODEL.getVisibility("broker.url")).toBe(SettingVisibility.server);
            expect(MODEL.getVisibility("history.days")).toBe(SettingVisibility.client);
        });

        it("resolves an enumeration to the type of its values", () => {
            expect(MODEL.getRawType("log.level")).toBe(JSTypes.string);
            expect(MODEL.getEnum("log.level")?.getValues()).toEqual(["quiet", "normal", "verbose"]);
            expect(MODEL.getEnum("broker.url")).toBeNull();
        });

        it("refuses a secret of client visibility, at declaration", () => {
            // Refused when declared, not when read: a secret that reached the
            // browser has already leaked by the time anyone could check it.
            expect(() => new SettingsModel({
                leak: {
                    type: JSTypes.string,
                    label: "Jeton",
                    default: "",
                    secret: true,
                    visibility: SettingVisibility.client
                }
            })).toThrow(/cannot be of "client" visibility/);
        });

        it("checks its own defaults", () => {
            expect(() => new SettingsModel({
                level: { type: LOG_LEVEL, label: "Niveau", default: "shouty" as any }
            })).toThrow(/invalid default value/);
        });

        it("rejects a default of the wrong type, at compile time and at runtime", () => {
            // The @ts-expect-error is the real assertion: it fails the build if
            // the declaration ever stops being caught by the compiler. That is
            // the whole point of the self-referential constraint — without it
            // the default is checked against every value type at once.
            expect(() => new SettingsModel({
                // @ts-expect-error a boolean default on a string setting
                url: { type: JSTypes.string, label: "URL", default: true }
            })).toThrow(/expected a string, got boolean/);
        });

        it("types the value of a key from its declaration", () => {
            // The annotations are the assertion: a wrong one fails the build.
            const url: string = MODEL.getDefault("broker.url");
            const days: number = MODEL.getDefault("history.days");
            const level: "quiet" | "normal" | "verbose" = MODEL.getDefault("log.level");
            expect([url, days, level]).toEqual(["mqtt://localhost:1883", 30, "normal"]);
        });

        it("rejects an undeclared key at compile time", () => {
            // Never called: the assertion is that the build fails without the
            // directive. Running it would only prove the runtime guard, which
            // the store tests already cover.
            const _probe = (): void => {
                // @ts-expect-error a key that is not declared
                MODEL.getDeclaration("broker.host");
            };
            expect(_probe).toBeTypeOf("function");
        });

    });

    describe("Visibility", () => {

        it("lets an open level read what a closed one declares", () => {
            expect(isVisibleAt(SettingVisibility.client, SettingVisibility.server)).toBe(true);
            expect(isVisibleAt(SettingVisibility.script, SettingVisibility.server)).toBe(true);
            expect(isVisibleAt(SettingVisibility.server, SettingVisibility.script)).toBe(false);
            expect(isVisibleAt(SettingVisibility.script, SettingVisibility.client)).toBe(false);
        });

        it("gives the client only what was declared for it", () => {
            expect(MODEL.getReadableKeys(SettingVisibility.client)).toEqual(["history.days"]);
        });

        it("gives a script what it may read, and nothing more", () => {
            expect(MODEL.getReadableKeys(SettingVisibility.script)).toEqual(["history.days", "log.level"]);
        });

        it("never lists a secret, whatever the level", () => {
            const keys = MODEL.getReadableKeys(SettingVisibility.server);
            expect(keys).not.toContain("broker.password");
            expect(keys).toContain("broker.url");
        });

    });

    describe("Validation", () => {

        it("accepts a value of the declared type", () => {
            expect(MODEL.getValueError("broker.url", "mqtt://host")).toBeNull();
            expect(MODEL.getValueError("broker.enabled", false)).toBeNull();
            expect(MODEL.getValueError("history.days", 7)).toBeNull();
            expect(MODEL.getValueError("log.level", "verbose")).toBeNull();
        });

        it("refuses a value of another type", () => {
            expect(MODEL.getValueError("history.days", "7")).toMatch(/expected a number/);
            expect(MODEL.getValueError("broker.enabled", 1)).toMatch(/expected a boolean/);
            expect(MODEL.getValueError("broker.url", null)).toMatch(/got null/);
        });

        it("refuses a value outside the enumeration", () => {
            expect(MODEL.getValueError("log.level", "shouty")).toMatch(/expected one of/);
        });

        it("refuses NaN, which typeof calls a number", () => {
            expect(MODEL.getValueError("history.days", Number.NaN)).toMatch(/finite/);
            expect(MODEL.getValueError("history.days", Number.POSITIVE_INFINITY)).toMatch(/finite/);
        });

    });

    describe("Reading and writing text", () => {

        it("reads a string as it stands", () => {
            // Not JSON: a .env holding mqtt://localhost:1883 is not valid JSON,
            // and quoting it would be a trap.
            expect(MODEL.parseValue("broker.url", "mqtt://localhost:1883")).toBe("mqtt://localhost:1883");
        });

        it("reads the booleans an environment writes", () => {
            expect(MODEL.parseValue("broker.enabled", "true")).toBe(true);
            expect(MODEL.parseValue("broker.enabled", "1")).toBe(true);
            expect(MODEL.parseValue("broker.enabled", "FALSE")).toBe(false);
            expect(MODEL.parseValue("broker.enabled", "0")).toBe(false);
            expect(() => MODEL.parseValue("broker.enabled", "yes")).toThrow(/expected a boolean/);
        });

        it("refuses a number that is not one", () => {
            expect(MODEL.parseValue("history.days", " 7 ")).toBe(7);
            expect(() => MODEL.parseValue("history.days", "seven")).toThrow(/finite/);
        });

        it("checks an enumeration read from text", () => {
            expect(MODEL.parseValue("log.level", "quiet")).toBe("quiet");
            expect(() => MODEL.parseValue("log.level", "shouty")).toThrow(/expected one of/);
        });

        it("reads back what it wrote", () => {
            for (const [key, value] of [
                ["broker.url", "mqtt://host:1883"],
                ["broker.enabled", false],
                ["history.days", 7],
                ["log.level", "verbose"]
            ] as const) {
                expect(MODEL.parseValue(key, MODEL.serializeValue(key, value as never))).toBe(value);
            }
        });

    });

});
