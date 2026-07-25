/**
 * Accounts (FEATURES §7, §11.4).
 *
 * Users are framework data, not entities: they never travel through the client
 * cache, the loading contexts or the transactions. What a client knows about
 * the current user is this shape, and nothing more — no password, no hash.
 */

/** Identifier of an account. The only bridge between framework data and an application model (§11.4) */
export type UserId = number;

/** What the client is told about a user */
export interface UserInfo {
    id: UserId;
    /** What is typed in the login form. Unique, case-insensitive */
    login: string;
    /** What screens display */
    displayName: string;
    /**
     * Holds every permission implicitly (FEATURES §7.1).
     *
     * Deliberately a flag rather than a role carrying every permission: a
     * dedicated test short-circuits the checks, so no one has to keep a
     * super-admin role in step with the permissions added later.
     */
    isSuperAdmin: boolean;
    /**
     * A disabled account cannot log in.
     *
     * Accounts are disabled rather than deleted: application entities reference
     * them, and a deleted row would leave those dangling (§11.4).
     */
    enabled: boolean;
}

/** The login credentials, as the login form sends them */
export interface Credentials {
    login: string;
    password: string;
}
