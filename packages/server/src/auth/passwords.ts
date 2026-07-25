import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password storage (FEATURES §7).
 *
 * scrypt from node:crypto rather than bcrypt or argon2: both would be a native
 * dependency, and scrypt is a memory-hard function designed for exactly this.
 * Nothing is added to the dependency list (FEATURES §0).
 *
 * A stored password is the whole recipe, not just the digest — cost parameters
 * included. Raising the cost later must not make every existing password
 * unverifiable, so each one carries the parameters it was made with.
 */

const scryptAsync = promisify(scrypt) as (
    password: string, salt: Buffer, keylen: number, options: { N: number, r: number, p: number }
) => Promise<Buffer>;

/** Prefix identifying the scheme, so another one can be introduced later */
const SCHEME = "scrypt";

/**
 * Cost parameters.
 *
 * N=16384 is the value the Node documentation uses and costs about 16 MB and a
 * few tens of milliseconds per verification — noticeable to an attacker running
 * millions, invisible on a login.
 */
const DEFAULT_PARAMS = { N: 16384, r: 8, p: 1 };
/** Bytes of salt, and of the derived key */
const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

/** @returns the storable form of a password: scheme, cost, salt and digest */
export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const derived = await scryptAsync(password, salt, KEY_LENGTH, DEFAULT_PARAMS);
    return [
        SCHEME,
        DEFAULT_PARAMS.N,
        DEFAULT_PARAMS.r,
        DEFAULT_PARAMS.p,
        salt.toString("base64"),
        derived.toString("base64")
    ].join(":");
}

/**
 * @returns true if the password is the one behind the stored form.
 *
 * Never throws on a malformed stored value: it answers false. A row that cannot
 * be parsed is a password that cannot be verified, and telling the difference
 * apart from a wrong password only helps whoever is probing.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const parts = stored.split(":");
    if (parts.length !== 6 || parts[0] !== SCHEME) {
        return false;
    }
    const [, nText, rText, pText, saltText, digestText] = parts as [string, string, string, string, string, string];
    const N = Number(nText);
    const r = Number(rText);
    const p = Number(pText);
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
        return false;
    }

    const expected = Buffer.from(digestText, "base64");
    if (expected.length === 0) {
        return false;
    }

    try {
        const derived = await scryptAsync(password, Buffer.from(saltText, "base64"), expected.length, { N, r, p });
        // Constant time: a plain === leaks how many leading bytes matched, which
        // is enough to reconstruct a digest one byte at a time.
        return timingSafeEqual(derived, expected);
    } catch {
        // Cost parameters scrypt refuses, for instance an N that is not a power
        // of two. Same answer as a wrong password.
        return false;
    }
}

/** @returns a password made of readable characters, for a reset an administrator hands over */
export function generatePassword(length: number = 16): string {
    // No l/1/I/O/0: this gets read aloud or copied by hand.
    const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = randomBytes(length);
    let result = "";
    for (let i = 0; i < length; i++) {
        // Modulo bias is negligible here: 256 % 57 skews the first 28 letters by
        // about 0.4%, against a 16-character password.
        result += alphabet[bytes[i]! % alphabet.length];
    }
    return result;
}
