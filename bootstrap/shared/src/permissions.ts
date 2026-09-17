import { DagdaPermission, PermissionsDeclaration } from "@dagda/shared/src/auth/permissions";

/**
 * Permissions declared by this application, on top of Dagda's own
 * (`DAGDA_PERMISSIONS`) — merged server-side by `AbstractServerApp`'s
 * `_permissions` constructor parameter (FEATURES §7.1).
 */
export const APP_PERMISSIONS = {
    "notes.manage": {
        label: "Gérer les notes",
        description: "Créer, modifier ou supprimer une note sur un projet"
    }
} as const satisfies PermissionsDeclaration;

/** Every permission this application may check — the framework's own plus its own (FEATURES §0) */
export type AppPermission = DagdaPermission | keyof typeof APP_PERMISSIONS;
