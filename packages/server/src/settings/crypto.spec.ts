import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, generateEncryptionKey, parseEncryptionKey } from "./crypto";

describe("Secret encryption", () => {

    const KEY = parseEncryptionKey(generateEncryptionKey());

    describe("Keys", () => {

        it("reads a key in base64", () => {
            expect(parseEncryptionKey(randomBytes(32).toString("base64"))).toHaveLength(32);
        });

        it("reads a key in hex", () => {
            // Both are what an `openssl rand` produces; asking which one was
            // meant is a question with no good answer.
            expect(parseEncryptionKey(randomBytes(32).toString("hex"))).toHaveLength(32);
        });

        it("ignores the whitespace an environment file leaves behind", () => {
            const key = generateEncryptionKey();
            expect(parseEncryptionKey(`  ${key}\n`)).toEqual(parseEncryptionKey(key));
        });

        it("refuses a key of the wrong size, and says how to make one", () => {
            expect(() => parseEncryptionKey(randomBytes(16).toString("base64")))
                .toThrow(/must decode to 32 bytes.*randomBytes/s);
        });

        it("generates a key it can read back", () => {
            expect(parseEncryptionKey(generateEncryptionKey())).toHaveLength(32);
        });

    });

    describe("Round trip", () => {

        it("gives back what it encrypted", () => {
            for (const plain of ["hunter2", "", "  spaces  ", "accents éàü", "a".repeat(10000)]) {
                expect(decryptSecret(KEY, encryptSecret(KEY, plain))).toBe(plain);
            }
        });

        it("does not leak the clear text into the stored form", () => {
            expect(encryptSecret(KEY, "hunter2")).not.toContain("hunter2");
        });

        it("produces a different form every time, for the same value", () => {
            // A fresh IV each time: two settings sharing a password must not
            // look identical in the table.
            expect(encryptSecret(KEY, "hunter2")).not.toBe(encryptSecret(KEY, "hunter2"));
        });

    });

    describe("Detecting an alteration", () => {

        it("refuses a value encrypted with another key", () => {
            const stored = encryptSecret(KEY, "hunter2");
            expect(() => decryptSecret(parseEncryptionKey(generateEncryptionKey()), stored)).toThrow();
        });

        it("refuses a ciphertext edited by hand", () => {
            // This is why GCM rather than CBC: a row modified in the database
            // fails to decrypt instead of yielding a plausible value.
            const [format, iv, tag, data] = encryptSecret(KEY, "hunter2").split(":") as [string, string, string, string];
            const flipped = Buffer.from(data, "base64");
            flipped[0] = flipped[0]! ^ 0xff;
            expect(() => decryptSecret(KEY, [format, iv, tag, flipped.toString("base64")].join(":"))).toThrow();
        });

        it("refuses a value whose authentication tag was replaced", () => {
            const [format, iv, , data] = encryptSecret(KEY, "hunter2").split(":") as [string, string, string, string];
            const otherTag = encryptSecret(KEY, "other").split(":")[2]!;
            expect(() => decryptSecret(KEY, [format, iv, otherTag, data].join(":"))).toThrow();
        });

        it("refuses something that is not an encrypted value at all", () => {
            for (const stored of ["hunter2", "v1:only:three", "v2:a:b:c", ""]) {
                expect(() => decryptSecret(KEY, stored)).toThrow();
            }
        });

    });

});
