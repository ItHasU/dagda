import { UserId, UserInfo } from "./types";

/** What issuing or reissuing an invitation link hands back (FEATURES §7) */
export interface InvitationResult {
    user: UserInfo;
    /** Full URL to hand to the invited user, out of band — no mail service is involved (FEATURES §0) */
    url: string;
    /** When the link stops working */
    expiresAt: number;
}

/**
 * Account management, built into every Dagda application (FEATURES §11.4):
 * accounts are framework territory, not something an application declares.
 *
 * Every one of these requires `isSuperAdmin` — there is no role matrix yet
 * (ROADMAP tranche 3), so this is the same stopgap the menu filtering already
 * uses. The permission check is enforced by the handler, not by this type:
 * this only says what is callable and with what, same as any other action.
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
};
