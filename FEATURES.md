# Dagda — Liste des fonctionnalités

> Premier jet. Dagda est un framework full-stack TypeScript de prototypage
> (client + serveur + code partagé), pensé pour être minimaliste, typé de bout
> en bout et sans dépendance à un gros framework front.
>
> Légende des colonnes `v1` / `v2` :
> - `v1` : version utilisée par EurekAI (`eurekai/dagda/*`)
> - `v2` : ré-écriture en cours (`dagda/packages/*`)
> - ✅ présent · ⚠️ partiel / à revoir · ❌ absent
>
> Légende des préfixes :
> - **NEW** — à faire / envisagé, absent des deux versions
> - **ÉCARTÉ** — décision prise de ne pas le faire (conservé pour garder la trace)

---

## 0. Partis pris

Décisions structurantes qui expliquent plusieurs choix ci-dessous :

- **PostgreSQL est le seul back-end de persistance.** Pas de SQLite, pas de
  stockage fichier. Toute application Dagda nécessite donc une base Postgres,
  y compris pour un petit déploiement.
- **Le client est toujours connecté.** Le cache client n'est qu'une vue
  *partielle* des données ; il n'est ni persisté ni utilisable hors ligne.
- **En cas d'échec d'écriture, on invalide et on recharge.** Pas de résolution
  de conflit : la stratégie assumée est de repartir de l'état serveur.
- **L'authentification est obligatoire.** Pas de mode « application ouverte ».
- **Minimum de dépendances vers des librairies externes.** Toute proposition
  d'ajout d'une nouvelle dépendance (client, serveur ou build) doit être
  soumise et validée avant intégration — jamais ajoutée de sa propre initiative.
- **Les services de base sont autonomes.** Toute application Dagda les reçoit en
  état de marche. Ils sont paramétrables par l'application, mais ne réclament
  d'elle aucun code pour fonctionner.
- **Authentification locale uniquement.** Comptes gérés par le framework, sans
  fournisseur externe.

### Hors périmètre du framework

- **Internationalisation.**
- **Authentification autre que locale** (OAuth, LDAP, SSO…).
- **Autre base de données que PostgreSQL.**

## 1. Structure & outillage

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| Monorepo npm workspaces (`shared` / `client` / `server` / `build`) | ✅ | ✅ | v2 sépare `packages/*` (framework) et `bootstrap/*` (app d'exemple) |
| Configs TypeScript partagées (`tsconfig-base/client/server`) | ✅ | ✅ | package `@dagda/build` |
| Configs webpack partagées (client & serveur) | ✅ | ✅ | bundle unique `main.js` par app |
| Résolution des alias de paths (`tsconfig-paths-webpack-plugin`) | ✅ | ✅ | |
| Application « bootstrap » servant d'exemple et de banc de test | ❌ | ✅ | `bootstrap/{client,server,shared}` |
| Tests unitaires (mocha) | ✅ | ✅ | couverture partielle : `model`, `handler` — **à migrer vers Vitest** |
| Génération de la config VSCode (launch / tasks) | ✅ | ✅ | |
| **NEW** — Mécanisme de tests fourni aux applications, pas seulement au framework | | | trois cibles : `shared`, `server`, et `client` avec DOM virtuel |
| **NEW** — ↳ Interface web de lancement et de suivi des tests | | | |
| **NEW** — Générateur de projet (`npm create dagda`) | | | scaffolding d'une app à partir du bootstrap |
| **NEW** — Documentation (README par package, guide de démarrage) | | | actuellement quasi inexistante |
| **NEW** — Build en mode watch / hot reload confortable | | | |
| **NEW** — `docker-compose` de développement (app + Postgres) | | | conséquence du choix « Postgres uniquement » |

## 2. Modèle d'entités (le cœur du framework)

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| Déclaration déclarative du modèle (`EntitiesModel`) : types + tables | ✅ | ✅ | typage complet dérivé de la déclaration |
| Types nommés / « branded types » (`Named`, `asNamed`) | ✅ | ✅ | évite de confondre `ProjectId` et `PromptId` |
| Types JS de base + types custom (`JSTypes`) | ✅ | ✅ | `number`, `string`, `boolean`, `custom` |
| Clés étrangères déclarées (`foreignTable`) | ✅ | ✅ | |
| Champs optionnels, champ identité | ✅ | ✅ | |
| Génération du DDL / des noms de tables & colonnes quotés | ✅ | ✅ | `qt()` / `qf()` |
| **NEW** — **Migrations de schéma versionnées, seul mode d'évolution** | | | pas de synchronisation automatique depuis le modèle : un renommage de champ deviendrait une suppression suivie d'une création, donc une perte silencieuse. **Deux jeux distincts** : celles du framework et celles de l'application (§11.4) |
| **NEW** — Validation runtime des entités | | ✅ | `getEntityErrors()` / `validateEntity()`, exposés par le modèle mais **jamais appelés automatiquement** : le branchement sur le chemin critique est un arbitrage de performance de l'application |
| **NEW** — Type `USER_ID` applicatif + clé étrangère réelle vers `system_users` | | ✅ | `FieldDefinition.referencesUsers`, distinct de `foreignTable` qui reste interne au modèle d'une application ; lu par `getCreateTableStatement` pour émettre `REFERENCES system_users(id) ON DELETE SET NULL`, seul pont entre les données internes de Dagda et le modèle métier (§11.4) |
| **NEW** — **Énumérations déclaratives**, en remplacement des `enum` TypeScript | | ✅ | triplet `<uid, valeur (entier ou chaîne), libellé>` via `EntitiesModel.enum()`. Le libellé rend l'affichage et les formulaires (§8.1) automatiques, ce qu'un `enum` TS ne permet pas — il faut aujourd'hui une table de correspondance à la main dans chaque écran. La valeur persistée est toujours choisie explicitement, jamais dérivée de l'ordre de déclaration |
| **NEW** — **Champs JSON** | | | contenu libre, à charge pour le développeur qu'il soit sérialisable par PostgreSQL |
| **NEW** — Séparation des tables par préfixe : `system_` (framework) et `data_` (métier) | | | rend la frontière du §11.4 visible jusque dans le schéma |
| **NEW** — ↳ Tables `system_` : migrations **livrées avec le framework**, appliquées automatiquement | | | l'application n'a rien à faire pour disposer des comptes, rôles, paramètres et préférences |
| **NEW** — ↳ Tables `data_` : migrations **écrites par le développeur** de l'application | | | |
| **NEW** — ↳ Contrôle de cohérence entre le modèle déclaré et le schéma réel au démarrage | | | garde-fou de la décision « migrations seules » : sans lui, une migration oubliée ne se manifeste que par une erreur SQL à l'exécution, souvent loin de la cause |

## 3. Cache & synchronisation client/serveur

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| `EntitiesHandler` : cache local par table, accès **synchrone** | ✅ | ✅ | l'essentiel de la valeur du framework |
| Notion de « contexte » de chargement (fetch par contexte typé) | ✅ | ✅ | v2 : `ContextAdapter` (`contextEquals` + `contextIntersects`) |
| Chargement incrémental / fusion dans le cache | ✅ | ✅ | |
| Invalidation ciblée du cache (contexte *dirty*) | ⚠️ | ✅ | v2 gère l'intersection de contextes et la notion de contexte *actif* |
| Transactions optimistes (`withTransaction`) | ✅ | ✅ | insert / update / delete, appliqués localement puis envoyés |
| Ids temporaires côté client + remapping après réponse serveur | ✅ | ✅ | `getUpdatedId`, `isSameId` |
| File d'attente de soumission (sérialisation des transactions) | ✅ | ✅ | `Queue`, `waitForSubmit()` |
| Événements d'état (`downloading` / `uploading` / `dirty`) | ✅ | ✅ | pour l'indicateur de statut UI |
| Broadcast automatique du changement de contexte aux autres clients | ✅ | ✅ | |
| Handler utilisable côté serveur (un handler par requête) | ✅ | ✅ | même API que côté client |
| Adapter de test en mémoire | ✅ | ✅ | `test.adapters.ts` |
| Invalidation totale du cache en cas d'échec de submit | ✅ | ✅ | **comportement assumé**, pas un manque |
| **NEW** — Rendre l'échec de submit visible pour l'utilisateur | | | aujourd'hui : `console.error` + cache *dirty*, l'utilisateur ne voit rien |
| **NEW** — **Hooks sur les modifications de données** | | | point d'accroche serveur déclenché par une transaction. C'est ce sur quoi reposeront les déclencheurs « sur changement » des automatismes MQTTToolbox |
| **NEW** — Fonctions d'intersection de contextes prêtes à l'emploi | | ✅ | `alwaysIntersects()`, `neverIntersects()`, `intersectsOnEqualOptions()`, plus `intersectsWhen()` pour le reste — évite que chaque application réécrive le cas courant |
| **NEW** — ↳ Une fonction d'intersection par type de contexte | | ✅ | `buildContextAdapter({ type: règle, ... })` assemble le `ContextAdapter` global à partir d'une règle par type |
| **NEW** — ↳ Intersection **entre types de contexte différents** | | ✅ | `alsoIntersectsOtherTypes(règle, prédicat?)`, facultatif : sans lui deux types différents ne se recouvrent pas. Les deux règles sont interrogées et `true` l'emporte, donc la relation se déclare d'un seul côté et reste symétrique. Cas central de MQTTToolbox : la liste des topics porte `lastMessageAt`, un message sur un topic la périme — et l'écriture vient du serveur, pas d'un client qui aurait la liste dans ses contextes actifs |
| **ÉCARTÉ** — Résolution de conflits | | | on invalide et on recharge |
| **ÉCARTÉ** — Persistance du cache client (IndexedDB / offline) | | | le cache n'est qu'une vue partielle des données, le mode hors ligne n'a pas de sens |
| **ÉCARTÉ** — Cache et logique client déportés dans un (Shared)Worker | | | une frontière worker est asynchrone : elle briserait l'accès **synchrone** au cache, qui est la principale valeur du framework. La synchro multi-fenêtres, seul gain fonctionnel, est déjà largement couverte par le broadcast `contextChanged` (§6) — et n'est pas un besoin identifié. Coûts écartés : partition du bundle applicatif, refonte de `withTransaction` (un callback ne traverse pas `postMessage`), ids temporaires, contextes actifs par fenêtre |

## 4. Accès base de données (serveur)

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| Abstraction `AbstractSQLRunner` (`run` / `get` / `all` / `insert`) | ✅ | ✅ | |
| Implémentation PostgreSQL | ✅ | ✅ | pool + `withReservedConnection` |
| Transactions SQL réelles côté serveur | ✅ | ✅ | |
| Statistiques de base au démarrage (taille des bases) | ❌ | ✅ | |
| **ÉCARTÉ** — Implémentation SQLite | ✅ | ❌ | présente en v1, **supprimée volontairement** en v2 |
| **ÉCARTÉ** — Back-end non-SQL (fichier JSON) pour le prototypage | | | |

> **Décidé** : l'abstraction `AbstractSQLRunner` ne sert plus qu'aux tests (adapter
> en mémoire, §3). Elle reste en place à ce titre, mais il n'est plus utile de la
> concevoir pour accueillir d'autres moteurs : le code applicatif peut assumer
> PostgreSQL (SQL spécifique, types natifs, `RETURNING`…) sans chercher la portabilité.

## 5. Routes internes & API externe

> Deux surfaces distinctes, déclarées séparément dans la partie *shared* :
> les **routes** appelées par le client de l'application, et les **API externes**
> appelées par un tiers muni d'un jeton. Même mécanique de déclaration typée, deux
> modes d'authentification.

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| Déclaration d'API par un simple type TS (`APICollection`) | ✅ | ✅ | signature partagée entre client et serveur |
| **NEW** — **Routes** client → serveur déclenchant une action serveur | | | |
| **NEW** — ↳ Protection de chaque route par les permissions de l'appelant | | ✅ | permission déclarée avec la route (`RegisterAPIOptions.permission`, `apiRegister`/`registerAPI`), évaluée sur les permissions résolues avant l'appel du callback (§7.1) |
| **NEW** — **API externes** déclarées à part des routes internes | | | ce qu'on expose à `curl` n'est pas ce qu'on expose à son propre client |
| `apiCall()` côté client / `apiRegister()` côté serveur | ✅ | ✅ | typage des arguments et du retour |
| API système intégrée (`getSystemInfo`, `triggerError`) | ✅ | ✅ | uptime, liste des erreurs non capturées |
| API entités intégrée (`fetch` / `submit`) | ✅ | ✅ | |
| Passage du contexte de requête (utilisateur, session) au handler | ⚠️ | ✅ | `RequestOptions` |
| **NEW** — Gestion homogène des erreurs API (codes, messages typés) | | | |
| **NEW** — Authentification par jeton pour les appels hors navigateur | | | besoin remonté par MQTTToolbox 2 (API `curl`-friendly) |
| **NEW** — ↳ Le jeton porte l'identité et les permissions de son propriétaire | | | un appel par jeton est traité **comme si l'utilisateur l'avait fait lui-même** — pas de portée réduite (cf. §7.1) |
| **NEW** — ↳ Écran de gestion des jetons | | | chacun voit et révoque les siens ; le super-admin voit ceux de tout le monde |

## 6. Notifications temps réel

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| WebSocket serveur greffé sur le serveur HTTP | ✅ | ✅ | |
| Événements typés (`events` dans les `AppTypes`) | ⚠️ | ✅ | v2 : typage centralisé |
| Broadcast serveur → tous les clients | ✅ | ✅ | |
| Reconnexion automatique côté client | ✅ | ✅ | |
| Notifications navigateur (Web Notification API) | ✅ | ⚠️ | dans EurekAI en v1, à remonter dans le framework |
| **NEW** — **Filtrage des notifications par utilisateur et par permissions** | | | aujourd'hui uniquement du broadcast global : tout client reçoit tout. Le filtre doit être appliqué **côté serveur** — filtrer à l'arrivée laisserait la donnée passer sur le fil |
| **NEW** — **Le serveur relaie tel quel ce qu'un client envoie** | ⚠️ | ⚠️ | constaté en tranche 1. `ServerNotificationImpl` réémet tout message reçu vers tous les autres clients **et** le rejoue dans ses propres écouteurs, sans vérifier ni l'émetteur ni le type. C'est le mécanisme dont dépend `contextChanged` pour la synchro multi-fenêtres (§3), donc il ne peut pas être simplement retiré — mais en l'état n'importe quel client injecte n'importe quel événement chez tous les autres. À traiter avec le filtrage ci-dessus |
| **NEW** — ↳ Corollaire : `broadcast()` **ne notifie rien localement** côté client | | ✅ | il écrit dans la socket. Un fait purement local (« voici le compte connecté ») ne passe donc pas par là : c'est ainsi que la pastille de compte est restée vide, et que l'identité du connecté partait vers tous les autres navigateurs. `AbstractNotificationHandler.notifyLocal()` (tranche 3, service `auth`) comble le manque : il fire l'événement dans ce process seul, sans jamais toucher le réseau — utilisé par `userInfoChanged`. Le filtrage par destinataire de `broadcast()` lui-même (ligne ci-dessus) reste entier |

## 7. Serveur applicatif & authentification

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| Serveur Express préconfiguré | ✅ | ✅ | v2 : classe `AbstractServerApp` qui assemble tout |
| Service de fichiers statiques (le client buildé) | ✅ | ✅ | |
| Lecture de la config depuis les variables d'environnement | ✅ | ✅ | `getEnvString` / `getEnvNumber` / `...Optional`, préfixe configurable. **Réservé à l'amorçage** (port, URL de base, connexion à la base) : le reste passe par les paramètres système (§11.5) |
| Session serveur | ✅ | ✅ | |
| Validation applicative de l'utilisateur (`_isUserValid`) | ✅ | ✅ | permet la liste blanche d'utilisateurs |
| **NEW** — **Comptes locaux, seul mode d'authentification** (compte + mot de passe) | | ✅ | plus de dépendance à un fournisseur externe |
| **ÉCARTÉ** — Stratégie Google OAuth2 | ✅ | ❌ | **retirée**. Impact réel : EurekAI authentifiait ses utilisateurs par Google (cf. tranche 8) |
| **ÉCARTÉ** — Point d'extension pour d'autres stratégies (`registerAuthStrategy`) | ❌ | ❌ | |
| **ÉCARTÉ** — Plusieurs stratégies actives simultanément | | ❌ | sans objet : il n'en reste qu'une |
| **ÉCARTÉ** — Un utilisateur rattaché à plusieurs méthodes de connexion | | ❌ | sans objet |
| **NEW** — ↳ Bénéfice : **`passport` disparaît entièrement**, pas seulement sa stratégie | | ✅ | quatre paquets sont sortis (`passport`, `passport-google-oauth20`, leurs `@types`). `initialize()` / `session()` / `serializeUser` / `authenticate()` sont remplacés par une vérification de mot de passe et un identifiant en session. `express-session` reste. `PassportProfile`, `_isUserValid(profile)`, `registerAuthStrategy`, `registerGoogleStrategy` et les variables `GOOGLE_*` ont disparu avec |
| **NEW** — ↳ stockage sécurisé des mots de passe (hachage + sel) | | ✅ | scrypt, `node:crypto` — aucune dépendance ajoutée (§0) |
| **NEW** — ↳ création de compte **sur invitation d'un administrateur uniquement** | | ✅ | pas d'inscription publique : aucun formulaire d'inscription exposé |
| **NEW** — ↳ mécanisme d'invitation (lien à usage unique, avec expiration) | | ✅ | `UserStore.invite()` / `acceptInvitation()`, routes `GET`/`POST /invite/:token`. Sept jours de validité |
| **NEW** — ↳ changement de mot de passe par l'utilisateur | | | `UserStore.changePassword()` existe côté serveur ; pas encore exposé au client (aucun écran « mes préférences ») |
| **NEW** — ↳ réinitialisation : par le même lien d'invitation, régénéré par l'administrateur | | ✅ | **décidé** : pas de service d'envoi de mail (§0), l'administrateur copie le lien à la main. `UserStore.reinvite()` : le mot de passe courant reste valide tant que le nouveau lien n'a pas été utilisé |
| **NEW** — Rôles & permissions | | ✅ | modèle détaillé en §7.1 — super-admin, matrice éditable et permissions résolues côté serveur, tous construits |
| **NEW** — Notion de propriétaire d'une entité + partage entre utilisateurs | | | besoin remonté par MQTTToolbox 2 (tableaux de bord) — se compose avec les permissions (§7.1), ne les remplace pas |
| **NEW** — Identité de l'utilisateur courant accessible côté serveur dans les écritures | | ✅ | chaque action reçoit le compte qui l'a appelée (§11.1) ; `_submit()` reçoit désormais aussi `request: RequestOptions` (comme `_fetch()`), avec `request.user` toujours défini côté client |
| **NEW** — Écran d'administration des utilisateurs et des rôles | | ✅ | matrice rôle × permission (écran « Rôles », §7.1) et écran « Utilisateurs » (inviter, réinviter/réinitialiser, activer/désactiver, attribuer un rôle depuis une liste déroulante) tous deux construits côté MQTTToolbox. L'invitation et la réinvitation ouvrent un dialogue avec le lien à copier — aucun service d'e-mail (§0), le lien n'a nulle part d'autre où aller |
| **NEW** — Comptes et préférences **internes au framework**, hors modèle d'entités | | ✅ | cf. §11.4 — exposés par action typée (§11.1), pas par le cache |
| **ÉCARTÉ** — Mode « sans authentification » (`NO_AUTH`) | ✅ | ⚠️ | présent en v1, à retirer |

### 7.1 Rôles & permissions — décidé

**La liste des permissions est une constante applicative, pas une donnée.**
Comme `APICollection` (§5) ou la collection d'actions (§11.1) : un type
TypeScript déclaré dans le code, partagé entre client et serveur, d'où
découlent l'autocomplétion et la vérification. Le framework fournit un socle
de permissions de base pour ses propres fonctionnalités (paramètres système
§11.5, gestion des utilisateurs et des rôles) ; l'application y ajoute les
siennes.

**Les rôles, eux, sont une donnée.** Créés librement par l'administrateur (nom
+ sous-ensemble de permissions), stockés côté framework au même titre que les
comptes (§11.4) — pas fixés dans le code, à l'inverse des permissions.

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| **NEW** — Matrice rôle × permission, éditable par l'administrateur | | ✅ | pour chaque rôle créé, cocher les fonctionnalités qui lui sont accessibles. `RoleStore` (données) + `DAGDA_PERMISSIONS` (constante applicative, `packages/shared/src/auth/permissions.ts`) + écran « Rôles » côté MQTTToolbox, assemblé à la main depuis les éditeurs du générateur de formulaires (§8.1) — un tableau à deux dimensions n'est pas ce que `<dagda-form>` rend |
| **NEW** — Un utilisateur porte **au plus un rôle** | | ✅ | pas de cumul : `permissions(utilisateur)` = permissions de son rôle, ou aucune. `system_users.roleId`, nullable, `ON DELETE SET NULL` |
| **NEW** — Rôle **super-admin** intégré au framework, tous droits implicites | | ✅ | dispensé de la matrice — un test dédié (`hasPermission()`) court-circuite toute vérification, sans énumérer ses permissions : `UserInfo.permissions` reste vide pour un super-admin |
| **NEW** — ↳ Attribué automatiquement au premier utilisateur créé (`admin` / `admin`) | | ✅ | bootstrap : avant qu'un compte existe, personne ne peut émettre d'invitation (§7) — ce premier compte échappe donc au parcours normal |
| **NEW** — Permissions de l'utilisateur résolues côté serveur, exposées en liste d'identifiants texte | | ✅ | ex. `["users.manage", "roles.manage"]` — c'est cette liste que lisent les fonctions serveur pour trancher un accès. Résolu à chaque requête (comme le reste du compte, §7), pas mis en cache — un rôle édité ou retiré prend effet immédiatement |
| **NEW** — Contexte de chargement / appel d'API contraignable par permission | | | généralise l'idée de « filtrage par utilisateur » : la même mécanique porte aussi bien une restriction de table entière qu'un filtre plus fin |
| **NEW** — Permissions transmises au client | | ✅ | pour masquer les parties d'interface inaccessibles — ne dispense jamais la vérification serveur (§11.2). `PageHandler.canAccess` vérifie `isSuperAdmin` puis `permissions.includes(...)` |
| **NEW** — Jeton d'API : mêmes permissions que son propriétaire | | | cf. §5 — pas de portée réduite pour un appel par jeton. Le mécanisme de jeton lui-même n'existe pas encore |

## 8. Client / UI

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| Injection automatique des `<head>` (meta, styles, manifest) | ❌ | ✅ | template Handlebars |
| Web components : classe de base `AbstractWebComponent` | ⚠️ | ✅ | v1 : composants ad-hoc dans l'app |
| Template HTML importé et injecté | ✅ | ✅ | `import template from "./x.html"` — le `require()` d'origine rendait les composants intestables hors bundle |
| Décorateur `@Ref()` : accès typé aux éléments par attribut `ref` | ❌ | ✅ | |
| Décorateur `@Attribute()` + marshallers : attributs typés | ❌ | ✅ | déclenche le refresh automatiquement |
| Cycle de vie `_init()` / `_refresh()` avec garde anti-réentrance | ❌ | ✅ | |
| Gestion des slots pour les enfants existants | ❌ | ✅ | |
| Système de pages / navigation (`PageHandler`, `AbstractPageElement`) | ⚠️ | ✅ | v1 : géré dans l'app EurekAI |
| **NEW** — SPA fournie clé en main : menu de navigation + zone de contenu | | ✅ | l'application n'écrit pas sa coquille. Disposition détaillée dans [`specs/navigation.md`](specs/navigation.md) (paysage/portrait × déployé/rétracté). **Paysage seul** (déployé + rétracté) : le portrait attend la tranche 4 |
| **NEW** — ↳ **Un seul `<dagda-app>` dans l'`index.html` de l'application** | | ✅ | il monte toute la coquille. Le framework enregistre ses propres éléments personnalisés : les imports « pour effet de bord » (`Navbar`, `PageContainer`, `EntitiesStatusComponent`) ont disparu des applications. Spec : `specs/navigation.md` §6.1 |
| **NEW** — ↳ Les pages dérivent d'`ApplicationPage` | | | |
| **NEW** — ↳ Inscription au menu **optionnelle**, avec hiérarchie par catégorie | | ✅ | `menu: { section, order, group }` sur la page, `sections` dans `DagdaClient.start()`. Une page sans `menu` reste atteignable par le service de navigation |
| **NEW** — ↳ Menu filtré par les permissions de l'utilisateur | | ⚠️ | conséquence de §7.1 : ne pas proposer ce qui sera refusé. Le filtrage est fait, et une section dont toutes les pages sont refusées disparaît entièrement — le rail rétracté ne montrant que des icônes, une icône seule annoncerait la section aussi sûrement qu'un libellé. Le prédicat se réduit pour l'instant au drapeau super-admin : la matrice rôles × permissions arrive en tranche 3 |
| Composant de statut (téléchargement / envoi / cache sale) | ✅ | ✅ | |
| Composant de navbar | ❌ | ✅ | |
| Composant de login | ❌ | ✅ | simplifié : un seul formulaire, comptes locaux (§7) |
| Composant conteneur | ❌ | ✅ | |
| **ÉCARTÉ** — Bootstrap 5 + bootstrap-icons | ✅ | ❌ | **retiré**, remplacé par Nocturne et Phosphor. Les quatre paquets sont sortis de l'arbre de dépendances, et le bundle client de l'app d'amorçage est passé de 4,4 Mo à 1,4 Mo |
| **NEW** — **Feuille de style unique du framework** (`dagda-ui.css`) || ✅ | **reprise de Nocturne**, pas réinventée : on hérite du vocabulaire de classes de Claude Design (`.btn`/`.btn-primary`/`.btn-ghost`, `.card`, `.input`, `.field`, `.nav`, `.table`, `.dialog`, `.tag`, `.seg`, `.elev-*`, `.text-muted`) et de ses règles, qui ne référencent que des `var()`. Remplace Bootstrap |
| **NEW** — **Thèmes interchangeables** | | ⚠️ | un thème = **un jeu de jetons seul** (~60 lignes), le vocabulaire et les règles ne changent pas. Plusieurs thèmes par application, **l'utilisateur choisit le sien**. La séparation est faite (`dagda-ui.css` ne contient aucune valeur, `themes.css` ne contient que des jetons), mais **un seul thème existe** : le choix par l'utilisateur dépend des préférences (§11.6, tranche 3) |
| **NEW** — ↳ Chaque thème définit le jeu de jetons **complet** || ✅ | pas de surcharge partielle : les ombres de Nocturne sont accordées au fond (`--shadow-*` = liseré + noir ambiant sur fond sombre). Un thème clair qui n'override que les couleurs hériterait d'ombres calculées pour du sombre |
| **NEW** — ↳ Remaniement initial de Nocturne : hisser en variables ce qui est cuit dans les règles || ✅ | plus petit que prévu : `--radius-*` sont **déjà** des variables ; restent la densité (les `--space-*` sont pré-multipliés par 0,7 → `calc(4px * var(--density))`) et le style de bouton (contour vs aplat) |
| **NEW** — ↳ Bascule à chaud par attribut (`data-theme`), tous les thèmes dans un même fichier | | ⚠️ | évite le clignotement et l'échec de chargement d'une feuille externe ; l'ordre des blocs départage, leur spécificité étant égale. Le fichier et le sélecteur `[data-theme]` sont en place ; il n'y a qu'un thème à basculer pour l'instant |
| **NEW** — ↳ Alimenter la bibliothèque en récoltant le `:root` de futures générations Claude Design | | | ce bloc ne dépend d'aucun nom de classe : il se transporte tel quel |
| **NEW** — ↳ **Liste des thèmes fixée dans le code** | | | le framework fournit **plusieurs thèmes standard** ; l'application compose la sienne en piochant parmi eux et en ajoutant les siens. Ni table en base, ni écran d'administration : seul le *choix* de l'utilisateur est une donnée |
| **NEW** — ↳ **Le choix appartient à l'utilisateur**, pas à l'administrateur | | | aucun thème imposé à l'échelle de l'instance |
| **NEW** — ↳ Mémorisation du choix par utilisateur | | | dépend des comptes (§7) |
| **NEW** — ↳ Miroir local du choix pour l'appliquer avant le premier rendu | | | la préférence venant du serveur n'est connue qu'après ouverture de session : sans miroir (`localStorage`), chaque chargement affiche brièvement le thème par défaut |
| **NEW** — ↳ Repli sur le thème par défaut si le thème mémorisé n'existe plus | | | la liste étant dans le code, elle change entre deux versions de l'application |
| **NEW** — ↳ Clair / sombre = deux thèmes, pas un interrupteur | | | `theme.json` porte `band: "dark"` : la polarité est une propriété du thème |
| **NEW** — ↳ **Polices embarquées localement** || ✅ | les `styles.css` générés font `@import` vers Google Fonts : inopérant sur un réseau sans Internet (MQTTToolbox auto-hébergé). À rapatrier au build. Conséquence des thèmes : la police faisant partie des jetons, **chaque famille utilisée par un thème doit être embarquée** — garder leur nombre bas |
| **NEW** — **Icônes : Phosphor** (MIT), livré en **police d'icônes** || ✅ | dépendance validée. ~1 500 concepts × 6 graisses ; mode de livraison standard du projet (`@phosphor-icons/web`), donc pas d'outil de sous-ensemblage au build — cohérent avec §0 |
| **ÉCARTÉ** — ↳ Composant `<dagda-icon name="…">` | | | le thème d'icônes est tranché (Phosphor) : un `<i class="ph ph-…">` direct suffit, sans l'indirection JS (risque de FOUC, cycle de vie pour rien). Remplaçable plus tard si besoin, sans passer par un composant dès maintenant |
| **NEW** — ↳ **Graisse = jeton de thème**, le jeu reste fixe || ✅ | répond à « un jeu par thème ? » sans le risque de trous de couverture : les noms d'icônes ne changent jamais. Déclarer les six `@font-face` ne coûte rien — le navigateur ne télécharge que la graisse réellement employée |
| **NEW** — ↳ Accessibilité : `aria-hidden` sur l'icône décorative, libellé obligatoire sur un bouton sans texte || ✅ | les glyphes d'une police d'icônes sont dans une zone privée et se lisent en charabia au lecteur d'écran. À traiter dans le composant, pas dans chaque écran |
| **NEW** — ↳ Fichiers de police embarqués localement || ✅ | même contrainte que les polices de texte : pas de CDN, l'outil doit fonctionner sans Internet |
| **NEW** — ↳ Brancher le lint d'adhérence fourni dans le bundle || ✅ | `_adherence.oxlintrc.json` signale les hex bruts, les `px` bruts et les polices hors système : c'est le garde-fou qui empêche les gabarits de dériver hors des jetons |
| **NEW** — Séparation *store* / vue dans les composants | | | **à évaluer, indépendant du worker écarté (§3)** : un store produit un état de vue prêt à rendre, la vue ne fait que le rendu. Aujourd'hui les deux sont mêlés (cf. `_refreshImpl` dans EurekAI, ~200 lignes) |
| **NEW** — Routage par URL (deep-link, bouton retour navigateur) | | | |
| **NEW** — Navigation mobile (gestes, *swipe* entre pages) | | | besoin remonté par MQTTToolbox 2 |
| **NEW** — Support PWA : installation, manifest, icônes | | | fait à la main dans les apps aujourd'hui |
| **NEW** — Écran « hors ligne » / perte de connexion | | | le mode hors ligne étant écarté (§0), il faut au moins le signaler proprement |

### 8.1 Générateur de formulaires

Une liste de champs typés en entrée, un formulaire rendu et validé en sortie.

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| **NEW** — Génération d'un formulaire depuis une déclaration de champs | | ✅ | libellé, type, valeur par défaut, obligatoire ou non. `FormFieldDeclaration` (`packages/shared/src/forms/types.ts`) est la forme commune ; `<dagda-form>` (`packages/client/src/forms/form.component.ts`) rend un éditeur par champ via le registre, valide au submit (erreur de l'éditeur, ou champ obligatoire vide) et émet `dagda-form-submit` avec les valeurs collectées — écrire ces valeurs (paramètre, entité, appel d'action) reste au consommateur. Pas encore de consommateur réel : le formulaire de publication de MQTTToolbox (ROADMAP tranche 2) est antérieur à `<dagda-form>` et assemble ses cinq champs à la main : l'écran de paramètres système et la matrice de permissions (tranche 3) seront les premiers à en dépendre |
| **NEW** — ↳ S'appuie sur les types du modèle, énumérations comprises | | | c'est le libellé porté par les énumérations déclaratives (§2) qui rend le rendu d'une liste de choix automatique |
| **NEW** — ↳ **Un type d'éditeur par type de champ**, avec un éditeur par défaut pour chaque type de base | | ✅ | `FieldEditorRegistry` (`packages/client/src/forms/editors.ts`) : recherche à deux niveaux, même idiome que `EntitiesModel`/`SettingsModel` résolvant un type — le type nommé (ex. `"MARKDOWN"`) prime s'il a un éditeur enregistré (`registerForType`), sinon retombe sur l'éditeur par défaut de son `rawType` (`registerDefault`). Une énumération n'est pas un `rawType` de plus : quel que soit l'éditeur résolu, il est configuré via `setEnumeration()`. Éditeurs par défaut fournis (`defaultFieldEditors`, activés par `registerDefaultFieldEditors()`) : `dagda-field-text`, `dagda-field-number`, `dagda-field-boolean`, `dagda-field-enum` (menu déroulant construit depuis `EnumDefinition.getEntries()`) |

> **Brique à mutualiser** : trois besoins déjà identifiés convergent ici — l'écran
> d'édition des paramètres système (§11.5), le formulaire de paramètres d'un script
> avant exécution (§11.3), et les formulaires métier des applications. À concevoir
> pour les trois, pas pour un seul.

## 9. Injection de services (nouveauté v2)

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| Point d'entrée unique `Dagda.get("serviceName")` | ❌ | ✅ | classe du paquet partagé, identique côté client et côté serveur ; remplace les singletons statiques de la v1 |
| `Dagda.init(services)` + promesse `Dagda.loaded` | ❌ | ✅ | les composants attendent l'init |
| Services standard : `log`, `notification`, `entities`, `pages` | ❌ | ✅ | |
| Types applicatifs centralisés (`BaseAppTypes`) | ❌ | ✅ | `entities` / `contexts` / `apis` / `events` en un seul endroit |
| Registre instanciable (`DagdaRegistry`) derrière la façade statique | ❌ | ✅ | `Dagda.reset()` rend le registre courant et en installe un neuf : un test s'isole sans toucher à l'état de module |
| **NEW** — Service `auth` (utilisateur courant, connexion, déconnexion) | | ✅ | conséquence de §7 ; `currentUser` et `logout()` via `Dagda.get<AuthService>("auth")`, la connexion reste une page rendue par le serveur (`/login`), volontairement hors périmètre |
| **NEW** — Déclaration de services applicatifs custom documentée | | | |

> **`Dagda` ≠ `DagdaClient`.** `Dagda` (paquet partagé) est le registre de
> services, et lui seul. L'amorçage de l'application cliente — en-têtes de page,
> informations système, appels d'API typés — est porté par `DagdaClient`
> (paquet client), dont le point d'entrée est `DagdaClient.start(model, adapter)`.
> Les deux portaient le même nom jusqu'à la tranche 0, avec deux `init()` de
> signatures incompatibles à une ligne d'écart dans le boilerplate.

## 10. Utilitaires partagés

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| Émetteur d'événements typé (`EventHandler`, `EventHandlerImpl`) | ✅ | ✅ | |
| `Queue` : sérialisation de promesses | ✅ | ✅ | |
| `Pool` : parallélisation limitée | ✅ | ✅ | |
| Helpers asynchrones (`async.ts`) | ✅ | ✅ | |
| Assertions (`asserts.ts`) | ❌ | ✅ | |
| Service de log typé | ❌ | ✅ | |
| Helper `fetch` côté serveur | ✅ | ⚠️ | |
| **NEW** — Journalisation structurée / niveaux de log configurables | | | |

## 11. Couche d'actions, console et scripts utilisateur

> Trois demandes qui n'en font qu'une : **extraire une couche d'actions**. La
> variable globale et l'éditeur de scripts n'en sont que deux consommateurs.

### 11.1 Couche d'actions

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| **NEW** — **Collection d'actions typée**, déclarée comme l'est `APICollection` (§5) | | ✅ | même idiome que les APIs, sous son propre namespace `/actions/` (jamais confondu avec `/api`, dont la console ne doit rien montrer). `ActionsCollection` dans `BaseAppTypes["actions"]`, plus `DagdaActions` : les actions du framework lui-même (gestion des comptes, §11.4), toujours disponibles en plus de celles de l'application |
| **NEW** — ↳ **Deux natures d'action, décidées** | | ✅ | (1) modification directe d'entités — composée côté client dans la transaction optimiste existante (`EntitiesHandler.withTransaction`), rien de neuf à construire ; (2) déclenchement d'un processus serveur — appel RPC (`actionRegister`/`actionCall`), le process peut lui-même ouvrir sa propre transaction SQL pour journaliser (ex. `publishMessage` de MQTTToolbox). La signature « premier paramètre = la transaction », telle qu'imaginée au départ, ne s'appliquait qu'au premier cas ; le second reçoit le compte appelant, pas une transaction imposée |
| **NEW** — ↳ Les tests portent sur les actions, pas sur les clics | | ✅ | `users.spec.ts` (invitation), `ingest.spec.ts` (publication) |
| **NEW** — ↳ `.d.ts` des actions embarqué comme ressource pour l'éditeur | | | attend l'éditeur de scripts (tranche 5 bis) |

**Où placer la frontière** — l'API n'a pas vocation à tout absorber. Le critère
retenu, du plus contraignant au plus souple :

- **Doit être une action** : toute opération qui porte un *invariant* métier, et
  toute opération qu'un utilisateur voudrait plausiblement scripter. En clair :
  ce qu'on nommerait dans le vocabulaire du domaine (« archiver le projet »,
  « publier un message différé »), même si cela recouvre plusieurs appels.
- **Peut rester dans un gestionnaire de clic** : l'enchaînement d'actions sans
  règle propre, la lecture des champs d'un formulaire et leur transformation en
  paramètres, et tout ce qui est propre à l'écran — confirmation, sélection,
  défilement, ouverture d'un panneau.
- **Test d'arbitrage** : *si l'utilisateur refait le même enchaînement depuis la
  console, obtient-il un état valide ?* Si oui, l'enchaînement peut rester dans le
  gestionnaire. Si non, c'est qu'un invariant y est caché et qu'il doit descendre
  dans une action.

Autrement dit : **le séquencement peut vivre dans l'écran, jamais l'invariant.**

### 11.2 API console

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| **NEW** — Variable globale `dagda` exposant services, entités et actions | | ✅ | précédent : `window.MQTT` dans MQTTToolbox v1. `dagda.get(name)`, `dagda.entities`, `dagda.actions.*` (Proxy typé) |
| **NEW** — ↳ Chargement de données depuis la console (`fetch` par contexte) | | ✅ | `dagda.entities.fetch({type: …})`, `.getItems(table)`, `.getById(…)` — l'API que les composants utilisent déjà, atteignable à la main |
| **NEW** — ⚠️ **Masquer un bouton n'est plus un contrôle d'accès** | | | toute autorisation doit être vérifiée **côté serveur** sur les permissions résolues (§7.1). Ce n'est pas une régression (c'était déjà vrai), mais la console rend le contournement trivial |
| **NEW** — ⚠️ L'API console devient un **contrat public** | | | renommer une action casse les scripts des utilisateurs : versionnement à assumer |

### 11.3 Éditeur de scripts intégré

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| **NEW** — Éditeur TypeScript fourni par le framework, dans toute application Dagda | | | Monaco — **dépendance validée** |
| **NEW** — ↳ **Les scripts sont du TypeScript, jamais du JavaScript** | | | y compris ceux saisis par l'utilisateur final |
| **NEW** — ↳ Chargé à la demande, jamais dans le bundle principal | | | Monaco pèse plusieurs Mo : le coût ne doit être payé que par qui ouvre l'éditeur |
| **NEW** — ↳ Autocomplétion et vérification de types sur l'API réelle de l'application | | | via les `.d.ts` embarqués (§11.1) — c'est ce qui fait la valeur de Monaco ici |
| **NEW** — ↳ Transpilation par Monaco lui-même | | | il embarque le service de langage TypeScript : **aucune dépendance supplémentaire** pour compiler dans le navigateur |
| **NEW** — ↳ Une erreur de type bloque l'exécution | | | ici la vérification de types est un vrai garde-fou, contrairement aux automatismes serveur de MQTTToolbox où seul le bac à sable protège |
| **NEW** — ↳ **Déclaration de paramètres** par le script (nom, type, libellé, défaut) | | | le framework en dérive un formulaire affiché avant exécution : un script devient un petit outil |
| **NEW** — ↳ Exécution dans la page, avec la session de l'utilisateur | | | **aucun bac à sable nécessaire** : un script personnel ne confère rien de plus que la console déjà ouverte à l'utilisateur. À ne pas confondre avec les automatismes serveur de MQTTToolbox, qui, eux, en exigent un |
| **NEW** — ↳ Scripts **privés à leur auteur par défaut** | | | |
| **NEW** — ⚠️ Le partage de scripts entre utilisateurs est un **XSS stocké** | | | un script écrit par A et exécuté par B s'exécute avec les droits de B. Si le partage est ouvert un jour, il devra être explicite et averti |
| **NEW** — ↳ Historique / versions d'un script | | | |

### 11.4 Données natives du framework — **décidé**

**Les données du framework ne sont pas des entités.** Comptes utilisateurs (§7),
préférences dont le thème (§8), scripts (§11.3), configuration interne : tout cela
est **purement interne à Dagda**. Les entités restent réservées aux objets métier
des applications.

Conséquences, toutes favorables :

- Pas de composition de modèles à concevoir : `EntitiesModel` ne contient que les
  tables de l'application.
- Ces données ne transitent ni par le cache client, ni par les contextes de
  chargement, ni par les transactions. Elles s'exposent par des APIs typées (§5).
- Dagda gère **ses propres migrations**, indépendamment de celles de l'application.
  Chacun sa version de schéma.

**Le seul pont : l'identifiant utilisateur.**

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| **NEW** — Type `USER_ID` fourni par le framework, utilisable dans un modèle applicatif | | | permet à une application de déclarer `ownerId: { type: "USER_ID" }` avec le typage nommé (§2) |
| **NEW** — ↳ Clé étrangère SQL émise vers la table utilisateurs de Dagda | | | `foreignTable` désigne aujourd'hui une table du même modèle : il faut une variante pointant vers une table du framework |
| **NEW** — ↳ **Annuaire des utilisateurs côté client**, chargé une fois, consultable **de façon synchrone** | | | sans lui, aucun écran ne peut afficher « créé par X » pendant le rendu — les utilisateurs n'étant plus dans le cache d'entités. Besoin réel : MQTTToolbox affiche l'auteur d'une publication manuelle et le propriétaire d'un tableau de bord |
| **NEW** — ↳ Politique de suppression d'un compte | | | des entités métier le référencent : désactiver plutôt que supprimer (EurekAI porte déjà un `enabled`) |

### 11.5 Paramètres système — mécanisme générique du framework

**Tout réglage qui n'est lu que côté serveur passe par ce mécanisme, jamais par
une entité.** Le broker MQTT et son mot de passe en sont l'exemple type.

La raison est directe : **une entité est lisible depuis la console** par quiconque
peut charger son contexte (§11.2). Un mot de passe de broker, un jeton d'API, une
chaîne de connexion stockés en entité transiteraient par le cache client et
seraient exposés. Le mécanisme de paramètres est la réponse à ça.

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| **NEW** — Déclaration typée des paramètres d'une application | | | même esprit que le modèle d'entités : une déclaration d'où découlent le typage, la validation et le formulaire d'édition |
| **NEW** — ↳ Stockage en base, côté framework | | | |
| **NEW** — ↳ **Trois niveaux de visibilité** déclarés par paramètre | | | cf. tableau ci-dessous. Défaut : le plus fermé |
| **NEW** — ↳ Paramètres marqués **secrets** : écriture seule depuis l'interface | | | saisis puis jamais relus en clair ; exclus des exports ; chiffrement au repos à prévoir |
| **NEW** — ↳ Règle de cohérence : un secret ne peut pas être de visibilité `client` | | | à refuser à la déclaration, pas à l'exécution |
| **NEW** — ↳ Secrets **chiffrés en base**, clé fournie par variable d'environnement | | | la clé est donc un paramètre d'amorçage, comme la connexion à la base |
| **NEW** — Écran de gestion de la configuration | | ✅ | dérivé de la déclaration typée via le générateur de formulaires (§8.1, `<dagda-form>`, premier vrai consommateur). Deux actions gardées par `settings.manage` : `getSettingsValues()` (toute clé non secrète, **sans filtrage par visibilité** — `SettingsStore.getValuesFor(visibility)` répond à une autre question, celle de ce qu'un lecteur ordinaire peut voir à l'exécution, pas de ce qu'un administrateur peut éditer) et `setSetting({ key, value })`. Un champ secret démarre vide (la valeur n'est jamais renvoyée) et, laissé vide au submit, n'est pas réécrit — sinon un enregistrement sans y toucher l'écraserait par une chaîne vide |
| **NEW** — ↳ Édition réservée aux administrateurs | | ✅ | dépend des rôles (§7), `settings.manage` |
| **NEW** — ↳ **Notification de changement côté serveur** | | | reprise d'un mécanisme éprouvé : MQTTToolbox v1 fait `Config.on("mqtt", …)` pour se reconnecter au broker à chaud. Sans ça, tout changement impose un redémarrage |
| **NEW** — ↳ Frontière avec les variables d'environnement | | | l'amorçage reste en variables d'environnement (port, URL de base, **chaîne de connexion à la base**) — on ne peut pas lire en base de quoi se connecter à la base. Tout le reste va dans les paramètres |

**Les trois niveaux de visibilité**

| Niveau | Qui peut lire | Exemples | Peut être secret |
|---|---|---|---|
| `server` | le code serveur du framework et de l'application, **rien d'autre** | clé de chiffrement, secret de session, réglages de pool | oui |
| `script` | en plus, le code utilisateur **exécuté sur le serveur** (automatismes MQTTToolbox, §5) | jeton d'un service tiers appelé par un automatisme | oui |
| `client` | descend au navigateur — donc lisible par **tout utilisateur authentifié**, console comprise | titre de l'instance, plafonds d'affichage, durée de rétention | **non** |

Le défaut est `server` : un paramètre ne s'ouvre que par une déclaration explicite.
Et il faut lire `client` pour ce qu'il est — non pas « visible par l'interface »
mais « public pour quiconque a un compte », puisque la console y donne accès (§11.2).

**Décidé** : les trois niveaux sont conservés. Le niveau intermédiaire est ce qui
permet à un automatisme serveur d'utiliser un jeton d'API sans que celui-ci
descende jamais au navigateur.

> Ce mécanisme **absorbe le magasin de secrets** prévu pour les automatismes de
> MQTTToolbox : ce n'est plus une fonctionnalité de l'application mais un usage
> d'une brique du framework, au niveau `script`.

> **Question ouverte** — un secret de niveau `script` est remis *en clair* au code
> utilisateur, qui peut donc le journaliser ou l'exfiltrer par un appel HTTP
> sortant. L'alternative est que le framework n'expose jamais la valeur mais
> réalise lui-même l'appel en y injectant le secret (`http.call("service", …)`).
> Plus sûr, moins souple. À trancher avant la tranche 6.

**À distinguer des préférences utilisateur** (§11.6) : le thème est une préférence,
propre à chaque utilisateur et lue par le client. Les paramètres système, eux,
sont globaux à l'instance et ne descendent pas au navigateur.

### 11.6 Préférences utilisateur

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| **NEW** — Service générique de préférences, propres à chaque utilisateur | | ✅ | premier usage : le thème (§8), tranche 4 — le mécanisme lui-même n'en déclare encore aucune |
| **NEW** — ↳ **Toujours une valeur par défaut** | | ✅ | une préférence jamais renseignée doit se lire sans cas particulier dans le code appelant |
| **NEW** — ↳ Stockage côté framework, table `system_` | | ✅ | comme les comptes et les paramètres (§11.4) ; `userId` en `ON DELETE CASCADE`, pas `SET NULL` comme `roleId` — une préférence n'a plus de sens sans son propriétaire |

## 12. Ce qu'une application déclare

Récapitulatif du contrat côté développeur — l'ensemble est typé, d'où découlent
la vérification TypeScript et l'autocomplétion, y compris dans l'éditeur de
scripts (§11.3).

**Partie *shared*** — types de champs · modèle des entités métier · liste des
permissions (§7.1) · types de contextes et leurs paramètres · fonctions
d'intersection par type de contexte (§3) · notifications serveur → client ·
routes client → serveur (§5) · API externes (§5) · actions de modification (§11.1).

**Partie *client*** — pages, dérivant d'`ApplicationPage`, avec leur position
optionnelle dans le menu (§8) · composants propres à l'application · liste des
thèmes retenus (§8).

**Partie *serveur*** — implémentation des routes et des API externes ·
implémentation du `fetch` par contexte · hooks sur modifications (§3).
