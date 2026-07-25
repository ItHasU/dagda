import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption of the secret settings at rest (FEATURES §11.5).
 *
 * The key comes from an environment variable, which makes it a bootstrap
 * parameter like the database connection string: it cannot live in the very
 * table it protects.
 *
 * AES-256-GCM rather than CBC: it authenticates the ciphertext, so a row edited
 * by hand in the database fails to decrypt instead of yielding a plausible
 * value. Everything used here is in node:crypto — no dependency added.
 */

/** Bytes of an AES-256 key */
const KEY_LENGTH = 32;
/** Bytes of the initialisation vector, 96 bits being the size GCM is defined for */
const IV_LENGTH = 12;
/** Prefix identifying the format, so another one can be introduced later without guessing */
const FORMAT = "v1";

/**
 * Reads the encryption key out of its text form.
 *
 * Accepts base64 and hex, because both are what a `openssl rand` produces and
 * asking which one was meant is a question with no good answer.
 * @throws if the text does not decode to exactly 32 bytes.
 */
export function parseEncryptionKey(text: string): Buffer {
    const trimmed = text.trim();

    const candidates: Buffer[] = [];
    if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === KEY_LENGTH * 2) {
        candidates.push(Buffer.from(trimmed, "hex"));
    }
    candidates.push(Buffer.from(trimmed, "base64"));

    for (const candidate of candidates) {
        if (candidate.length === KEY_LENGTH) {
            return candidate;
        }
    }
    throw new Error(
        `The encryption key must decode to ${KEY_LENGTH} bytes (base64 or hex), got ${candidates[candidates.length - 1]?.length ?? 0}. ` +
        `Generate one with: node -e "console.log(require('node:crypto').randomBytes(${KEY_LENGTH}).toString('base64'))"`
    );
}

/** @returns a fresh key, in the form the environment variable expects */
export function generateEncryptionKey(): string {
    return randomBytes(KEY_LENGTH).toString("base64");
}

/** @returns the encrypted form of a text, safe to store as is */
export function encryptSecret(key: Buffer, plain: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return [
        FORMAT,
        iv.toString("base64"),
        cipher.getAuthTag().toString("base64"),
        encrypted.toString("base64")
    ].join(":");
}

/**
 * @returns the text behind an encrypted form.
 * @throws if the format is not recognised, or if the content was altered — a
 * wrong key and a tampered row are the same failure here, on purpose.
 */
export function decryptSecret(key: Buffer, stored: string): string {
    const parts = stored.split(":");
    if (parts.length !== 4 || parts[0] !== FORMAT) {
        throw new Error(`Unrecognized encrypted value format, expected "${FORMAT}:<iv>:<tag>:<data>"`);
    }
    const [, ivPart, tagPart, dataPart] = parts as [string, string, string, string];
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64")), decipher.final()]).toString("utf8");
}
