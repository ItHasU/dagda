# `@dagda/server`

Le serveur applicatif : `AbstractServerApp`, la classe qui assemble Express,
la session, l'authentification locale, la base PostgreSQL, les migrations,
les WebSockets et les comptes/rôles/paramètres/préférences/journal d'audit
— tout ce qu'une application Dagda reçoit en état de marche sans écrire une
ligne pour ça (FEATURES §0, « les services de base sont autonomes »). Il
dépend de `@dagda/shared` pour le contrat typé, et n'a aucune dépendance
vers `@dagda/client`.

## Carte du dossier

| `src/<dossier>` | Contenu |
|---|---|
| `app/` | `index.ts` — `AbstractServerApp`, la classe qu'une application étend (voir plus bas) ; `dagda.ts` — `ServerDagda`, la variable `dagda` côté serveur |
| `api/` | `index.ts` — `apiRegister()`, `RequestOptions` (`type: "client"` / `"server"`) ; `impl/` — les deux API intégrées (`entities.api.ts` : `submit()`, `system.api.ts` : `getSystemInfo`/`triggerError`) ; `manifest.ts` — `registerManifestEntry()`/`getManifest()`, ce qui alimente `dagda.system`/`dagda.api`/`dagda.help()` côté client |
| `actions/` | `index.ts` — `actionRegister()`, `ActionCallback`, sous son propre espace `/actions/` distinct de `/` (FEATURES §11.1) |
| `auth/` | `index.ts` — `AuthHandler` (session, `/login`, `/logout`, `/invite/:token`) ; `users.ts` — `UserStore` (comptes, invitation, mot de passe) ; `roles.ts` — `RoleStore` (matrice rôle × permission) ; `passwords.ts` — hachage/vérification (scrypt) ; `login.page.ts`/`invitation.page.ts` — les pages HTML rendues côté serveur pour la connexion et l'acceptation d'invitation |
| `audit/` | `store.ts` — `AuditLogStore`, la table `system_audit_log` (FEATURES §11.7) |
| `settings/` | `store.ts` — `SettingsStore`, les valeurs des paramètres système, chargées une fois au démarrage (FEATURES §11.5) ; `crypto.ts` — chiffrement/déchiffrement des paramètres secrets |
| `preferences/` | `store.ts` — `PreferencesStore`, lecture/écriture par utilisateur, sans cache (FEATURES §11.6) |
| `notification/` | `notification.impl.ts` — `ServerNotificationImpl`, le serveur WebSocket, résolution du compte à la connexion |
| `sql/` | `runner.ts` — `AbstractSQLRunner`/`SQLConnection` ; `impl/pg.runner.ts` — `PGRunner`, l'implémentation PostgreSQL ; `schema.ts` — génération du DDL depuis le modèle (`qi`/`qt`/`qf`, `getCreateTableStatement`) ; `migrations.ts` — `Migration`, `applyMigrations()` ; `framework.migrations.ts` — les migrations du framework lui-même (tables `system_*`) ; `coherence.ts` — `checkSchemaCoherence()`, le contrôle modèle ↔ schéma au démarrage |
| `tools/` | `config.ts` — `getEnvString`/`getEnvNumber`/leurs variantes `Optional`, la lecture des variables d'environnement d'amorçage |
| `test/` | `pg.fixture.ts`/`pg.globalsetup.ts` — la détection d'une base PostgreSQL disponible pour les tests du framework lui-même (`DAGDA_TEST_DB_URL`, `DAGDA_REQUIRE_DB`), réutilisable telle quelle par les tests serveur d'une application (voir `vitest.config.ts` à la racine pour l'usage réel) |

## Ce qu'une application en importe

### `AbstractServerApp`

```ts
// server/src/app.ts
import { AbstractServerApp } from "@dagda/server/src/app";
import { RequestOptions } from "@dagda/server/src/api";
import { Migration } from "@dagda/server/src/sql/migrations";
import { Data } from "@dagda/shared/src/entities/tools/adapters";
import { APP_MIGRATIONS } from "./migrations";

export class ServerApp extends AbstractServerApp<AppTypes> {

    protected override _migrations(): Migration[] {
        return APP_MIGRATIONS;
    }

    protected override async _fetch(context: AppContexts, request: RequestOptions): Promise<Data<AppEntityTypes>> {
        const result: Data<AppEntityTypes> = {};
        switch (context.type) {
            case "projects": {
                const userId = this._getUserId(request);
                result.projects = await this._db.all(`SELECT * FROM data_projects WHERE "userId" = $1`, userId);
                break;
            }
        }
        return result;
    }
}
```

```ts
// server/src/main.ts
import { DEFAULT_SERVER_PARAMS } from "@dagda/server/src/app";

const app = new ServerApp({ ...DEFAULT_SERVER_PARAMS }, APP_MODEL, APP_CONTEXT_ADAPTER);
await app.listen(); // applique les migrations, vérifie le schéma, puis écoute
```

`_fetch()` est la seule méthode réellement obligatoire (`_migrations()` a
un défaut vide, `_submit()` a une implémentation par défaut qui applique
la transaction telle quelle). `request` porte qui écrit :
`{type: "client", user, ...}` pour une écriture venant du client,
`{type: "server"}` pour une écriture faite par le serveur lui-même (une
action, une migration).

### Migrations applicatives

```ts
// server/src/migrations.ts
import { Migration } from "@dagda/server/src/sql/migrations";

export const APP_MIGRATIONS: Migration[] = [
    { id: "0001-initial-schema", up: async (tools) => { await tools.createAllTables(); } }
];
```

`tools.createAllTables()`/`tools.createTable(name)` dérivent le DDL du
modèle ; `tools.run(...)` couvre le reste. Un id est enregistré une fois
appliqué — jamais renommé, jamais inséré avant un id déjà publié.

### Routes et actions propres à l'application

```ts
// server/src/app.ts (suite)
this.registerAction("archiveProject", async (user, projectId) => { /* ... */ }, { permission: "projects.manage" });
this.registerAPI("triggerAutomation", async (options, { automationId }) => { /* ... */ }, { permission: (perms) => perms.includes("automations.run") });
```

`registerAction()` journalise automatiquement chaque appel réussi dans le
journal d'audit (FEATURES §11.7) — l'application n'a rien à faire pour ça.

Pour une API qui ne passe pas par la session (jetons Bearer, objets
connectés), `this._publicRouter` est monté **avant** les parseurs de corps
globaux et la porte de connexion : la sous-classe y ajoute ses routes, qui
gèrent elles-mêmes leur parsing, leurs limites et leur authentification.

```ts
constructor(...) {
    super(...);
    this._publicRouter.use("/api/v1", buildMyApiRouter());
}
```

### Paramètres et préférences

```ts
new ServerApp({ ...DEFAULT_SERVER_PARAMS }, APP_MODEL, APP_CONTEXT_ADAPTER, APP_SETTINGS, APP_PREFERENCES);
```

`app.settings.get(key)` (synchrone) et `app.settings.on(key, listener)`
pour réagir à chaud (FEATURES §11.5) ; `app.preferences` pour les
préférences par utilisateur (FEATURES §11.6).

## Ce qu'une application n'a jamais à écrire

- **Les tables et migrations `system_*`** : comptes, rôles, paramètres,
  préférences, journal d'audit, table des migrations elle-même —
  livrées et appliquées par `FRAMEWORK_MIGRATIONS`, avant les migrations
  de l'application (FEATURES §2, §11.4).
- **L'authentification locale complète** : session, hachage des mots de
  passe (scrypt), page de connexion, mécanisme d'invitation à usage unique
  (sept jours), réinitialisation par réémission du lien — tout `AuthHandler`
  et `UserStore` (FEATURES §7). Le premier compte (`admin`/`admin`) est créé
  automatiquement sur une base vide par `ensureBootstrapAdmin()`.
- **Les ~14 actions standard** de gestion des comptes et des rôles
  (`listUsers`, `inviteUser`, `reinviteUser`, `setUserEnabled`,
  `setUserRole`, `setUserSuperAdmin`, `setUserDisplayName`, `listRoles`,
  `createRole`, `updateRole`, `deleteRole`, `listUserNames`,
  `getPreferences`/`setPreference`, `getSettingsValues`/`setSetting`) —
  enregistrées par le constructeur d'`AbstractServerApp`, gardées par
  permission, journalisées.
- **Le journal d'audit** (`system_audit_log`) : chaque action réussie et
  chaque transaction (`_submit()`) réussie y est inscrite ; un refus de
  permission n'écrit jamais rien ; une valeur déclarée secrète n'y apparaît
  jamais en clair (FEATURES §11.7).
- **Le contrôle de cohérence modèle ↔ schéma** au démarrage
  (`checkSchemaCoherence`) : une migration oubliée est détectée avant la
  première requête, pas sur un écran au hasard.
- **La diffusion WebSocket** : `ServerNotificationImpl` résout le compte à
  la connexion, `_submit()` diffuse lui-même `contextChanged` après une
  écriture réussie — l'application n'a pas à le faire à la main.
- **Le chiffrement des paramètres secrets** (`SettingsStore`/`crypto.ts`) :
  chiffrés au repos, jamais relus en clair, rédigés dans le journal
  d'audit.
- **La lecture des variables d'environnement d'amorçage**
  (`APP_PORT`, `APP_BASE_URL`, `APP_DATABASE_URL`, `APP_SECRET`) — noms
  fixes, pas de préfixe à configurer (FEATURES §7).

## Pour aller plus loin

- FEATURES.md — §2 (modèle & migrations), §4 (accès base de données), §5
  (routes & API externes), §6 (notifications temps réel), §7/§7.1
  (authentification, rôles et permissions), §11.1 (couche d'actions),
  §11.4 à §11.7 (données natives du framework, paramètres, préférences,
  journal d'audit).
- GUIDE.md — §3, « Partie *serveur* », pour la marche à suivre complète
  avec des exemples tirés de `bootstrap/`.
