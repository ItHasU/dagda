import { SettingsModel } from "@dagda/shared/src/settings/model";
import { PageInfo } from "./handler";
import { PreferencesPage } from "./preferences/preferences.page";
import { RolesPage } from "./roles/roles.page";
import { SettingsPage } from "./settings/settings.page";
import { UsersPage } from "./users/users.page";

/**
 * The pages every Dagda application gets for free (review feedback: a new
 * project should not have to re-import and re-register these to get them —
 * they were only ever application-specific because nowhere else existed yet
 * for them to live, per D1/D2's own move into the framework).
 */
export interface DefaultPageTypes {
    preferences: PreferencesPage;
    users: UsersPage;
    roles: RolesPage;
    settings: SettingsPage;
}

/**
 * Builds the default page registrations, merged into `params.pages` by
 * `DagdaClient.start()` — the application's own `pages` entry for the same
 * key (if any) is spread on top and wins, the same override relationship
 * `themes` already has with `DAGDA_THEMES`.
 *
 * `settings` is included only when the application declares a
 * `SettingsModel` (`ClientStartParams.settings`) — nothing to edit, no page,
 * same conditional Dagda already applies to `themePreferenceKey`.
 */
export function buildDefaultPages(settings?: SettingsModel<any>): Partial<{ [Name in keyof DefaultPageTypes]: PageInfo<DefaultPageTypes[Name]> }> {
    return {
        roles: { title: "Rôles", constructor: RolesPage, icon: "ph-shield-check", menu: { group: "secondary", order: 1 }, permission: "roles.manage" },
        users: { title: "Utilisateurs", constructor: UsersPage, icon: "ph-users", menu: { group: "secondary", order: 2 }, permission: "users.manage" },
        ...(settings != null
            ? { settings: { title: "Paramètres", constructor: SettingsPage, icon: "ph-sliders", menu: { group: "secondary", order: 3 }, permission: "settings.manage" } as PageInfo<SettingsPage> }
            : {}),
        // No permission: unlike settings, every account may read and write
        // its own (same reasoning MQTTToolbox2 stated when this page was
        // still application-specific).
        preferences: { title: "Préférences", constructor: PreferencesPage, icon: "ph-sliders-horizontal", menu: { group: "secondary", order: 4 } }
    };
}
