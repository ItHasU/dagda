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
| Invalidation totale du cache en cas d'échec de submit | ✅ | ✅ | **comportement assumé**, pas un manque |
| **NEW** — Rendre l'échec de submit visible pour l'utilisateur | | | aujourd'hui : `console.error` + cache *dirty*, l'utilisateur ne voit rien |
| **ÉCARTÉ** — Résolution de conflits | | | on invalide et on recharge |
| **ÉCARTÉ** — Persistance du cache client (IndexedDB / offline) | | | le cache n'est qu'une vue partielle des données, le mode hors ligne n'a pas de sens |

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

## 5. API typée client ↔ serveur

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| Déclaration d'API par un simple type TS (`APICollection`) | ✅ | ✅ | signature partagée entre client et serveur |
| `apiCall()` côté client / `apiRegister()` côté serveur | ✅ | ✅ | typage des arguments et du retour |
| API système intégrée (`getSystemInfo`, `triggerError`) | ✅ | ✅ | uptime, liste des erreurs non capturées |
| API entités intégrée (`fetch` / `submit`) | ✅ | ✅ | |
| Passage du contexte de requête (utilisateur, session) au handler | ⚠️ | ✅ | `RequestOptions` |
| **NEW** — Gestion homogène des erreurs API (codes, messages typés) | | | |
| **NEW** — Authentification par jeton pour les appels hors navigateur | | | besoin remonté par MQTTToolbox 2 (API `curl`-friendly) |

## 6. Notifications temps réel

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| WebSocket serveur greffé sur le serveur HTTP | ✅ | ✅ | |
| Événements typés (`events` dans les `AppTypes`) | ⚠️ | ✅ | v2 : typage centralisé |
| Broadcast serveur → tous les clients | ✅ | ✅ | |
| Reconnexion automatique côté client | ✅ | ✅ | |
| Notifications navigateur (Web Notification API) | ✅ | ⚠️ | dans EurekAI en v1, à remonter dans le framework |
| **NEW** — Notifications ciblées (par utilisateur / par salon) | | | aujourd'hui uniquement du broadcast global |

## 7. Serveur applicatif & authentification

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| Serveur Express préconfiguré | ✅ | ✅ | v2 : classe `AbstractServerApp` qui assemble tout |
| Service de fichiers statiques (le client buildé) | ✅ | ✅ | |
| Lecture de la config depuis les variables d'environnement | ✅ | ✅ | `getEnvString` / `getEnvNumber` / `...Optional`, préfixe configurable |
| Authentification Passport + session | ✅ | ✅ | |
| Stratégie Google OAuth2 | ✅ | ✅ | |
| Point d'extension pour d'autres stratégies | ❌ | ✅ | `registerAuthStrategy` |
| Validation applicative de l'utilisateur (`_isUserValid`) | ✅ | ✅ | permet la liste blanche d'utilisateurs |
| **NEW** — **Gestion locale des utilisateurs** (compte + mot de passe) | | | permet de déployer sans dépendre d'un fournisseur externe |
| **NEW** — ↳ stockage sécurisé des mots de passe (hachage + sel) | | | |
| **NEW** — ↳ création de compte **sur invitation d'un administrateur uniquement** | | | pas d'inscription publique : aucun formulaire d'inscription exposé |
| **NEW** — ↳ mécanisme d'invitation (lien à usage unique, avec expiration) | | | l'administrateur crée le compte, l'utilisateur choisit son mot de passe |
| **NEW** — ↳ changement de mot de passe par l'utilisateur | | | |
| **NEW** — ↳ réinitialisation : par le même lien d'invitation, régénéré par l'administrateur | | | évite d'imposer un service d'envoi de mail ; à confirmer |
| **NEW** — **Plusieurs stratégies actives simultanément** dans une même app | | | ex. Google *et* comptes locaux ; le serveur doit exposer la liste des stratégies disponibles au client |
| **NEW** — ↳ un même utilisateur rattaché à plusieurs méthodes de connexion ? | | | à trancher : identité unique ou un compte par stratégie |
| **NEW** — Gestion des rôles / permissions | | | au minimum : administrateur vs utilisateur |
| **NEW** — Notion de propriétaire d'une entité + partage entre utilisateurs | | | besoin remonté par MQTTToolbox 2 (tableaux de bord) |
| **NEW** — Filtrage des données par utilisateur au niveau du fetch | | | |
| **NEW** — Identité de l'utilisateur courant accessible côté serveur dans les écritures | | | pour tracer l'auteur d'une modification |
| **NEW** — Écran d'administration des utilisateurs | | | aujourd'hui dans EurekAI : activation manuelle en base |
| **ÉCARTÉ** — Mode « sans authentification » (`NO_AUTH`) | ✅ | ⚠️ | présent en v1, à retirer |

## 8. Client / UI

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
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
| Composant de login | ❌ | ✅ | à faire évoluer : afficher les stratégies disponibles + formulaire local (§7) |
| Composant conteneur | ❌ | ✅ | |
| Bootstrap 5 + bootstrap-icons intégrés | ✅ | ✅ | **à remplacer** — cf. ligne suivante |
| **NEW** — **Choix d'un design system** (en remplacement de Bootstrap) | | | décision à prendre au niveau de Dagda ; couvre le thème clair / sombre |
| **NEW** — Jeu d'icônes associé au design system | | | remplace bootstrap-icons |
| **NEW** — Routage par URL (deep-link, bouton retour navigateur) | | | |
| **NEW** — Navigation mobile (gestes, *swipe* entre pages) | | | besoin remonté par MQTTToolbox 2 |
| **NEW** — Support PWA : installation, manifest, icônes | | | fait à la main dans les apps aujourd'hui |
| **NEW** — Écran « hors ligne » / perte de connexion | | | le mode hors ligne étant écarté (§0), il faut au moins le signaler proprement |

## 9. Injection de services (nouveauté v2)

| Fonctionnalité | v1 | v2 | Notes |
|---|:--:|:--:|---|
| Point d'entrée unique `Dagda("serviceName")` | ❌ | ✅ | remplace les singletons statiques de la v1 |
| `Dagda.init(services)` + promesse `Dagda.loaded` | ❌ | ✅ | les composants attendent l'init |
| Services standard : `log`, `notification`, `entities`, `pages` | ❌ | ✅ | |
| Types applicatifs centralisés (`BaseAppTypes`) | ❌ | ✅ | `entities` / `contexts` / `apis` / `events` en un seul endroit |
| **NEW** — Service `auth` (utilisateur courant, connexion, déconnexion) | | | conséquence de §7 |
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
