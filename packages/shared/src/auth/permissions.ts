import { UserInfo } from "./types";

/**
 * Declaration of one permission (FEATURES §7.1).
 *
 * The permission list is an application constant, not data — a TypeScript
 * type, like `APICollection` (§5) or the actions collection (§11.1): it is
 * what gives autocompletion and lets a typo be caught at compile time rather
 * than found the day someone's role silently grants nothing.
 */
export interface PermissionDeclaration {
    /** Displayed in the role × permission matrix */
    label: string;
    /** Displayed under the label, to say what it actually opens up */
    description?: string;
}

export type PermissionsDeclaration = Record<string, PermissionDeclaration>;

/**
 * The framework's own base permissions, for its own features: managing
 * accounts, managing roles, and (once it has a screen) system settings. An
 * application adds its own alongside these — see `AbstractServerApp`'s
 * `_permissions` for where the two merge server-side.
 */
export const DAGDA_PERMISSIONS = {
    "users.manage": {
        label: "Gérer les comptes",
        description: "Inviter, réinviter, activer ou désactiver un compte, et lui attribuer un rôle"
    },
    "roles.manage": {
        label: "Gérer les rôles",
        description: "Créer, renommer ou supprimer un rôle, et choisir les permissions qu'il porte"
    },
    "settings.manage": {
        label: "Gérer les paramètres système",
        description: "Modifier les paramètres système, y compris les secrets"
    }
} as const satisfies PermissionsDeclaration;

/** Union of the framework's own permission keys */
export type DagdaPermission = keyof typeof DAGDA_PERMISSIONS;

/**
 * @returns true if the user may do whatever `permission` gates.
 *
 * Super-admin short-circuits every check (FEATURES §7.1): a dedicated flag,
 * not a role enumerating every permission there is, so nobody has to keep a
 * "super" role in step with the permissions declared after it.
 */
export function hasPermission<Permission extends string>(user: UserInfo<Permission>, permission: Permission): boolean {
    return user.isSuperAdmin || user.permissions.includes(permission);
}
