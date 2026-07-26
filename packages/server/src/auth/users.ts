import { SYSTEM_TABLE_PREFIX } from "@dagda/shared/src/entities/model";
import { RoleId, UserId, UserInfo } from "@dagda/shared/src/auth/types";
import { randomBytes } from "node:crypto";
import { AbstractSQLRunner } from "../sql/runner";
import { qi } from "../sql/schema";
import { hashPassword, verifyPassword } from "./passwords";
import { RoleStore } from "./roles";

/** Table holding the accounts, owned by the framework (FEATURES §11.4) */
export const USERS_TABLE = `${SYSTEM_TABLE_PREFIX}users`;

/** The login of the account created on an empty database */
export const BOOTSTRAP_LOGIN = "admin";
/** Its password, which the first thing anyone should do is change */
export const BOOTSTRAP_PASSWORD = "admin";

/** How long an invitation link works, from the moment it is issued or reissued */
const INVITATION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

/** A row of the users table */
interface UserRow {
    id: number;
    login: string;
    displayName: string;
    password: string;
    isSuperAdmin: boolean;
    enabled: boolean;
    invitationToken: string | null;
    invitationExpiresAt: string | null;
    roleId: number | null;
}

/** What issuing or reissuing an invitation hands back, for the admin to pass along */
export interface Invitation {
    user: UserInfo;
    token: string;
    expiresAt: number;
}

/**
 * The accounts (FEATURES §7).
 *
 * Local accounts are the only authentication mode: there is no external
 * provider and no public sign-up form. An account is created either by the
 * bootstrap below, or by an administrator.
 *
 * Everything here is async and hits the database. Unlike the settings, accounts
 * are not cached: a disabled account must stop working at the next request, not
 * at the next restart.
 */
export class UserStore {

    constructor(
        protected readonly _db: AbstractSQLRunner,
        protected readonly _roles: RoleStore,
        protected readonly _log: (message: string) => void = console.log
    ) { }

    //#region Reading ---------------------------------------------------------

    /** @returns the user, or null if no account carries this id */
    public async getById(id: UserId): Promise<UserInfo | null> {
        const row = await this._db.get<UserRow>(`SELECT * FROM ${qi(USERS_TABLE)} WHERE ${qi("id")} = $1`, id);
        return row == null ? null : this._toUserInfo(row);
    }

    /** @returns every account, disabled ones included, for the administration screen */
    public async list(): Promise<UserInfo[]> {
        const rows = await this._db.all<UserRow>(`SELECT * FROM ${qi(USERS_TABLE)} ORDER BY ${qi("login")}`);
        return Promise.all(rows.map(row => this._toUserInfo(row)));
    }

    /** @returns how many accounts exist */
    public async count(): Promise<number> {
        const row = await this._db.get<{ count: string }>(`SELECT COUNT(*) AS count FROM ${qi(USERS_TABLE)}`);
        return Number(row?.count ?? 0);
    }

    //#endregion

    //#region Authenticating --------------------------------------------------

    /**
     * @returns the user when the credentials are right, null otherwise.
     *
     * One answer for every failure — unknown login, wrong password, disabled
     * account. Distinguishing them tells whoever is probing which logins exist.
     *
     * A missing account still costs a hash verification, so the response time
     * does not say whether the login exists.
     */
    public async authenticate(login: string, password: string): Promise<UserInfo | null> {
        const row = await this._db.get<UserRow>(
            `SELECT * FROM ${qi(USERS_TABLE)} WHERE lower(${qi("login")}) = lower($1)`, login
        );

        // Against a real hash of a fixed password, so the work is the same
        // whether or not the account exists.
        const stored = row?.password ?? DUMMY_HASH;
        const matches = await verifyPassword(password, stored);

        if (row == null || !matches || !row.enabled) {
            return null;
        }
        return this._toUserInfo(row);
    }

    //#endregion

    //#region Writing ---------------------------------------------------------

    /** Create an account. @throws if the login is already taken */
    public async create(params: {
        login: string;
        password: string;
        displayName?: string;
        isSuperAdmin?: boolean;
    }): Promise<UserInfo> {
        const login = params.login.trim();
        if (login === "") {
            throw new Error("A login cannot be empty");
        }
        if (params.password === "") {
            throw new Error("A password cannot be empty");
        }

        const row = await this._db.get<UserRow>(
            `INSERT INTO ${qi(USERS_TABLE)} (${qi("login")}, ${qi("displayName")}, ${qi("password")}, ${qi("isSuperAdmin")})
             VALUES ($1, $2, $3, $4) RETURNING *`,
            login, params.displayName ?? login, await hashPassword(params.password), params.isSuperAdmin === true
        );
        if (row == null) {
            throw new Error(`Could not create the account "${login}"`);
        }
        return this._toUserInfo(row);
    }

    /** Replace the password of an account */
    public async setPassword(id: UserId, password: string): Promise<void> {
        if (password === "") {
            throw new Error("A password cannot be empty");
        }
        await this._db.run(
            `UPDATE ${qi(USERS_TABLE)} SET ${qi("password")} = $1 WHERE ${qi("id")} = $2`,
            await hashPassword(password), id
        );
    }

    /**
     * Change a password, checking the current one first.
     * @returns false if the current password is wrong, in which case nothing changed.
     */
    public async changePassword(id: UserId, current: string, next: string): Promise<boolean> {
        const row = await this._db.get<UserRow>(`SELECT * FROM ${qi(USERS_TABLE)} WHERE ${qi("id")} = $1`, id);
        if (row == null || !await verifyPassword(current, row.password)) {
            return false;
        }
        await this.setPassword(id, next);
        return true;
    }

    /** Enable or disable an account. Disabling is how an account is retired (§11.4) */
    public async setEnabled(id: UserId, enabled: boolean): Promise<void> {
        await this._db.run(`UPDATE ${qi(USERS_TABLE)} SET ${qi("enabled")} = $1 WHERE ${qi("id")} = $2`, enabled, id);
    }

    /** Give an account a role, or none (FEATURES §7.1: at most one) */
    public async setRole(id: UserId, roleId: RoleId | null): Promise<void> {
        await this._db.run(`UPDATE ${qi(USERS_TABLE)} SET ${qi("roleId")} = $1 WHERE ${qi("id")} = $2`, roleId, id);
    }

    //#endregion

    //#region Invitations -------------------------------------------------------

    /**
     * Create an account **on invitation** — the only way in besides the
     * bootstrap admin (FEATURES §7): no public sign-up form exists anywhere.
     *
     * Disabled and with an unguessable, unusable password until the link is
     * used: an invited account must not be reachable by any means before that.
     *
     * @returns the invitation to hand to the new user, out of band — no mail
     * service is involved (FEATURES §0, §7): the administrator copies the link.
     */
    public async invite(params: { login: string, displayName?: string, isSuperAdmin?: boolean }): Promise<Invitation> {
        const login = params.login.trim();
        if (login === "") {
            throw new Error("A login cannot be empty");
        }

        const token = randomBytes(32).toString("base64url");
        const expiresAt = Date.now() + INVITATION_TTL_MS;
        const row = await this._db.get<UserRow>(
            `INSERT INTO ${qi(USERS_TABLE)}
                (${qi("login")}, ${qi("displayName")}, ${qi("password")}, ${qi("isSuperAdmin")}, ${qi("enabled")}, ${qi("invitationToken")}, ${qi("invitationExpiresAt")})
             VALUES ($1, $2, $3, $4, FALSE, $5, $6) RETURNING *`,
            login, params.displayName ?? login, await hashPassword(randomBytes(32).toString("hex")),
            params.isSuperAdmin === true, token, expiresAt
        );
        if (row == null) {
            throw new Error(`Could not create the account "${login}"`);
        }
        return { user: await this._toUserInfo(row), token, expiresAt };
    }

    /**
     * Reissue an invitation link for an existing account — the password reset
     * of FEATURES §7: "par le même lien d'invitation, régénéré par
     * l'administrateur". The current password keeps working until the link is
     * used; this only ever adds a second way in, it never removes the first.
     */
    public async reinvite(id: UserId): Promise<Invitation> {
        const token = randomBytes(32).toString("base64url");
        const expiresAt = Date.now() + INVITATION_TTL_MS;
        const row = await this._db.get<UserRow>(
            `UPDATE ${qi(USERS_TABLE)} SET ${qi("invitationToken")} = $1, ${qi("invitationExpiresAt")} = $2
             WHERE ${qi("id")} = $3 RETURNING *`,
            token, expiresAt, id
        );
        if (row == null) {
            throw new Error(`No account with id ${id}`);
        }
        return { user: await this._toUserInfo(row), token, expiresAt };
    }

    /**
     * @returns the account an invitation token belongs to, or null if the
     * token does not exist or has expired — the two the accept page cannot
     * tell apart without leaking whether a token ever existed.
     */
    public async getByInvitationToken(token: string): Promise<UserInfo | null> {
        const row = await this._db.get<UserRow>(
            `SELECT * FROM ${qi(USERS_TABLE)} WHERE ${qi("invitationToken")} = $1`, token
        );
        if (row == null || row.invitationExpiresAt == null || Number(row.invitationExpiresAt) < Date.now()) {
            return null;
        }
        return this._toUserInfo(row);
    }

    /**
     * Accept an invitation: set the chosen password, enable the account (a
     * fresh invite starts disabled; a reset on an already-enabled one is a
     * no-op here), and burn the token — single use, as FEATURES §7 asks.
     *
     * @returns the account, or null if the token is invalid or expired —
     * checked again here, not only by the page that showed the form, since
     * nothing stops this from being called directly.
     */
    public async acceptInvitation(token: string, password: string): Promise<UserInfo | null> {
        if (password === "") {
            throw new Error("A password cannot be empty");
        }
        const user = await this.getByInvitationToken(token);
        if (user == null) {
            return null;
        }
        const row = await this._db.get<UserRow>(
            `UPDATE ${qi(USERS_TABLE)}
             SET ${qi("password")} = $1, ${qi("enabled")} = TRUE, ${qi("invitationToken")} = NULL, ${qi("invitationExpiresAt")} = NULL
             WHERE ${qi("id")} = $2 RETURNING *`,
            await hashPassword(password), user.id
        );
        return row == null ? null : await this._toUserInfo(row);
    }

    //#endregion

    //#region Bootstrap -------------------------------------------------------

    /**
     * Create the first account when there is none.
     *
     * Before an account exists nobody can be invited, so this first one escapes
     * the normal path (FEATURES §7.1). It is a super-admin, and its password is
     * the one everybody knows — hence the warning, repeated at every start until
     * it is changed.
     *
     * @returns the account it created, or null if accounts already existed.
     */
    public async ensureBootstrapAdmin(): Promise<UserInfo | null> {
        if (await this.count() > 0) {
            await this._warnIfBootstrapPasswordUnchanged();
            return null;
        }
        const admin = await this.create({
            login: BOOTSTRAP_LOGIN,
            password: BOOTSTRAP_PASSWORD,
            displayName: "Administrateur",
            isSuperAdmin: true
        });
        this._log(`Created the first account "${BOOTSTRAP_LOGIN}" with password "${BOOTSTRAP_PASSWORD}". Change it.`);
        return admin;
    }

    /** Say so, at every start, for as long as the default password still works */
    protected async _warnIfBootstrapPasswordUnchanged(): Promise<void> {
        const row = await this._db.get<UserRow>(
            `SELECT * FROM ${qi(USERS_TABLE)} WHERE lower(${qi("login")}) = lower($1)`, BOOTSTRAP_LOGIN
        );
        if (row != null && row.enabled && await verifyPassword(BOOTSTRAP_PASSWORD, row.password)) {
            this._log(`WARNING: the account "${BOOTSTRAP_LOGIN}" still uses its default password.`);
        }
    }

    //#endregion

    /**
     * What the rest of the framework sees of a user: resolves `roleId` to its
     * role's permissions (FEATURES §7.1). Empty for a super-admin — its
     * `isSuperAdmin` flag is what `hasPermission()` checks instead, so there
     * is nothing to enumerate and nothing to keep in step.
     */
    protected async _toUserInfo(row: UserRow): Promise<UserInfo> {
        const role = row.isSuperAdmin || row.roleId == null ? null : await this._roles.getById(row.roleId);
        return {
            id: row.id,
            login: row.login,
            displayName: row.displayName,
            isSuperAdmin: row.isSuperAdmin,
            enabled: row.enabled,
            roleId: row.roleId,
            permissions: role?.permissions ?? []
        };
    }
}

/**
 * A real hash, verified against when no account matches.
 *
 * Its plaintext is irrelevant — what matters is that verifying it costs the same
 * as verifying a real one, so an unknown login and a wrong password take the
 * same time. Computed once at load, since the parameters never change.
 */
const DUMMY_HASH = `scrypt:16384:8:1:${Buffer.alloc(16).toString("base64")}:${Buffer.alloc(64).toString("base64")}`;
