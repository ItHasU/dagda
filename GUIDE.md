# Guide — du boilerplate à l'application

> Ce guide répond à une question concrète : *concrètement, qu'est-ce que
> j'écris pour transformer `bootstrap/` en mon application ?* Pour chaque
> fonctionnalité de Dagda, il montre ce qui est déjà fourni (code réel,
> repris de `bootstrap/` et `packages/`) et ce que le développeur déclare
> à côté. FEATURES.md reste la source de vérité sur *ce qui existe* ; ROADMAP.md
> sur *à quel moment*. Les exemples marqués **cible v2** anticipent une
> fonctionnalité pas encore construite (référence à la tranche du ROADMAP) —
> ils suivent l'idiome déjà en place ailleurs dans le framework, pas une
> syntaxe inventée au hasard.

Une application Dagda est un monorepo à trois paquets : `shared` (le contrat
typé, importé par les deux autres), `client`, `serveur`. On part toujours de
`bootstrap/{shared,client,server}` et on modifie sur place — il n'y a pas
d'étape de génération aujourd'hui (le générateur `npm create dagda` est un
NEW de FEATURES §1, tranche 5).

---

## 1. Partie *shared* — le contrat typé

Tout ce qui suit est un **type TypeScript déclaré une fois**, importé côté
client et côté serveur : c'est lui qui donne l'autocomplétion et la
vérification aux deux bouts, y compris plus tard dans l'éditeur de scripts
(FEATURES §11.3).

### 1.1 Modèle d'entités

Le cœur du framework (FEATURES §2). On déclare les types de champs puis les
tables — typage complet dérivé de cette seule déclaration :

```ts
// shared/src/entities/model.ts
export const APP_MODEL = new EntitiesModel({
    // -- types d'identifiants, un par table --
    USER_ID: { rawType: JSTypes.number },
    PROJECT_ID: { rawType: JSTypes.number },
    // -- types de base --
    TEXT: { rawType: JSTypes.string },
    BOOLEAN: { rawType: JSTypes.boolean },
    // -- type custom, porté par une valeur non-primitive --
    PROJECT_STATUS: EntitiesModel.type<JSTypes.custom, ProjectStatus>({
        rawType: JSTypes.custom,
    }),
}, {
    projects: {
        id: { type: "PROJECT_ID", identity: true },
        name: { type: "TEXT" },
        userId: { type: "USER_ID" },       // foreignTable possible ici
        status: { type: "PROJECT_STATUS" },
    },
});
```

Deux tables `data_projects` par exemple (préfixe `data_`, FEATURES §2) sont
alors dérivées avec DDL, noms quotés, et types nommés (`ProjectId` ≠
`UserId` bien que tous deux des `number`).

#### Énumérations déclaratives

Les `enum` TypeScript sont remplacés par une **énumération déclarative**
`<uid, valeur, libellé>` : c'est ce libellé qui permet au générateur de
formulaires (§8.1, tranche 3) de rendre un menu déroulant sans table de
correspondance écrite à la main dans chaque écran.

```ts
// remplace `export const enum ProjectStatus { ... }`
export const PROJECT_STATUS = EntitiesModel.enum({
    ACTIVE:   { value: 1, label: "Actif" },
    ARCHIVED: { value: 2, label: "Archivé" },
});
/** Type des valeurs : 1 | 2 */
export type ProjectStatus = typeof PROJECT_STATUS.type;
```

- **La valeur persistée est toujours choisie explicitement**, jamais dérivée de
  l'ordre de déclaration : c'est ce qui permettra de reprendre à l'identique les
  colonnes déjà remplies d'EurekAI (`ComputationStatus`, `PictureType`).
- Elle peut être un **entier ou une chaîne** ; toutes les entrées d'une même
  énumération doivent partager le même type (vérifié à la construction, comme
  l'unicité des valeurs).
- L'objet rendu est **aussi une définition de type de champ** : la même
  constante sert à déclarer l'énumération et à typer la colonne.

```ts
export const APP_MODEL = new EntitiesModel({
    PROJECT_STATUS,                        // directement utilisable comme type
    // ...
}, {
    projects: {
        status: { type: "PROJECT_STATUS" }, // typé `1 | 2`, pas `number`
    },
});

PROJECT_STATUS.values.ACTIVE     // 1, typé 1
PROJECT_STATUS.values.INCONNU    // erreur de compilation
PROJECT_STATUS.getLabel(1)       // "Actif"
PROJECT_STATUS.getEntries()      // [{ uid, value, label }, ...] pour un <select>
PROJECT_STATUS.isValidValue(3)   // false
```

#### Validation runtime des entités

Le modèle sait vérifier à l'exécution qu'un objet correspond bien à sa table :
type de chaque champ, champs obligatoires présents, valeur d'énumération
déclarée, champ inconnu.

```ts
APP_MODEL.getEntityErrors("projects", item);            // liste des problèmes
APP_MODEL.getEntityErrors("projects", values, { partial: true }); // pour un update
APP_MODEL.validateEntity("projects", item);             // lève EntityValidationException
```

Chaque erreur nomme la table et le champ fautif — elle est écrite pour être lue
par quelqu'un qui débogue :

```
Table "projects", field "status": 42 is not a valid value for the enumeration
"PROJECT_STATUS" (expected one of 1, 2)
```

**Ce n'est pas branché automatiquement** : valider chaque entité sur le chemin
critique (insertion dans le cache, transactions, résultats de fetch) est un
arbitrage de performance qui appartient à l'application. Points d'appel
suggérés, par intérêt décroissant : côté serveur dans la soumission de
transaction, côté client dans `SQLTransaction.insert()`/`update()` derrière un
drapeau de développement, et dans les tests de l'application sur les fixtures.

Les champs déclarés en `JSTypes.custom` ne sont pas vérifiés : le modèle ne
connaît rien de leur représentation à l'exécution.

**Ce que le développeur ne déclare jamais** : les tables `system_*`
(comptes, rôles, paramètres, préférences) — elles arrivent en état de
marche avec le framework, migrations comprises (FEATURES §2, §11.4).

### 1.2 Contextes de chargement

Un contexte typé par cas d'usage, et la fonction qui dit si deux contextes
se recouvrent (pour l'invalidation du cache, FEATURES §3) :

L'application ne déclare plus qu'**une règle par type de contexte** ; le
framework assemble le `ContextAdapter` attendu par l'`EntitiesHandler` :

```ts
// shared/src/entities/contexts.ts
export type UsersContext    = BaseContext<"users",    undefined>;
export type ProjectsContext = BaseContext<"projects", { userId?: UserId }>;
export type ProjectContext  = BaseContext<"project",  { projectId: ProjectId }>;
export type AppContexts = UsersContext | ProjectsContext | ProjectContext;

export const APP_CONTEXT_ADAPTER = buildContextAdapter<AppContexts>({
    // aucune option : tous les contextes "users" décrivent la même donnée
    users: alwaysIntersects(),
    // userId absent signifie « tous les utilisateurs »
    projects: intersectsWhen((a, b) =>
        a.options.userId == null || b.options.userId == null
        || a.options.userId === b.options.userId),
    // une modification sur un projet ne concerne que ce projet
    project: intersectsOnEqualOptions(),
});
```

Les deux notions ne sont pas interchangeables :

| | Question posée | Décide |
|---|---|---|
| `equals` | « est-ce exactement le même fetch ? » | si le contexte est déjà en cache |
| `intersects` | « un changement ici touche-t-il là ? » | quels contextes deviennent *dirty* |

`equals` est donc toujours l'**égalité de tous les paramètres** (`optionsEqual`,
une comparaison stricte par paramètre ; un paramètre à `undefined` et un
paramètre absent sont équivalents). Seule l'intersection varie :
`alwaysIntersects()`, `neverIntersects()`, `intersectsOnEqualOptions()`, et
`intersectsWhen(prédicat)` pour tout le reste.

#### Intersection entre types différents

Deux contextes de types différents ne sont **jamais égaux**, et par défaut ne
s'intersectent pas non plus. Mais une liste qui porte un résumé du détail doit
être invalidée par un changement sur le détail — et l'écriture peut venir du
serveur, sans passer par un client qui aurait la liste dans ses contextes
actifs. C'est le cas central de MQTTToolbox 2 : la liste des topics porte
`lastMessageAt`, donc un message arrivant sur le topic 42 salit `topic{42}`
**et** `topics`.

```ts
export type TopicsContext = BaseContext<"topics", undefined>;
export type TopicContext  = BaseContext<"topic",  { topicId: TopicId }>;
export type AppContexts = TopicsContext | TopicContext;

export const APP_CONTEXT_ADAPTER = buildContextAdapter<AppContexts>({
    // La liste porte lastMessageAt de chaque topic : tout ce qui arrive sur
    // n'importe quel topic la périme, y compris depuis un autre type de contexte
    topics: alsoIntersectsOtherTypes(alwaysIntersects()),
    // Deux historiques ne se recouvrent que s'il s'agit du même topic
    topic: intersectsOnEqualOptions(),
});
```

`alsoIntersectsOtherTypes(règle, prédicat?)` enveloppe une règle existante et
ajoute la relation vers les autres types — tous par défaut, ou ceux que le
prédicat retient :

```ts
pictures: alsoIntersectsOtherTypes(intersectsOnEqualOptions(),
    (own, other) => other.type === "project" && other.options.projectId === own.options.projectId),
```

Trois propriétés à connaître :

- **Facultatif** : une application qui n'en a pas besoin n'écrit rien de plus,
  et oublier une relation n'est jamais une erreur de compilation.
- **Symétrique par construction** : `buildContextAdapter` interroge les *deux*
  règles quand les types diffèrent et garde `true` si l'une des deux l'affirme.
  Déclarer la relation d'un seul côté suffit, et `contextIntersects(a, b)` vaut
  toujours `contextIntersects(b, a)`.
- **À l'intérieur d'un même type**, la symétrie reste à la charge de
  l'application : les quatre règles fournies sont symétriques, mais un prédicat
  passé à `intersectsWhen()` peut ne pas l'être — c'est un bug, testez-le.

### 1.3 Permissions — **cible v2 (tranche 3, FEATURES §7.1)**

Une constante applicative, pas une donnée — comme le modèle ou les actions :

```ts
// shared/src/app/permissions.ts
export type AppPermissions =
    | "projects.manage"
    | "projects.viewAll"
    | "users.invite";
```

Le framework fournit son propre socle (`users.manage`, `settings.edit`…) ;
l'application ajoute le sien au même type. Les **rôles**, eux, restent une
donnée créée par l'administrateur (nom + sous-ensemble de permissions),
gérée depuis l'écran fourni par le framework — rien à coder ici.

### 1.4 Notifications serveur → client

Les événements applicatifs, en plus de ceux déjà fournis (`contextChanged`…) :

```ts
// shared/src/entities/events.ts
export type AppEvents = {
    generating: { count: number };
};
```

### 1.5 Routes client → serveur — **cible v2 (tranche 3, FEATURES §5)**

Pour une action serveur qui n'est pas une simple écriture d'entité :

```ts
// shared/src/app/routes.ts
export type AppRoutes = {
    triggerAutomation: {
        params: { automationId: AutomationId };
        result: void;
        /** Évaluée sur les permissions résolues côté serveur */
        permission: (perms: AppPermissions[]) => perms.includes("automations.run");
    };
};
```

### 1.6 API externes — **cible v2 (tranche 6, FEATURES §5)**

Déclarées à part des routes internes : ce qu'on expose à `curl` n'est pas ce
qu'on expose à son propre client.

```ts
// shared/src/app/external-api.ts
export type AppExternalAPI = {
    /** GET /api/v1/automations/:id/run — jeton porteur des permissions du propriétaire */
    runAutomation: (automationId: AutomationId) => void;
};
```

### 1.7 Actions de modification — **cible v2 (tranche 2, FEATURES §11.1)**

Le premier paramètre est toujours la transaction — ce qui les rend
composables et scriptables depuis la console (§11.2) :

```ts
// shared/src/app/actions.ts
export type AppActions = {
    archiveProject: (tr: Transaction<AppEntityTypes>, projectId: ProjectId) => Promise<void>;
};

// implémentation, appelable depuis un gestionnaire de clic *ou* la console
export async function archiveProject(tr, projectId) {
    await tr.update("projects", projectId, { status: PROJECT_STATUS.ARCHIVED });
}
```

Ce qui reste dans le gestionnaire de clic : lire le formulaire, confirmer,
fermer le panneau — jamais l'invariant métier lui-même (règle détaillée en
FEATURES §11.1).

### 1.8 `AppTypes` — assembler le contrat

Le point d'entrée que client et serveur importent tous les deux :

```ts
// shared/src/app/types.ts
export interface AppTypes extends BaseAppTypes {
    fieldTypes: AppFieldTypes;
    entities: AppEntityTypes;
    contexts: AppContexts;
    apis: SystemAPI & EntitiesAPI<AppContexts, AppEntityTypes>;
    // cible v2 : permissions: AppPermissions; routes: AppRoutes; actions: AppActions;
}
```

---

## 2. Partie *client*

### 2.1 Déclarer les services (`Dagda.init`)

```ts
// client/src/services.ts
export function initServices(): void {
    const pageHandler = new PageHandler<AppPages>();
    pageHandler.registerPage("projects", { order: 1, title: "Projets", constructor: ProjectsPage });

    Dagda.init<ClientServices>({
        log: buildConsoleLogService(),
        notification: new ClientNotificationImpl(),
        entities: buildClientEntitiesService(APP_MODEL, new AppContextAdapter()),
        pages: pageHandler,
        // cible v2 : auth: buildAuthService()  (FEATURES §9)
    });
}
```

`Dagda` vient du paquet *shared* : c'est le registre de services, et il
s'utilise à l'identique côté client et côté serveur — `Dagda.init(...)` pour
enregistrer, `Dagda.get("nom")` pour lire, `Dagda.loaded` pour attendre.

Une fois les services enregistrés, l'application cliente démarre avec
`DagdaClient.start(...)`, qui vient du paquet *client* et ne fait que
l'amorçage (en-têtes de page, informations système, appels d'API) :

```ts
// client/src/index.ts
initServices();
DagdaClient.start<AppTypes>(APP_MODEL, new AppContextAdapter());
```

### 2.2 Pages

Chaque page dérive d'`AbstractPageElement` et se déclare avec un titre et
un ordre de menu :

```ts
// client/src/pages/projects/projects.page.ts
import template from "./projects.page.html";

export class ProjectsPage extends AbstractPageElement {
    constructor() {
        super({ template });
    }
    protected override async _refresh(): Promise<void> {
        const handler = Dagda.get<EntitiesService<AppEntityTypes, AppContexts>>("entities");
        await handler.fetch({ type: "projects", options: {} });
        // ... rendu du DOM à partir de handler.getItems("projects")
    }
}
customElements.define("projects-page", ProjectsPage);
```

**Cible v2 (tranche 1)** — la page dérive d'`ApplicationPage` (coquille SPA
fournie clé en main : menu + zone de contenu, l'app n'écrit plus la
navigation elle-même). L'inscription au menu reste optionnelle — une page
non inscrite reste atteignable par le service de navigation — et le menu
**filtre automatiquement par permission** (§7.1) : pas la peine de vérifier
soi-même avant d'afficher une entrée.

### 2.3 Composants

`AbstractWebComponent` fournit le cycle de vie (`_init` une fois,
`_refresh` à chaque changement) et deux décorateurs pour accéder au DOM et
aux attributs sans `querySelector` manuel :

```ts
// client/src/components/project-card/project-card.component.ts
import template from "./project-card.component.html";

export class ProjectCard extends AbstractWebComponent {
    @Ref() private _title!: HTMLElement;
    @Attribute<number>({ marshaller: NumberMarshaller }) public projectId!: number;

    constructor() {
        super({ template });
    }
    protected override async _refresh(): Promise<void> {
        this._title.textContent = `Projet #${this.projectId}`;
    }
}
customElements.define("project-card", ProjectCard);
```

Poser `element.projectId = 42` déclenche automatiquement `_refresh()`.

Deux points sur le cycle de vie, qui évitent des surprises :

- Un `refresh()` demandé pendant qu'un autre tourne **n'est pas perdu** : il est
  regroupé, et une passe supplémentaire s'exécute derrière. Poser deux attributs
  à la suite laisse donc bien le composant sur le dernier état. La promesse
  rendue par `refresh()` se résout quand le composant reflète l'état au moment
  de l'appel, et n'échoue jamais — un `_refresh()` en erreur affiche l'erreur à
  la place du composant.
- Le gabarit est importé, pas `require()`. Tout paquet contenant des composants
  a donc besoin de la déclaration `declare module "*.html"` (voir
  `packages/client/src/templates.d.ts`). C'est ce qui rend les composants
  instanciables hors bundle, et donc testables sous DOM simulé.

### 2.4 Thèmes — **cible v2 (tranches 1 et 4, FEATURES §8)**

Le framework livre `dagda-ui.css` (vocabulaire de classes, `.btn`, `.card`,
`.field`…) et plusieurs thèmes standard, chacun un simple jeu de jetons
(~60 lignes) :

```ts
// client/src/app/types.ts (extrait)
export const APP_THEMES = ["nocturne-dark", "nocturne-light"] as const;
```

Le développeur écrit ses écrans avec les classes du vocabulaire commun
(jamais de couleur ni de `px` en dur — le lint d'adhérence `_adherence.oxlintrc.json`
le vérifie en CI) ; c'est l'utilisateur, pas l'administrateur, qui choisit
son thème parmi cette liste, mémorisé comme préférence (§11.6).

### 2.5 Formulaires générés — **cible v2 (tranche 3, FEATURES §8.1)**

À partir d'une liste de champs typés (types du modèle, énumérations
comprises), un formulaire rendu et validé :

```ts
const fields = [
    { key: "name", type: "TEXT", label: "Nom", required: true },
    { key: "status", type: "PROJECT_STATUS", label: "Statut" }, // rendu en <select>, libellés tirés de l'énum
];
const form = FormGenerator.render(fields, currentProject);
```

Trois consommateurs identifiés : les formulaires métier de l'application,
l'écran de paramètres système (§11.5) et l'écran de paramètres d'un script
avant exécution (§11.3) — brique à concevoir pour les trois, pas pour un
seul.

---

## 3. Partie *serveur*

### 3.1 `ServerApp` — valider l'utilisateur et répondre aux contextes

Les deux méthodes que toute application implémente :

```ts
// server/src/app.ts
export class ServerApp extends AbstractServerApp<AppTypes> {

    protected override async _isUserValid(profile: PassportProfile): Promise<boolean> {
        // cible v2 (tranche 3) : plus de profil OAuth, l'utilisateur existe
        // déjà (compte local créé par invitation) — cette méthode disparaît.
    }

    protected override async _fetch(context: AppContexts, request: RequestOptions): Promise<Data<AppEntityTypes>> {
        const result: Data<AppEntityTypes> = {};
        switch (context.type) {
            case "projects": {
                const userId = await this._getUserId(request);
                result.projects = await this._db.all(
                    `SELECT * FROM data_projects WHERE "userId" = $1`, userId
                );
                break;
            }
            case "project": {
                result.projects = await this._db.all(
                    `SELECT * FROM data_projects WHERE id = $1`, context.options.projectId
                );
                break;
            }
        }
        return result;
    }
}
```

Une écriture passe par une transaction SQL réelle, ouverte par le
framework autour de l'API `submit` déjà fournie — le développeur n'a rien à
enregistrer de plus pour le CRUD de base.

### 3.2 Routes et API externes — **cible v2 (tranches 3 et 6)**

```ts
// server/src/app.ts (suite)
this.registerRoute("triggerAutomation", async (options, { automationId }) => {
    await runAutomationNow(automationId); // implémentation métier
});

this.registerExternalAPI("runAutomation", async (tokenIdentity, automationId) => {
    // tokenIdentity porte les permissions de son propriétaire — pas de portée réduite
    await runAutomationNow(automationId);
});
```

### 3.3 Paramètres système — **cible v2 (tranche 1 pour le mécanisme, tranche 3 pour l'écran, FEATURES §11.5)**

Pour tout réglage lu uniquement côté serveur (mot de passe de broker, jeton
tiers) — jamais une entité, parce qu'une entité est lisible depuis la
console par quiconque charge son contexte :

```ts
// shared/src/app/settings.ts
export const APP_SETTINGS = declareSettings({
    mqttBrokerUrl:      { type: "TEXT",   visibility: "server" },
    mqttBrokerPassword: { type: "TEXT",   visibility: "server", secret: true },
    instanceTitle:       { type: "TEXT",   visibility: "client" },
});

// server : réagir à un changement à chaud, sans redémarrage
Settings.on("mqttBrokerUrl", (value) => reconnectBroker(value));
```

### 3.4 Hooks sur modification de données — **cible v2 (tranche 6, FEATURES §3)**

Point d'accroche déclenché par une transaction — c'est ce sur quoi
reposeront les déclencheurs « sur changement » d'un automatisme :

```ts
this._entitiesHandler.onWrite("messages", async (change) => {
    await evaluateTriggers(change);
});
```

---

## 4. Checklist chronologique — de `bootstrap/` à l'app

1. Copier `bootstrap/{shared,client,server}`, renommer les paquets npm.
2. **Shared** : modèle d'entités (§1.1), contextes (§1.2), événements
   (§1.4) — c'est le minimum pour que quelque chose se charge et s'affiche.
3. **Serveur** : `_isUserValid` (liste blanche), `_fetch` par contexte.
4. **Client** : une page qui appelle `fetch` et affiche le résultat,
   enregistrée dans `services.ts`.
5. Écrire, brancher `withTransaction` pour la première écriture ; c'est
   à ce moment que la frontière action / gestionnaire de clic (§1.7) se
   décide — mieux vaut la fixer tôt qu'après plusieurs écrans.
6. Une fois plusieurs écrans : permissions (§1.3), routes protégées si un
   écran déclenche une action serveur hors CRUD (§1.5).
7. Paramètres système dès qu'un réglage serveur ne doit pas transiter par
   le cache client (§3.3).
8. Automatiser / exposer à l'extérieur : API externes + jetons (§1.6),
   hooks sur modification (§3.4) — seulement si le besoin apparaît.

## 5. Ce qui n'a jamais à être écrit par l'application

- Tables et migrations `system_*` : comptes, rôles, paramètres, préférences.
- Authentification locale : hachage des mots de passe, invitation,
  changement de mot de passe.
- Écrans d'administration : utilisateurs, matrice rôle × permission,
  configuration, gestion des jetons d'API.
- Coquille SPA : menu, navigation, composant de statut, PWA (manifest,
  icônes), page « hors ligne ».
- Feuille de style et thèmes standard (`dagda-ui.css`), icônes (Phosphor).
- Console `dagda` (variable globale) et éditeur de scripts TypeScript.

Tout le reste — modèle métier, écrans, actions, automatismes — est
spécifique à l'application et suit les patrons ci-dessus.
