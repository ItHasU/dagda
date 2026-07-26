import { Role, RoleId, UserId, UserInfo } from "./types";

/** What issuing or reissuing an invitation link hands back (FEATURES §7) */
export interface InvitationResult {
    user: UserInfo;
    /** Full URL to hand to the invited user, out of band — no mail service is involved (FEATURES §0) */
    url: string;
    /** When the link stops working */
    expiresAt: number;
}

/** What the client-side user directory needs for attribution — nothing sensitive (ROADMAP tranche 3) */
export interface UserName {
    id: UserId;
    displayName: string;
}

/**
 * Account and role management, built into every Dagda application
 * (FEATURES §11.4): both are framework territory, not something an
 * application declares.
 *
 * Gated by permission (`users.manage`, `roles.manage` — FEATURES §7.1),
 * checked by the handler, not by this type: this only says what is callable
 * and with what, same as any other action.
 */
export type DagdaActions = {
    /** Every account, disabled ones included — the administration screen's list */
    listUsers(): UserInfo[];
    /** Create an account on invitation (§7): the only way in besides the bootstrap admin */
    inviteUser(params: { login: string, displayName?: string, isSuperAdmin?: boolean }): InvitationResult;
    /** Reissue an invitation link — the password reset of §7, no mail service needed */
    reinviteUser(params: { id: UserId }): InvitationResult;
    /** Enable or disable an account. Disabling is how an account is retired (§11.4) */
    setUserEnabled(params: { id: UserId, enabled: boolean }): void;
    /** Give an account a role, or none (§7.1: at most one) */
    setUserRole(params: { id: UserId, roleId: RoleId | null }): void;

    /** Every role, for the matrix screen and the account screen's role picker */
    listRoles(): Role[];
    /** Create a role. @throws if the name is taken or a permission is not declared */
    createRole(params: { name: string, permissions: string[] }): Role;
    /** Rename a role and/or replace the permissions it grants */
    updateRole(params: { id: RoleId, name?: string, permissions?: string[] }): Role;
    /** Delete a role. Accounts carrying it fall back to none, not an error */
    deleteRole(params: { id: RoleId }): void;

    /**
     * Every account's id and display name, for attribution ("published by
     * X") — the client-side user directory of ROADMAP tranche 3.
     *
     * Deliberately not gated by `users.manage`: any authenticated account
     * needs to resolve an author's id to a name while rendering, not just an
     * administrator. Returns only what attribution needs — no login, role,
     * permissions or enabled state, unlike `listUsers()`.
     */
    listUserNames(): UserName[];

    /**
     * Every preference declared by the application, current value for the
     * calling user (FEATURES §11.6). Not gated by a permission: the calling
     * user's own id, resolved server-side from the session, is the whole of
     * the security boundary — there is no `userId` parameter here or on
     * `setPreference` below. A key never set already reads back as its
     * declared default, no special case needed on either side.
     */
    getPreferences(): Record<string, unknown>;
    /** Sets one preference for the calling user. @throws if `value` does not match the declared type */
    setPreference(params: { key: string, value: unknown }): void;
};
