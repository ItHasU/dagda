import { describe, expect, it } from "vitest";
import { generatePassword, hashPassword, verifyPassword } from "./passwords";

describe("Password hashing", () => {

    describe("Round trip", () => {

        it("accepts the password it hashed", async () => {
            const stored = await hashPassword("hunter2");
            expect(await verifyPassword("hunter2", stored)).toBe(true);
        });

        it("refuses any other password", async () => {
            const stored = await hashPassword("hunter2");
            for (const wrong of ["hunter", "hunter22", "HUNTER2", "", " hunter2"]) {
                expect(await verifyPassword(wrong, stored)).toBe(false);
            }
        });

        it("handles what a real password looks like", async () => {
            for (const password of ["", "é@ü#!", "a".repeat(200), "with spaces and : colons"]) {
                expect(await verifyPassword(password, await hashPassword(password))).toBe(true);
            }
        });

        it("gives a different hash every time, for the same password", async () => {
            // A fresh salt each time: two accounts sharing a password must not
            // be visible as such in the table.
            expect(await hashPassword("hunter2")).not.toBe(await hashPassword("hunter2"));
        });

        it("stores the recipe, not just a digest", async () => {
            // The cost parameters travel with the hash, so raising them later
            // does not make every existing password unverifiable.
            const stored = await hashPassword("hunter2");
            expect(stored.split(":")).toHaveLength(6);
            expect(stored.startsWith("scrypt:16384:8:1:")).toBe(true);
        });

        it("never stores the password itself", async () => {
            expect(await hashPassword("hunter2")).not.toContain("hunter2");
        });

    });

    describe("Refusing a stored value it cannot use", () => {

        it("answers false rather than throwing", async () => {
            // A row that cannot be parsed is a password that cannot be verified.
            // Telling that apart from a wrong password only helps whoever probes.
            for (const stored of ["", "hunter2", "scrypt:x:8:1:AAAA:AAAA", "bcrypt:1:2:3:4:5", "scrypt:16384:8:1:AAAA"]) {
                expect(await verifyPassword("hunter2", stored)).toBe(false);
            }
        });

        it("answers false on cost parameters scrypt refuses", async () => {
            // N must be a power of two; scrypt throws rather than answering.
            const stored = await hashPassword("hunter2");
            const parts = stored.split(":");
            parts[1] = "12345";
            expect(await verifyPassword("hunter2", parts.join(":"))).toBe(false);
        });

        it("answers false on an empty digest", async () => {
            const parts = (await hashPassword("hunter2")).split(":");
            parts[5] = "";
            expect(await verifyPassword("hunter2", parts.join(":"))).toBe(false);
        });

        it("answers false when the salt was changed", async () => {
            const parts = (await hashPassword("hunter2")).split(":");
            parts[4] = Buffer.alloc(16, 1).toString("base64");
            expect(await verifyPassword("hunter2", parts.join(":"))).toBe(false);
        });

    });

    describe("Generated passwords", () => {

        it("has the requested length", () => {
            expect(generatePassword()).toHaveLength(16);
            expect(generatePassword(8)).toHaveLength(8);
        });

        it("avoids the characters that get misread aloud", () => {
            // No l/1/I/O/0: an administrator reads this out or types it by hand.
            const sample = Array.from({ length: 50 }, () => generatePassword(32)).join("");
            expect(sample).not.toMatch(/[lIO01]/);
        });

        it("gives a different password every time", () => {
            expect(generatePassword()).not.toBe(generatePassword());
        });

        it("produces something the hashing accepts", async () => {
            const password = generatePassword();
            expect(await verifyPassword(password, await hashPassword(password))).toBe(true);
        });

    });

});
