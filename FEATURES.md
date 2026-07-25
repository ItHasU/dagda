# Dagda — Liste des fonctionnalités

> Premier jet. Dagda est un framework full-stack TypeScript de prototypage
> (client + serveur + code partagé), pensé pour être minimaliste, typé de bout
> en bout et sans dépendance à un gros framework front.
>
> Légende :
> - `v1` : présent dans la version utilisée par EurekAI (`eurekai/dagda/*`)
> - `v2` : présent dans la ré-écriture (`dagda/packages/*`)
> - `NEW` : à faire / envisagé, absent des deux versions

---

## 1. Structure & outillage

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| Monorepo npm workspaces (`shared` / `client` / `server` / `build`) | ✅ | ✅ | v2 sépare `packages/*` (framework) et `bootstrap/*` (app d'exemple) |
| Configs TypeScript partagées (`tsconfig-base/client/server`) | ✅ | ✅ | package `@dagda/build` |
| Configs webpack partagées (client & serveur) | ✅ | ✅ | bundle unique `main.js` par app |
| Résolution des alias de paths (`tsconfig-paths-webpack-plugin`) | ✅ | ✅ | |
| Application « bootstrap » servant d'exemple et de banc de test | ❌ | ✅ | `bootstrap/{client,server,shared}` |
| Tests unitaires (mocha) | ✅ | ✅ | couverture partielle : `model`, `handler` |
| Génération de la config VSCode (launch / tasks) | ✅ | ✅ | |
| **NEW** — Générateur de projet (`npm create dagda`) | | | scaffolding d'une app à partir du bootstrap |
| **NEW** — Documentation (README par package, guide de démarrage) | | | actuellement quasi inexistante |
| **NEW** — Build en mode watch / hot reload confortable | | | |

## 2. Modèle d'entités (le cœur du framework)

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| Déclaration déclarative du modèle (`EntitiesModel`) : types + tables | ✅ | ✅ | typage complet dérivé de la déclaration |
| Types nommés / « branded types » (`Named`, `asNamed`) | ✅ | ✅ | évite de confondre `ProjectId` et `PromptId` |
| Types JS de base + types custom (`JSTypes`) | ✅ | ✅ | `number`, `string`, `boolean`, `custom` |
| Clés étrangères déclarées (`foreignTable`) | ✅ | ✅ | |
| Champs optionnels, champ identité | ✅ | ✅ | |
| Génération du DDL / des noms de tables & colonnes quotés | ✅ | ✅ | `qt()` / `qf()` |
| **NEW** — Migrations de schéma versionnées | | | aujourd'hui : scripts SQL manuels (cf. `eurekai/apps/sql`) |
| **NEW** — Validation runtime des entités | | | |

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
| **NEW** — Résolution de conflits / stratégie en cas d'échec de submit | | | aujourd'hui : on invalide tout le cache |
| **NEW** — Persistance du cache côté client (IndexedDB / offline) | | | |

## 4. Accès base de données (serveur)

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| Abstraction `AbstractSQLRunner` (`run` / `get` / `all` / `insert`) | ✅ | ✅ | |
| Implémentation PostgreSQL | ✅ | ✅ | pool + `withReservedConnection` |
| Implémentation SQLite | ✅ | ❌ | **à réintroduire ?** utile pour les petits déploiements |
| Transactions SQL réelles côté serveur | ✅ | ✅ | |
| Statistiques de base au démarrage (taille des bases) | ❌ | ✅ | |
| **NEW** — Support d'un backend non-SQL (fichier JSON) pour prototypage | | | |

## 5. API typée client ↔ serveur

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| Déclaration d'API par un simple type TS (`APICollection`) | ✅ | ✅ | signature partagée entre client et serveur |
| `apiCall()` côté client / `apiRegister()` côté serveur | ✅ | ✅ | typage des arguments et du retour |
| API système intégrée (`getSystemInfo`, `triggerError`) | ✅ | ✅ | uptime, liste des erreurs non capturées |
| API entités intégrée (`fetch` / `submit`) | ✅ | ✅ | |
| Passage du contexte de requête (utilisateur, session) au handler | ⚠️ | ✅ | `RequestOptions` |
| **NEW** — Gestion homogène des erreurs API (codes, messages typés) | | | |

## 6. Notifications temps réel

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| WebSocket serveur greffé sur le serveur HTTP | ✅ | ✅ | |
| Événements typés (`events` dans les `AppTypes`) | ⚠️ | ✅ | v2 : typage centralisé |
| Broadcast serveur → tous les clients | ✅ | ✅ | |
| Reconnexion automatique côté client | ✅ | ✅ | |
| Notifications navigateur (Web Notification API) | ✅ | ⚠️ | dans EurekAI en v1, à remonter dans le framework |
| **NEW** — Notifications ciblées (par utilisateur / par salon) | | | aujourd'hui uniquement du broadcast global |

## 7. Serveur applicatif

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| Serveur Express préconfiguré | ✅ | ✅ | v2 : classe `AbstractServerApp` qui assemble tout |
| Service de fichiers statiques (le client buildé) | ✅ | ✅ | |
| Lecture de la config depuis les variables d'environnement | ✅ | ✅ | `getEnvString` / `getEnvNumber` / `...Optional`, préfixe configurable |
| Authentification Passport + session | ✅ | ✅ | |
| Stratégie Google OAuth2 | ✅ | ✅ | |
| Point d'extension pour d'autres stratégies | ❌ | ✅ | `registerAuthStrategy` |
| Validation applicative de l'utilisateur (`_isUserValid`) | ✅ | ✅ | permet la liste blanche d'utilisateurs |
| Mode « sans authentification » explicite (`NO_AUTH`) | ✅ | ⚠️ | à ne pas conserver : MQTTToolbox 2 exige l'authentification |
| **NEW** — Gestion des rôles / permissions | | | |
| **NEW** — Notion de propriétaire d'une entité + partage entre utilisateurs | | | besoin remonté par MQTTToolbox 2 (tableaux de bord) |
| **NEW** — Filtrage des données par utilisateur au niveau du fetch | | | |
| **NEW** — Identité de l'utilisateur courant accessible côté serveur dans les écritures | | | pour tracer l'auteur d'une modification |

## 8. Client / UI

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| Bootstrap 5 + bootstrap-icons intégrés | ✅ | ✅ | **à remplacer** — cf. choix du design system ci-dessous |
| Injection automatique des `<head>` (meta, styles, manifest) | ❌ | ✅ | template Handlebars |
| Web components : classe de base `AbstractWebComponent` | ⚠️ | ✅ | v1 : composants ad-hoc dans l'app |
| Template HTML importé par `require()` et injecté | ✅ | ✅ | |
| Décorateur `@Ref()` : accès typé aux éléments par attribut `ref` | ❌ | ✅ | |
| Décorateur `@Attribute()` + marshallers : attributs typés | ❌ | ✅ | déclenche le refresh automatiquement |
| Cycle de vie `_init()` / `_refresh()` avec garde anti-réentrance | ❌ | ✅ | |
| Gestion des slots pour les enfants existants | ❌ | ✅ | |
| Système de pages / navigation (`PageHandler`, `AbstractPageElement`) | ⚠️ | ✅ | v1 : géré dans l'app EurekAI |
| Composant de statut (téléchargement / envoi / cache sale) | ✅ | ✅ | |
| Composant de navbar | ❌ | ✅ | |
| Composant de login | ❌ | ✅ | |
| Composant conteneur | ❌ | ✅ | |
| **NEW** — Routage par URL (deep-link, bouton retour navigateur) | | | |
| **NEW** — Support PWA de série (manifest + service worker) | | | fait à la main dans les apps aujourd'hui |
| **NEW** — **Choix d'un design system** (en remplacement de Bootstrap) | | | décision à prendre au niveau de Dagda ; couvre le thème clair / sombre |
| **NEW** — Navigation mobile (gestes, *swipe* entre pages) | | | besoin remonté par MQTTToolbox 2 |

## 9. Injection de services (nouveauté v2)

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| Point d'entrée unique `Dagda("serviceName")` | ❌ | ✅ | remplace les singletons statiques de la v1 |
| `Dagda.init(services)` + promesse `Dagda.loaded` | ❌ | ✅ | les composants attendent l'init |
| Services standard : `log`, `notification`, `entities`, `pages` | ❌ | ✅ | |
| Types applicatifs centralisés (`BaseAppTypes`) | ❌ | ✅ | `entities` / `contexts` / `apis` / `events` en un seul endroit |
| **NEW** — Déclaration de services applicatifs custom documentée | | | |
| **NEW** — Nettoyer les `Dagda<...>(...)` marqués `FIXME` dans le handler | | | |

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
