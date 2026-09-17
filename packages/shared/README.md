# `@dagda/shared`

Le contrat typé entre le client et le serveur : types de champs, modèle
d'entités, contextes de chargement, permissions, actions, API — tout ce
qu'une application déclare une fois et qui donne l'autocomplétion et la
vérification des deux côtés. Ce paquet ne contient ni DOM ni SQL : rien
n'y suppose un navigateur ou une base PostgreSQL, ce qui le rend
importable tel quel côté client comme côté serveur.

C'est aussi le paquet le plus proche du cœur de Dagda : le cache
synchrone de `EntitiesHandler` (FEATURES §3) est décrit dans le README
racine comme « l'essentiel de la valeur du framework », et il vit ici.

## Carte du dossier

| `src/<dossier>` | Contenu |
|---|---|
| `entities/` | Le modèle d'entités (`model.ts`, `EntitiesModel`), le cache synchrone (`handler.ts`, `EntitiesHandler`), le service qui l'expose (`service.ts`), les types de base (`types.ts`, `BaseContext`, `BaseEntity`), les événements (`events.ts`) et `tools/` (adaptateurs de contexte, cache par table, énumérations déclaratives, types JS, types nommés, validation runtime). `_data.ts` est un modèle de test interne au framework (fixtures des specs), pas une API. `impl/test.adapters.ts` est l'adaptateur de persistance en mémoire utilisé par les tests |
| `sql/` | `transaction.ts` — `SQLTransaction`, les opérations insert/update/delete appliquées localement puis envoyées |
| `api/` | `types.ts` — `APICollection`, le type d'une déclaration d'API ; `impl/` — les deux API intégrées au framework (`entities.api.ts` : `fetch`/`submit`, `system.api.ts` : `getSystemInfo`/`triggerError`) |
| `actions/` | `types.ts` — `ActionsCollection`, le type d'une déclaration d'action (FEATURES §11.1) |
| `forms/` | `types.ts` — `FormFieldDeclaration`, la déclaration commune à un champ de formulaire généré (FEATURES §8.1), que l'entité, les paramètres système et les scripts projettent chacun dans leur propre déclaration |
| `settings/` | `model.ts` — `SettingsModel`, la déclaration typée des paramètres système (FEATURES §11.5) ; `service.ts` — l'interface de lecture (`SettingsService`, les deux côtés) et d'écriture (`SettingsWriteService`, serveur seul) |
| `preferences/` | `model.ts` — `PreferencesModel`, la déclaration typée des préférences utilisateur (FEATURES §11.6) |
| `auth/` | `types.ts` (`UserInfo`, `Role`, `Credentials`), `permissions.ts` (`DAGDA_PERMISSIONS`, `hasPermission`), `actions.ts` (`DagdaActions` — le contrat des actions de compte/rôle/préférence/paramètre fournies par le framework), `events.ts` (`userInfoChanged`) |
| `notification/` | `service.ts` (`NotificationService`), `events.ts` (`DagdaEvents`, `DagdaAppEvents`), `abstract.notification.handler.ts` (`AbstractNotificationHandler`, la base commune aux implémentations client et serveur) |
| `app/` | `types.ts` — `BaseAppTypes`, l'interface que `AppTypes` d'une application étend |
| `tools/` | Utilitaires génériques : `events.ts` (`EventHandler`), `queue.ts` (`Queue`, sérialisation), `pool.ts` (`Pool`, parallélisme limité), `async.ts` (`wait`), `asserts.ts` (`assertUnreachable`), `log.ts` (`LogService`) |
| `dagda.ts` (racine) | La classe `Dagda`, le registre de services commun aux deux côtés — voir plus bas |

## Ce qu'une application en importe

### Le modèle d'entités

```ts
// shared/src/entities/model.ts
import { EntitiesModel } from "@dagda/shared/src/entities/model";
import { JSTypes } from "@dagda/shared/src/entities/tools/javascript.types";

export const APP_MODEL = new EntitiesModel({
    PROJECT_ID: { rawType: JSTypes.number },
    TEXT: { rawType: JSTypes.string },
}, {
    projects: {
        id: { type: "PROJECT_ID", identity: true },
        name: { type: "TEXT" },
    },
});
```

`EntitiesModel.enum(...)` déclare une énumération `<uid, valeur, libellé>` ;
`EntitiesModel.type(...)` déclare un type custom. Les deux sont documentés
en détail dans GUIDE.md §1.1 et FEATURES §2.

### Les contextes de chargement

```ts
// shared/src/entities/contexts.ts
import { buildContextAdapter, intersectsOnEqualOptions } from "@dagda/shared/src/entities/tools/contexts";
import { BaseContext } from "@dagda/shared/src/entities/types";

export type ProjectContext = BaseContext<"project", { projectId: ProjectId }>;
export type AppContexts = ProjectContext /* | ... */;

export const APP_CONTEXT_ADAPTER = buildContextAdapter<AppContexts>({
    project: intersectsOnEqualOptions(),
});
```

Voir GUIDE.md §1.2 pour les autres règles fournies (`alwaysIntersects()`,
`neverIntersects()`, `intersectsWhen()`, `alsoIntersectsOtherTypes()`).

### Le contrat `AppTypes`

```ts
// shared/src/app/types.ts
import { BaseAppTypes } from "@dagda/shared/src/app/types";
import { EntitiesAPI } from "@dagda/shared/src/api/impl/entities.api";
import { SystemAPI } from "@dagda/shared/src/api/impl/system.api";
import { DagdaPermission } from "@dagda/shared/src/auth/permissions";

export interface AppTypes extends BaseAppTypes {
    fieldTypes: AppFieldTypes;
    entities: AppEntityTypes;
    contexts: AppContexts;
    apis: SystemAPI & EntitiesAPI<AppContexts, AppEntityTypes>;
    permissions: DagdaPermission; // + les permissions propres à l'application
}
```

C'est le type que `client/src/app/dagda.ts` (`ClientAppTypes`) et
`server/src/app/index.ts` (`AbstractServerApp<AppTypes>`) attendent tous
les deux — voir les README de `client` et `server`.

### Les briques annexes du contrat

Selon les besoins de l'application, déclarées à côté du modèle (GUIDE.md
§1.3 à §1.7, toutes optionnelles) :

- **Permissions** — une union de chaînes, ajoutée à `DagdaPermission` dans
  `AppTypes["permissions"]`.
- **Événements** — `export type AppEvents = { generating: { count: number } }`,
  assemblés dans `AppTypes["events"]` par `DagdaAppEvents<AppContexts> & AppEvents`
  (`@dagda/shared/src/notification/events.ts`) — sans ça, `contextChanged`
  n'est pas diffusable.
- **Actions** — un type respectant `ActionsCollection`
  (`@dagda/shared/src/actions/types.ts`), enregistré côté serveur avec
  `registerAction()` (voir README de `server`).
- **Paramètres système** — `SettingsModel` (`@dagda/shared/src/settings/model.ts`,
  FEATURES §11.5) ; **préférences** — `PreferencesModel`
  (`@dagda/shared/src/preferences/model.ts`, FEATURES §11.6). Les deux sont
  passés à `AbstractServerApp` et à `DagdaClient.start()`.

### Le registre de services (`Dagda`)

`Dagda` (ce paquet) est le registre de services, identique des deux
côtés — à ne pas confondre avec `DagdaClient` (paquet client), qui est
l'amorçage de l'application dans le navigateur. `ClientDagda` et
`ServerDagda` l'étendent chacun avec ce qui n'a de sens que sur leur
côté ; une application qui déclare ses propres services étend l'un des
deux à son tour. Détail dans le README de `client` et de `server`, et
dans FEATURES §9.

## Ce qu'une application n'a jamais à écrire

- Le cache synchrone, les transactions optimistes, le remapping d'ids
  temporaires, la file de soumission : tout `EntitiesHandler` (FEATURES §3).
- L'implémentation de `fetch`/`submit` comme appel API — seule leur
  réalisation (interroger la base, écrire en base) revient à l'application,
  côté serveur (`AbstractServerApp._fetch`/`_submit`, voir README de `server`).
- Les types `UserInfo`, `Role`, `Credentials`, la liste
  `DAGDA_PERMISSIONS` (`users.manage`, `roles.manage`, `settings.manage`) et
  le contrat `DagdaActions` : le socle des comptes, rôles et permissions
  arrive tout déclaré (FEATURES §7, §7.1, §11.4).
- La mécanique de comparaison de contextes elle-même
  (`ContextTypeAdapter`, `buildContextAdapter`) — l'application ne fournit
  qu'une règle par type de contexte.
- La validation runtime d'une entité (`getEntityErrors`/`validateEntity`)
  est fournie mais **jamais appelée automatiquement** : la brancher sur le
  chemin critique est un choix de performance qui reste à l'application
  (FEATURES §2).

## Pour aller plus loin

- FEATURES.md — §2 (modèle d'entités), §3 (cache & synchronisation), §5
  (routes & API), §7/§7.1 (authentification, rôles et permissions), §8.1
  (générateur de formulaires), §9 (injection de services), §10 (utilitaires
  partagés), §11.1 (couche d'actions), §11.4 à §11.7 (données natives du
  framework, paramètres, préférences, journal d'audit).
- GUIDE.md — §1, « Partie *shared* — le contrat typé », pour la marche à
  suivre complète avec des exemples tirés de `bootstrap/`.
