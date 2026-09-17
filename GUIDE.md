# Guide — du boilerplate à l'application

> Ce guide répond à une question concrète : *concrètement, qu'est-ce que
> j'écris pour transformer `bootstrap/` en mon application ?* Pour chaque
> partie du contrat, il montre le code réel de `bootstrap/{shared,client,server}`
> — pas un exemple inventé pour l'occasion. FEATURES.md reste la source de
> vérité sur *ce qui existe* ; ROADMAP.md sur *à quel moment*. Ce qui n'est pas
> encore construit est marqué **pas encore livré (tranche N)**, avec la tranche
> du ROADMAP qui l'apportera — jamais présenté comme du code qu'on pourrait
> écrire aujourd'hui.
>
> Ce guide ne répète pas ce que les README de chaque paquet
> (`packages/{shared,client,server}/README.md`) documentent déjà — ce qu'un
> paquet contient et expose. Il montre comment on les assemble, dans l'ordre,
> pour construire une application. Quand le détail d'une brique est déjà
> écrit ailleurs, ce guide y renvoie plutôt que de le recopier.

Une application Dagda est un monorepo à trois paquets : `shared` (le contrat
typé, importé par les deux autres), `client`, `server`. On part de
`bootstrap/{shared,client,server}`, on copie, et on modifie sur place — il n'y
a pas d'étape de génération aujourd'hui (`npm create dagda` n'existe pas
encore ; ROADMAP tranche 5 le prévoit « éventuellement », seulement si le
boilerplate s'avère stable). Chaque paquet copié garde son `package.json` :
il suffit d'y renommer le scope `@dagda-app/*` par celui de la vraie
application (`bootstrap/{shared,client,server}/package.json`), et de mettre à
jour les imports en conséquence.

---

## 1. Partie *shared* — le contrat typé

Tout ce qui suit est un **type TypeScript déclaré une fois**, importé côté
client et côté serveur : c'est lui qui donne l'autocomplétion et la
vérification aux deux bouts.

### 1.1 Modèle d'entités

Le cœur du framework (FEATURES §2). `bootstrap/shared/src/entities/model.ts`
déclare les types de champs puis les tables :

```ts
// bootstrap/shared/src/entities/model.ts
export const PROJECT_STATUS = EntitiesModel.enum({
    INACTIVE: { value: 0, label: "Inactif" },
    ACTIVE:   { value: 1, label: "Actif" },
    STARRED:  { value: 2, label: "Favori" },
    FINISHED: { value: 3, label: "Terminé" },
});
export type ProjectStatus = typeof PROJECT_STATUS.type;

export const APP_MODEL = new EntitiesModel({
    USER_ID: { rawType: JSTypes.number },
    PROJECT_ID: { rawType: JSTypes.number },
    NOTE_ID: { rawType: JSTypes.number },
    BOOLEAN: { rawType: JSTypes.boolean },
    TEXT: { rawType: JSTypes.string },
    PROJECT_STATUS,
}, {
    projects: {
        id: { type: "PROJECT_ID", identity: true },
        name: { type: "TEXT" },
        description: { type: "TEXT" },
        userId: { type: "USER_ID" },
        status: { type: "PROJECT_STATUS" }
    },
    // Une seconde table, qui référence la première — la clé étrangère.
    notes: {
        id: { type: "NOTE_ID", identity: true },
        projectId: { type: "PROJECT_ID", foreignTable: "projects" },
        text: { type: "TEXT" }
    }
});
```

Deux points à retenir sur cet exemple, tous deux réels :

- **`userId` ne référence aucune table du modèle.** Les comptes sont des
  données du framework, pas des entités (FEATURES §11.4) : il n'existe pas de
  table `users` dans `APP_MODEL`. `userId` porte l'id d'un compte Dagda —
  c'est le seul pont entre les deux mondes. Pour émettre une vraie clé
  étrangère SQL vers `system_users` (`REFERENCES system_users(id) ON DELETE
  SET NULL`), il faut le déclarer explicitement avec
  `{ type: "USER_ID", referencesUsers: true }` (`FieldDefinition.referencesUsers`)
  — **`bootstrap` ne le fait pas** aujourd'hui sur `projects.userId`, alors
  que la fonctionnalité existe et sert précisément ce cas (voir « Écarts »
  dans le rapport).
- **Une clé étrangère se nomme d'après la table qu'elle référence**, pas
  d'après son rôle : `notes.projectId`, pas `notes.parentId` ou
  `notes.ownerId`. C'est ce que lit `foreignTable: "projects"` — rien
  n'infère le lien depuis le nom ou le type seuls.

Énumérations déclaratives (`EntitiesModel.enum`, triplet `<uid, valeur,
libellé>`), types custom (`EntitiesModel.type<RawType, Custom>`), validation
runtime (`getEntityErrors`/`validateEntity`, jamais branchée automatiquement) :
détaillés dans `packages/shared/README.md` et FEATURES §2. Le seul point à
retenir ici : **le développeur ne déclare jamais** les tables `system_*`
(comptes, rôles, paramètres, préférences) — elles arrivent en état de marche.

### 1.2 Contextes de chargement

Un contexte typé par cas d'usage, et une règle d'intersection par type — le
framework assemble le `ContextAdapter` complet :

```ts
// bootstrap/shared/src/entities/contexts.ts
export type ProjectsContext = BaseContext<"projects", { userId?: UserId }>;
export type ProjectContext  = BaseContext<"project",  { projectId: ProjectId }>;
export type AppContexts = ProjectsContext | ProjectContext;

export const APP_CONTEXT_ADAPTER: ContextAdapter<AppContexts> = buildContextAdapter<AppContexts>({
    // userId absent signifie "tous les utilisateurs" : un changement sur les
    // projets d'un utilisateur concerne donc aussi la liste non filtrée.
    projects: intersectsWhen((newContext, oldContext) =>
        newContext.options.userId == null
        || oldContext.options.userId == null
        || newContext.options.userId === oldContext.options.userId),
    // Une modification sur un projet ne concerne que ce projet.
    project: intersectsOnEqualOptions()
});
```

`ProjectContext` est le **contexte à options** (`{ projectId }`) que l'exigence
EurekAI du ROADMAP réclamait dès `bootstrap/` : il porte à la fois le projet
et ses notes (voir §3.1, `ServerApp._fetch`).

Les quatre règles fournies — `alwaysIntersects()`, `neverIntersects()`,
`intersectsOnEqualOptions()`, `intersectsWhen(prédicat)` — et
`alsoIntersectsOtherTypes(règle, prédicat?)` pour l'intersection entre deux
*types* de contexte différents (une liste qui porte un résumé du détail) sont
documentées dans `packages/shared/README.md` et FEATURES §3.
`bootstrap/` n'a qu'un seul cas d'intersection croisée à démontrer et ne
l'exerce pas — s'il en fallait un exemple, ce serait celui de FEATURES §3
(la liste des topics de MQTTToolbox, périmée par un message sur n'importe
lequel).

### 1.3 Permissions

Une constante applicative, pas une donnée — comme le modèle ou les actions.
Le framework fournit son socle (`DAGDA_PERMISSIONS` : `users.manage`,
`roles.manage`, `settings.manage`) ; l'application ajoute le sien :

```ts
// bootstrap/shared/src/permissions.ts
export const APP_PERMISSIONS = {
    "notes.manage": {
        label: "Gérer les notes",
        description: "Créer, modifier ou supprimer une note sur un projet"
    }
} as const satisfies PermissionsDeclaration;

export type AppPermission = DagdaPermission | keyof typeof APP_PERMISSIONS;
```

`APP_PERMISSIONS` est passé une fois à chaque bout : `_permissions` du
constructeur d'`AbstractServerApp` côté serveur (§3.1) et `permissions` de
`DagdaClient.start()` côté client (§2.1) — c'est ce qui fait apparaître
« Gérer les notes » dans la matrice « Rôles » aux côtés des permissions du
framework. Les **rôles**, eux, restent une donnée créée par l'administrateur,
gérée depuis l'écran fourni par le framework (`packages/client`) — rien à
coder ici.

### 1.4 Notifications serveur → client

Les événements applicatifs, en plus de ceux déjà fournis (`contextChanged`,
`userInfoChanged`…) :

```ts
// bootstrap/shared/src/entities/events.ts
export type AppEvents = {
    /** Envoyé uniquement au propriétaire du projet (filtrage FEATURES §6) */
    noteAdded: {
        projectId: ProjectId;
        noteId: NoteId;
        text: string;
        totalNotes: number;
    };
}
```

Assemblés dans `services.ts` avec les événements du framework :

```ts
// bootstrap/shared/src/services.ts
export type AppNotifications = DagdaAppEvents<AppContexts> & AppEvents;
```

`DagdaAppEvents<Contexts>`, pas le plus générique `DagdaEvents` : c'est lui
qui ajoute `contextChanged` avec le type de contexte de l'application — sans
ça, `AbstractServerApp._submit()` ne pourrait pas typer sa propre diffusion.
Émission réelle, filtrée par destinataire, en §3.1.

### 1.5 Routes client → serveur

Pour un appel serveur qui n'est pas un simple CRUD d'entité :

```ts
// bootstrap/shared/src/api.ts
export interface AppAPI extends APICollection {
    /** Nombre de projets possédés par le compte donné */
    countProjects: (params: { userId: UserId }) => number;
}
```

Une route peut être protégée par une permission **paramétrée** — une fonction
qui reçoit l'appelant *et* les arguments de l'appel, pas seulement une chaîne
(commit `610b842`, FEATURES §5). `countProjects` en est l'exemple réel :
n'importe quel compte authentifié peut l'appeler, mais seulement pour
demander son propre nombre de projets — pas celui de quelqu'un d'autre, ce
qu'une permission plate ne peut pas exprimer :

```ts
// bootstrap/server/src/app.ts
export function isOwnAccount(user: UserInfo, params: { userId: UserId }): boolean {
    return user.id === params.userId;
}
// ...
this.registerAPI("countProjects", (_options, params) => this._countProjects(params.userId), {
    permission: isOwnAccount
});
```

`RegisterAPIOptions.permission` accepte `string | PermissionCheck<Args>` —
`isOwnAccount` est testée isolément dans `bootstrap/server/src/app.spec.ts`,
en plus d'être exercée par la vraie route. **Les actions** (`registerAction`,
§1.7) acceptent exactement la même forme paramétrée, via le même type
`PermissionCheck` — ce n'est pas propre aux routes.

### 1.6 API externes

**Pas encore livré (tranche 6).** `RegisterAPIOptions.type` distingue déjà
`"internal"` (défaut), `"external"` et `"both"`, mais rien ne vérifie
aujourd'hui un jeton pour une visite venue d'en dehors du navigateur — la
valeur `"external"` est acceptée par le type sans changer aucun comportement
(FEATURES §5). Tant que le mécanisme de jeton n'existe pas, aucune route ne
doit s'en servir en pratique.

### 1.7 Actions de modification

Deux natures d'action, décidées (FEATURES §11.1) — à ne pas confondre :

1. **Une modification directe d'entités**, composée côté client dans la
   transaction optimiste déjà là (`EntitiesHandler.withTransaction`). C'est
   une **fonction de modèle** (`dagda.model.xxx(...)`, §2.7 côté client),
   pas une action serveur — elle ne quitte jamais le navigateur comme un
   appel réseau à elle seule. `bootstrap/client/src/model.ts`
   (`APP_MODEL_FUNCTIONS.createProject`) en est l'exemple : il crée un
   projet et sa première note dans une même transaction.
2. **Le déclenchement d'un processus serveur** — un vrai appel RPC
   (`registerAction`/`actionCall`), sous son propre espace `/actions/`,
   jamais confondu avec `/api` (dont la console ne doit rien montrer). Le
   premier paramètre reçu par le callback est le compte appelant, pas une
   transaction imposée : `bootstrap/` n'en déclare aucune de son cru — les
   seules actions qu'il exerce sont celles du framework (`DagdaActions` :
   gestion des comptes, préférences, paramètres). Pour la forme, celle du
   README de `server` :
   ```ts
   this.registerAction("archiveProject", async (user, projectId) => { /* ... */ },
       { permission: "projects.manage" });
   ```
   `registerAction()` journalise automatiquement chaque appel réussi dans le
   journal d'audit (FEATURES §11.7) — rien à faire pour ça.

**Test d'arbitrage entre les deux** (et entre une action et un simple
gestionnaire de clic) : *si l'utilisateur refait le même enchaînement depuis
la console, obtient-il un état valide ?* Si non, un invariant est caché et
doit descendre dans une fonction de modèle ou une action — jamais rester
dans l'écran (FEATURES §11.1 pour le détail complet).

### 1.8 `AppTypes` — assembler le contrat

Le point d'entrée que client et serveur importent tous les deux :

```ts
// bootstrap/shared/src/app/types.ts
export interface AppTypes extends BaseAppTypes {
    fieldTypes: AppFieldTypes;
    entities: AppEntityTypes;
    contexts: AppContexts;
    apis: SystemAPI & EntitiesAPI<AppContexts, AppEntityTypes> & AppAPI;
    // Sans cette ligne, le service de notification ne connaît que les
    // événements du framework, et noteAdded compile en `unknown`.
    events: AppNotifications;
    permissions: AppPermission;
}
```

`actions` n'est pas surchargé ici : `bootstrap` n'a pas d'action propre
(§1.7), et `BaseAppTypes["actions"]` par défaut suffit.

---

## 2. Partie *client*

### 2.1 Démarrer l'application (`DagdaClient.start`)

Une application ne câble **pas** les services de base : `log`, `entities` et
`notification` sont fournis par le framework (FEATURES §0). Elle ne déclare
que ce qui lui appartient :

```ts
// bootstrap/client/src/index.ts
DagdaClient.start<ClientAppTypes>({
    model: APP_MODEL,
    contextAdapter: APP_CONTEXT_ADAPTER,
    title: "Dagda",
    brand: { label: "Dagda", icon: "ph-wrench" },
    sections: {
        demo: { label: "Démonstration", icon: "ph-flask", order: 1 },
        data: { label: "Données", icon: "ph-folders", order: 2 }
    },
    pages: {
        hello: { title: "Hello", constructor: HelloPage, icon: "ph-hand-waving", menu: { section: "demo", order: 1 } },
        projects: { title: "Projets", constructor: ProjectsPage, icon: "ph-folder", menu: { section: "data", order: 1 } },
        // Pas de `menu` : atteignable, jamais listée (ouverte depuis une carte).
        projectDetail: { title: "Projet", constructor: ProjectDetailPage, icon: "ph-folder-open" }
    },
    // Fonctions de modèle (§1.7/§2.7) — reachable comme dagda.model.xxx(...).
    modelFunctions: APP_MODEL_FUNCTIONS,
    // Uniquement les permissions propres à l'app — DAGDA_PERMISSIONS est ajouté par le framework.
    permissions: APP_PERMISSIONS,
    buildDagda: (params) => {
        const instance = new ClientDagda<ClientAppTypes>(params);
        _setDagda(instance);
        return instance;
    }
});
```

`index.html` ne contient qu'un `<dagda-app></dagda-app>` : le framework
enregistre lui-même ses éléments personnalisés.

**Il n'y a plus de registre statique.** Le service ne se lit pas via
`Dagda.get("nom")` : `Dagda`/`ClientDagda`/`ServerDagda` sont des classes
ordinaires, exposant des champs `readonly` nommés (`dagda.entities`,
`dagda.log`, `dagda.notification`, `dagda.pages`, `dagda.auth`,
`dagda.users`, `dagda.preferences`, `dagda.themes`…), atteints via une
instance singleton exportée `dagda` (minuscule) et une promesse
`dagdaReady` qui se résout une fois l'instance construite (commit `349c3d4`,
« Services refactor: dagda is a constructed instance, not a static
registry » — ce refactor a remplacé le registre `Dagda.get`/`Dagda.init`/
`Dagda.loaded`/`Dagda.reset()` qu'un ancien état de ce guide décrivait encore,
et qui n'existe plus). Un composant construit avant que `DagdaClient.start()`
ait fini (un `<dagda-app>` posé dès le premier paint) attend `dagdaReady`
plutôt que de lire `dagda` tout de suite.

`buildDagda` est ce qui permet d'ajouter des **services applicatifs custom**
— voir §4. `bootstrap/client` n'en a aucun (`AppServerDagda` n'existe que
côté serveur), donc son `buildDagda` ne fait que construire un `ClientDagda`
typé — nécessaire quand même : c'est lui qui narrowe `entities.getHandler()`
sur le vrai `AppContexts` de l'application (voir le commentaire de
`bootstrap/client/src/dagda.ts`).

### 2.2 Pages

Chaque page dérive d'`AbstractPageElement` :

```ts
// bootstrap/client/src/pages/projects/projects.page.ts (extrait)
export class ProjectsPage extends AbstractPageElement {
    constructor() { super({ template }); }

    protected override async _refresh(): Promise<void> {
        const entities = dagda.entities;
        await entities.getHandler().fetch({ type: "projects", options: {} });
        const projects = entities.getHandler().getItems("projects");
        // ... rendu du DOM
    }
}
customElements.define("projects-page", ProjectsPage);
```

L'inscription au menu se fait au niveau de `DagdaClient.start({pages})`
(§2.1), pas sur la page elle-même : `menu: {section, order}` optionnel — une
page sans `menu` reste atteignable via `dagda.pages.setPage(...)`, juste pas
listée (c'est le cas de `projectDetail`, ouverte depuis une carte de
`ProjectsPage`). Le menu **filtre par permission** (`PageInfo.permission`) :
pas la peine de vérifier soi-même avant d'afficher une entrée — la
vérification serveur, elle, reste entière (FEATURES §11.2, une permission
côté menu n'est jamais le contrôle d'accès qui compte).

### 2.3 Composants

`AbstractWebComponent` fournit le cycle de vie (`_init` une fois, `_refresh`
à chaque changement) et deux décorateurs (`@Ref()`, `@Attribute()`) :

```ts
// bootstrap/client/src/components/project-card/project-card.component.ts (extrait)
export class ProjectCard extends AbstractWebComponent {
    @Ref() protected _title!: HTMLElement;
    @Ref() protected _status!: HTMLElement;
    @Ref("note-count") protected _noteCount!: HTMLElement;

    @Attribute<number>({ name: "project-id", marshaller: NumberMarshaller })
    public projectId!: number | null;

    constructor() { super({ template }); }

    protected override async _refresh(): Promise<void> {
        const id = this.projectId;
        const project = id == null ? undefined : dagda.entities.getHandler().getById("projects", id);
        this._title.textContent = project?.name ?? "Projet inconnu";
        // ...
    }
}
customElements.define("project-card", ProjectCard);
```

Poser `element.projectId = 42` déclenche `_refresh()` automatiquement. Le
composant **lit le cache**, il ne fetch jamais lui-même : c'est la page qui a
déjà chargé le contexte (`projects` ou `project`) qui le place — la même
séparation que pour `_refresh()` d'une page.

### 2.4 Formulaires générés

`<dagda-form>` rend un éditeur par champ (texte, nombre, booléen, énumération
— les éditeurs par défaut sont déjà enregistrés par le framework, une
application ne déclare que ses surcharges, voir `packages/client/README.md`) :

```ts
// bootstrap/client/src/pages/projects/projects.page.ts (extrait)
const TEXT_TYPE = EntitiesModel.type({ rawType: JSTypes.string });

protected _formFields(): FormFieldDeclaration[] {
    return [
        { key: "name", type: TEXT_TYPE, label: "Nom du projet", required: true },
        { key: "note", type: TEXT_TYPE, label: "Première note", required: true }
    ];
}

protected override async _init(): Promise<void> {
    this._form.setFields(this._formFields());
    this._form.addEventListener("dagda-form-submit", (event) => {
        const values = (event as CustomEvent<FormSubmitDetail>).detail.values;
        this._createProject(values).catch(/* ... */);
    });
}
```

`<dagda-form>` valide au submit et émet l'événement — il n'écrit jamais
lui-même la valeur quelque part : au consommateur (ici, `_createProject`)
d'appeler une fonction de modèle ou une action avec les valeurs collectées.

### 2.5 Thèmes

Livrés (ROADMAP tranches 1 et 4) : `dagda-ui.css` (vocabulaire de classes) et
plusieurs thèmes standard (`DAGDA_THEMES`), bascule par préférence
utilisateur, miroir local anti-flash. `bootstrap/` ne surcharge rien : il
n'appelle pas `themes` dans `DagdaClient.start()` et reçoit donc la liste par
défaut du framework. Le détail (jetons, polices, icônes, lint d'adhérence)
est dans `packages/client/src/styles/README.md`, référence en la matière —
pas repris ici.

### 2.6 Notifications et messages côté client

L'abonnement à un événement applicatif se fait **une fois**, au bootstrap —
pas dans une page, dont une nouvelle instance est créée à chaque visite sans
mécanisme de désabonnement :

```ts
// bootstrap/client/src/index.ts (suite du .then())
dagda.notification.on("noteAdded", (event) => {
    showToast(`Note ajoutée : « ${event.data.text} » (${event.data.totalNotes} au total)`, "info");
    dagda.pages.refresh().catch(dagda.log.handleError);
});
```

Le serveur ne diffuse `noteAdded` qu'au propriétaire du projet (§3.1) : rien
à refiltrer ici. `showToast(message, "success" | "info" | ...)` et
`openDialog({title, body, actions})` sont les deux mécanismes fournis pour
parler à l'utilisateur — détaillés dans `packages/client/README.md`.

### 2.7 Fonctions de modèle (`dagda.model`)

Reachable comme `dagda.model.xxx(...)`, déclarées via `modelFunctions` de
`DagdaClient.start()` (§2.1) — à ne pas confondre avec les *actions* serveur
(§1.7) : une fonction de modèle ne quitte jamais le navigateur comme un appel
réseau à elle seule, elle compose une transaction optimiste existante. C'est
la réponse à l'exigence EurekAI du ROADMAP (id temporaire réutilisé **dans la
même transaction**) :

```ts
// bootstrap/client/src/model.ts
export const APP_MODEL_FUNCTIONS: AppModel = {
    createProject: {
        description: "Crée un projet et sa première note, dans une même transaction",
        fn: (tr: AppTransaction, userId: UserId, name: string, noteText: string) => {
            const project: ProjectEntity = { id: asNamed(0), name: asNamed(name), description: asNamed(""), userId, status: asNamed(PROJECT_STATUS.values.ACTIVE) };
            tr.insert("projects", project);

            const note: NoteEntity = { id: asNamed(0), projectId: project.id, text: asNamed(noteText) }; // id temporaire du projet, réutilisé tel quel
            tr.insert("notes", note);

            return { project, note };
        }
    }
};
```

Appelée sans transaction explicite (`dagda.model.createProject(userId, ...)`),
elle ouvre, soumet et attend sa propre transaction (`encapsulate()`). Appelée
avec une transaction en premier argument, elle compose dans une transaction
plus large. `bootstrap/client/src/model.spec.ts` prouve le remapping d'id
côté client, en miroir du test serveur équivalent (§3.1).

---

## 3. Partie *serveur*

### 3.1 `ServerApp` — répondre aux contextes et vérifier les écritures

Deux méthodes que toute application implémente : `_fetch` (obligatoire) et,
si besoin, `_submit` (une implémentation par défaut existe déjà — appliquer
la transaction telle quelle et diffuser `contextChanged`) :

```ts
// bootstrap/server/src/app.ts
export class ServerApp extends AbstractServerApp<AppTypes> {

    protected override async _fetch(context: AppContexts, request: RequestOptions): Promise<Data<AppEntityTypes>> {
        const result: Data<AppEntityTypes> = {};
        switch (context.type) {
            case "projects": {
                const userId = this._getUserId(request);
                result.projects = await this._db.all(`SELECT * FROM ${PROJECTS} WHERE "userId" = $1`, userId);
                break;
            }
            case "project": {
                const userId = this._getUserId(request);
                result.projects = await this._db.all(`SELECT * FROM ${PROJECTS} WHERE "id" = $1 AND "userId" = $2`, context.options.projectId, userId);
                // Un contexte à options porte ses lignes filles avec lui — un
                // aller-retour au lieu de deux.
                result.notes = await this._db.all(`SELECT * FROM ${NOTES} WHERE "projectId" = $1`, context.options.projectId);
            }
        }
        return result;
    }

    protected override async _submit(transactionData: SQLTransactionData<AppEntityTypes, AppContexts>, request: RequestOptions): Promise<SQLTransactionResult> {
        // Vérification de permission avant l'écriture (FEATURES §7.1) :
        if (request.type === "client") {
            for (const operation of transactionData.operations) {
                if (operation.options.table === "notes") {
                    this._requirePermission(request.user, "notes.manage");
                }
            }
        }

        const result = await super._submit(transactionData, request);

        // Diffusion filtrée (FEATURES §6) : seul le propriétaire du projet
        // apprend qu'une note lui a été ajoutée.
        for (const operation of transactionData.operations) {
            if (operation.type === OperationType.INSERT && operation.options.table === "notes") {
                const note = operation.options.item as AppEntityTypes["notes"];
                const project = await this._db.get<{ userId: UserId }>(`SELECT "userId" FROM ${PROJECTS} WHERE "id" = $1`, note.projectId);
                if (project != null) {
                    const noteId = _getUpdatedId(result, note.id) as NoteId;
                    const totalNotes = await dagda.notes.countForProject(note.projectId);
                    this.broadcast("noteAdded", { projectId: note.projectId, noteId, text: note.text, totalNotes },
                        (user) => user.id === project.userId);
                }
            }
        }
        return result;
    }
}
```

Points réels à retenir :

- **Il n'y a pas de `_isUserValid(profile)` à implémenter.** L'authentification
  n'est plus déléguée à un profil OAuth à valider (l'ancienne stratégie
  Google a été retirée, FEATURES §7) : les comptes sont locaux, créés sur
  invitation, et `AbstractServerApp` n'a plus cette méthode du tout — une
  application n'a rien à écrire pour ça.
- `request.type === "client"` porte toujours `request.user` ; `"server"`
  signifie une écriture faite par le serveur lui-même (une action, une
  migration) — pas de compte à vérifier.
- `super._submit()` applique la transaction, journalise l'audit et diffuse
  `contextChanged` — l'application n'a à écrire que ce qui est *en plus*
  (permission, notification propre).
- `dagda.notes` est le service applicatif custom introduit en §4 — la note
  compte réelle du projet, pas une valeur constante.

### 3.2 Migrations

Seul mode d'évolution du schéma (pas de synchronisation automatique depuis le
modèle) :

```ts
// bootstrap/server/src/migrations.ts
export const APP_MIGRATIONS: Migration[] = [
    { id: "0001-initial-schema", up: async (tools) => { await tools.createAllTables(); } },
    { id: "0002-drop-users-table", up: async (tools) => { await tools.run(`DROP TABLE IF EXISTS "data_users"`); } },
    {
        id: "0003-add-notes-table",
        up: async (tools) => {
            // IF NOT EXISTS, pas tools.createTable() : "0001" a déjà créé
            // "notes" sur une base neuve, puisqu'il lit le modèle *actuel*.
            await tools.run(getCreateTableStatement(APP_MODEL, "notes", { ifNotExists: true }));
        }
    }
];
```

`tools.createAllTables()`/`tools.createTable(name)` dérivent le DDL du
modèle ; `tools.run(...)` couvre le reste (`DROP`, `ALTER`, backfill). Un id
est enregistré une fois appliqué : jamais renommé, jamais inséré avant un id
déjà publié — piège concret illustré par `0003` ci-dessus (une migration
écrite après que le modèle a changé doit composer avec les bases qui l'ont
déjà, ou pas encore, vu passer).

`_migrations()` est surchargée dans `ServerApp` ; `main.ts` construit
l'application et appelle `app.listen()`, qui applique les migrations du
framework puis les siennes, vérifie la cohérence modèle ↔ schéma, puis écoute.

### 3.3 Routes applicatives

`registerAPI`/`registerAction`, avec permission simple ou paramétrée (§1.5) :

```ts
// bootstrap/server/src/app.ts
protected _registerAppAPI(): void {
    this.registerAPI("countProjects", (_options, params) => this._countProjects(params.userId), {
        permission: isOwnAccount
    });
}
```

### 3.4 Paramètres système

**Tout réglage lu uniquement côté serveur** (mot de passe de service, jeton
tiers) — jamais une entité, une entité étant lisible depuis la console par
quiconque charge son contexte (FEATURES §11.5, §11.2). Livré depuis les
tranches 1 (mécanisme) et 3 (écran d'édition, `settings.manage`).
`bootstrap/` n'en déclare aucun ; la syntaxe réelle, à reprendre si un
réglage serveur en a besoin :

```ts
// shared/src/settings.ts (à créer, absent de bootstrap/)
export const APP_SETTINGS = new SettingsModel({
    mqttBrokerUrl:      { type: JSTypes.string, label: "URL du broker",      default: "" },
    mqttBrokerPassword: { type: JSTypes.string, label: "Mot de passe",       default: "", visibility: SettingVisibility.server, secret: true },
    instanceTitle:      { type: JSTypes.string, label: "Titre de l'instance", default: "", visibility: SettingVisibility.client },
});
```

Passé au constructeur d'`AbstractServerApp` (`_settingsModel`, quatrième
paramètre positionnel) et à `DagdaClient.start({settings})` pour que
`SettingsPage` (fournie par le framework) sache l'éditer. Réagir à chaud à un
changement : `app.settings.on("mqttBrokerUrl", (value) => reconnectBroker(value))`.

Les **préférences utilisateur** (FEATURES §11.6, `PreferencesModel`) suivent
la même idée pour une valeur propre à un compte (le thème en est le seul
usage aujourd'hui) — pas de niveaux de visibilité ni de secret, puisqu'un
utilisateur est seul à lire et écrire la sienne.

### 3.5 Hooks sur modification de données

**Pas encore livré (tranche 6).** FEATURES §3 décrit un point d'accroche
générique déclenché par une transaction (`onWrite` ou équivalent) ; il
n'existe pas dans le code aujourd'hui — aucune méthode de ce nom sur
`AbstractServerApp` ou `EntitiesHandler`. Le besoin équivalent se couvre
aujourd'hui à la main, en surchargeant `_submit()` soi-même : c'est
exactement ce que fait `ServerApp._submit()` en §3.1 pour diffuser
`noteAdded` après une insertion sur `notes` — le même point d'ancrage,
écrit une fois par application plutôt que fourni par le framework.

---

## 4. Services applicatifs custom (FEATURES §9)

Le mécanisme existe depuis le refactor de juillet (« dagda is a constructed
instance, not a static registry ») ; ce qui manquait était la documentation
— c'est l'objet de cette section (ROADMAP, backlog → tranche 5). Une
application qui a une capacité propre à exposer (connexion à un service
tiers, cache, compteur) l'ajoute comme **champ nommé** de son propre
`Dagda`, pas comme entrée d'un dictionnaire — la liste des services d'une
application est constante, donc autant la typer.

### 4.1 Côté serveur — `ServerDagda` + `_buildDagda()`

`bootstrap/` a un vrai exemple, volontairement trivial : `dagda.notes`, un
compteur de notes par projet.

```ts
// bootstrap/server/src/notes.service.ts
export class NotesService {
    constructor(protected _db: PGRunner) { }
    public async countForProject(projectId: ProjectId): Promise<number> {
        const row = await this._db.get<{ count: string }>(`SELECT COUNT(*)::text AS "count" FROM ${NOTES} WHERE "projectId" = $1`, projectId);
        return Number(row?.count ?? 0);
    }
}
```

```ts
// bootstrap/server/src/dagda.ts
export class AppServerDagda extends ServerDagda<AppTypes> {
    public readonly notes: NotesService;
    constructor(params: BaseServicesParams<AppTypes> & ServerOwnServicesParams<{}> & { notes: NotesService }) {
        super(params);
        this.notes = params.notes;
    }
}

export let dagda: AppServerDagda;
export function _setDagda(instance: AppServerDagda): void { dagda = instance; }
```

`AbstractServerApp` construit cette instance via un point d'extension dédié,
`_buildDagda()` — une *méthode*, pas un paramètre de constructeur, parce
qu'une sous-classe appelle `super(...)` avant que `this` (donc `this._db`)
ne soit exploitable :

```ts
// bootstrap/server/src/app.ts
protected override _buildDagda(params: BaseServicesParams<AppTypes> & ServerOwnServicesParams<{}>): AppServerDagda {
    const instance = new AppServerDagda({ ...params, notes: new NotesService(this._db) });
    _setDagda(instance);
    return instance;
}
```

Reste par la suite accessible partout côté serveur comme `dagda.notes` (voir
`ServerApp._submit()`, §3.1) — jamais threadé à la main dans des constructeurs.

### 4.2 Côté client — `buildDagda` de `DagdaClient.start()`

Même idée, mais un **paramètre** cette fois (pas de contrainte d'ordre côté
client : `DagdaClient.start()` est une fonction, pas un constructeur de
sous-classe) :

```ts
// client/src/index.ts — une application AVEC un service propre (pas bootstrap/)
class AppDagda extends ClientDagda<ClientAppTypes> {
    public readonly mqtt: MqttService;
    constructor(params: BaseServicesParams<ClientAppTypes> & ClientOwnServicesParams<ClientAppTypes> & { mqtt: MqttService }) {
        super(params);
        this.mqtt = params.mqtt;
    }
}

DagdaClient.start<ClientAppTypes>({
    // ...
    buildDagda: (params) => {
        const instance = new AppDagda({ ...params, mqtt: new MqttService() });
        _setDagda(instance);
        return instance;
    }
});
```

`bootstrap/client` n'a **aucun** service propre : son `buildDagda`
(`bootstrap/client/src/index.ts`) ne fait que construire un `ClientDagda`
narrowé sur `ClientAppTypes`, sans champ ajouté — c'est le cas minimal, à
distinguer du cas avec service ci-dessus (voir le commentaire de
`bootstrap/client/src/dagda.ts` pour l'explication du narrowing). Omis, `
DagdaClient.start()` construit un `ClientDagda<AppTypes>` par défaut.

---

## 5. Ce qu'une application déclare — le contrat de FEATURES §12

Le contrat vérifié à chaque tranche du ROADMAP, formalisé ici avec le
fichier réel de `bootstrap/` qui illustre chaque ligne.

**Partie *shared*** (`bootstrap/shared/src/`) :

| Élément du contrat | Fichier |
|---|---|
| Types de champs + modèle des entités métier (§1.1) | `entities/model.ts` (`APP_MODEL`) |
| Types de contextes + intersection par type (§1.2) | `entities/contexts.ts` (`AppContexts`, `APP_CONTEXT_ADAPTER`) |
| Permissions applicatives (§1.3) | `permissions.ts` (`APP_PERMISSIONS`) |
| Notifications serveur → client (§1.4) | `entities/events.ts` (`AppEvents`), assemblées dans `services.ts` |
| Routes client → serveur, dont une à permission paramétrée (§1.5) | `api.ts` (`AppAPI`) |
| API externes (§1.6) | pas encore livré (tranche 6) |
| Actions de modification (§1.7) | fonctions de modèle : `client/src/model.ts` ; actions serveur : aucune dans `bootstrap/` (voir §1.7) |
| Assemblage (§1.8) | `app/types.ts` (`AppTypes`) |

**Partie *client*** (`bootstrap/client/src/`) :

| Élément du contrat | Fichier |
|---|---|
| Pages, dérivant d'`AbstractPageElement`, position menu optionnelle | `pages/*/*.page.ts`, déclarées dans `index.ts` |
| Composants propres | `components/project-card/project-card.component.ts` |
| Fonctions de modèle (`dagda.model.xxx`) | `model.ts` (`APP_MODEL_FUNCTIONS`), déclarées via `modelFunctions` |
| Liste des thèmes retenus | aucune dans `bootstrap/` — reçoit `DAGDA_THEMES` par défaut (§2.5) |
| Service applicatif custom (§9) | aucun dans `bootstrap/client` — `buildDagda` s'y limite au narrowing de type (§4.2) |

**Partie *serveur*** (`bootstrap/server/src/`) :

| Élément du contrat | Fichier |
|---|---|
| `_fetch` par contexte | `app.ts` (`ServerApp._fetch`) |
| `_submit` : vérification de permission + diffusion filtrée | `app.ts` (`ServerApp._submit`) |
| Migrations applicatives | `migrations.ts` (`APP_MIGRATIONS`) |
| Routes applicatives (`registerAPI`) | `app.ts` (`_registerAppAPI`) |
| Service applicatif custom (§9) | `dagda.ts` (`AppServerDagda`) + `notes.service.ts`, câblés par `_buildDagda()` |
| Hooks sur modifications | pas encore livré (tranche 6) — couvert à la main dans `_submit()` (§3.5) |

> FEATURES.md §12 ne mentionne aujourd'hui ni les services applicatifs custom
> (§9) ni les paramètres système (§11.5) dans son propre récapitulatif — ce
> tableau-ci est plus complet que celui de FEATURES.md sur ces deux points.
> Signalé dans le rapport de cette tranche plutôt que corrigé sur place
> (FEATURES.md n'est pas dans le périmètre de cette mission).

---

## 6. Checklist chronologique — de `bootstrap/` à l'app

L'ordre dans lequel `bootstrap/` a effectivement été construit, tranche après
tranche, plutôt qu'un ordre arbitraire :

1. Copier `bootstrap/{shared,client,server}`, renommer le scope npm
   (`@dagda-app/*`) et les imports.
2. **Shared** : modèle d'entités (§1.1) et contextes (§1.2) — le minimum pour
   que quelque chose se charge.
3. **Shared** : `AppTypes` (§1.8), avec au moins `fieldTypes`/`entities`/
   `contexts`/`apis` — c'est ce que client et serveur importent tous les
   deux dès l'étape suivante.
4. **Serveur** : `ServerApp extends AbstractServerApp<AppTypes>`, implémenter
   `_fetch` par contexte (§3.1) ; `main.ts` pour démarrer.
5. **Serveur** : première migration (§3.2) — `tools.createAllTables()` crée
   tout le modèle déclaré à l'instant `t`.
6. **Client** : `DagdaClient.start({model, contextAdapter, pages})` (§2.1) et
   une première page qui fetch et affiche (§2.2).
7. Écrire : brancher une transaction pour la première écriture, décider
   fonction de modèle (§2.7) vs code inline dans l'écran — c'est le moment où
   se fixe la frontière (§1.7), mieux vaut tôt qu'après plusieurs écrans.
8. Notifications applicatives (§1.4) dès qu'un événement métier doit être
   poussé, avec l'abonnement côté client une fois pour toutes au bootstrap
   (§2.6).
9. Permissions applicatives (§1.3) dès qu'un écran ou une écriture doit être
   restreint ; la vérification qui compte est côté serveur, dans `_submit`
   ou l'action concernée (§3.1).
10. Routes applicatives hors CRUD (§1.5/§3.3), simples ou à permission
    paramétrée selon le besoin (« puis-je agir sur mes propres données » →
    `isOwnAccount` est le patron).
11. Composants propres si un motif se répète entre plusieurs écrans (§2.3) ;
    formulaire généré (`<dagda-form>`, §2.4) dès qu'un écran édite plusieurs
    champs.
12. Service applicatif custom (§4) dès qu'une capacité mérite d'être injectée
    plutôt qu'appelée en ligne partout où elle sert.
13. Paramètres système (§3.4) dès qu'un réglage serveur ne doit pas transiter
    par le cache client.
14. Automatiser / exposer à l'extérieur — API externes et jetons, hooks sur
    modification de données : pas encore livrés (tranche 6), à traiter
    seulement si le besoin apparaît.

---

## 7. Ce qui n'a jamais à être écrit par l'application

Détail exhaustif dans les README de chaque paquet — ici, la synthèse :

- **Comptes, rôles, paramètres, préférences, journal d'audit** : tables et
  migrations `system_*`, authentification locale complète (hachage,
  invitation, réinitialisation), les ~14 actions standard associées
  (`packages/server/README.md`).
- **Coquille SPA** : menu, navigation (paysage et portrait), dialogues,
  toasts, indicateur de statut, badge de compte — tout `<dagda-app>`
  (`packages/client/README.md`, `specs/navigation.md`).
- **Quatre écrans d'administration fournis d'office** : Préférences,
  Utilisateurs, Rôles, Paramètres — remplaçables un par un en déclarant une
  page sous la même clé (`packages/client/README.md`).
- **Feuille de style, thèmes standard, icônes** : `dagda-ui.css`, Phosphor,
  lint d'adhérence (`packages/client/src/styles/README.md`).
- **Console `window.dagda`** et, une fois livré, l'éditeur de scripts
  TypeScript (pas encore livré, tranche 5 bis).
- **Le cache synchrone, les transactions optimistes, le remapping d'ids
  temporaires** : tout `EntitiesHandler` (`packages/shared/README.md`).

Ce qui reste spécifique à chaque application suit les patrons ci-dessus :
modèle métier, écrans, permissions, actions, service applicatif custom.
