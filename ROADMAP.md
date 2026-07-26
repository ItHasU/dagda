# Plan — Dagda v2, MQTTToolbox 2, EurekAI

## Principe retenu

**Le framework est construit tranche par tranche, tiré par les besoins de
MQTTToolbox 2.** On n'ajoute une brique à Dagda que lorsqu'une fonctionnalité
applicative la réclame. Chaque tranche est verticale : elle traverse serveur,
base, transport et interface, et se termine sur quelque chose de démontrable.

Conséquences assumées :

- **Le boilerplate est extrait, pas conçu d'avance.** L'app `bootstrap/` devient
  le lieu où l'on remonte les motifs stabilisés par MQTTToolbox, au fil des
  tranches — pas un exercice préalable.
- **La conversion d'EurekAI vient en dernier**, une fois le framework éprouvé.
- **Les tests s'écrivent dans la tranche**, pas après. Une tranche n'est close
  que si sa porte de sortie est franchie, tests compris.

### Le risque principal de cette approche

Un framework tiré par une seule application se surajuste à cette application.
EurekAI arrivant en dernier, ses exigences propres ne seront exercées par rien
avant la toute fin. Quatre points qu'MQTTToolbox ne couvrira probablement pas
spontanément, à surveiller à chaque tranche :

| Exigence EurekAI | Où la couvrir |
|---|---|
| Contextes **avec options** (`{type:"project", options:{projectId}}`) et leur intersection | à forcer dans `bootstrap/` + tests dès la tranche 1 |
| Insertion optimiste dont l'id temporaire est réutilisé **dans la même transaction** (une pièce jointe insérée puis référencée par une image) | tranche 2, à couvrir par un test même si MQTTToolbox ne l'exige pas |
| Contenus binaires volumineux hors cache (route dédiée, cache HTTP) | à ne pas oublier : MQTTToolbox n'a que des payloads courts |
| Listes longues et rendu dense (milliers d'éléments) | mesurer sur `bootstrap/` avant la conversion |

Règle : quand une tranche ne les exerce pas naturellement, on les couvre par un
test ou un écran du boilerplate. Sinon on les découvrira à la conversion, au
pire moment.

---

## Tranche 0 — Assainissement et socle de test — **FAITE**

> Ne produit rien de visible, mais tout le reste s'appuie dessus. À garder court.

**Nettoyage du code existant**

- ✅ `packages/server/src/app/index.ts` : enregistrement parasite
  `registerAPI("submit", … Promise.reject("Not implemented"))` supprimé.
- ✅ `packages/shared/src/entities/handler.ts` : le `FIXME` est levé. Le handler
  s'abonne au service de notification une fois `Dagda.loaded` résolu, et
  l'absence de service n'est plus une erreur mais un cas nominal (pas de
  notification, pas de cache marqué sale tout seul).
- ✅ `packages/client/src/app/index.ts` : le bloc commenté est remplacé par un
  vrai stockage des informations système (`Dagda.systemInfo`,
  `refreshSystemInfo()`).
- ✅ Doublon `app/abstract.page.element` : il n'existait déjà plus dans les
  sources, seul un reliquat de `.tsc-build` y faisait référence.
- ✅ `packages/client/src/tools/html.ts` supprimé : code mort qui référençait un
  `Handlebars` global jamais importé.

**Socle de test**

- ✅ **Vitest** comme lanceur unique, en trois projets (`shared` en Node,
  `client` sous jsdom, `server` en Node). Les trois fichiers mocha sont migrés,
  `_data.spec.ts` renommé `_data.ts` — c'était une fixture, pas un test.
- ✅ **Tests d'interface à deux niveaux** : DOM simulé pour les composants,
  **Playwright** pour les parcours.
- ✅ Fixture PostgreSQL réelle (`packages/server/src/test/pg.fixture.ts`) : un
  schéma dédié par suite, créé et détruit autour d'elle. Sans base joignable les
  suites concernées sont ignorées ; `DAGDA_REQUIRE_DB=1` (posé en CI) transforme
  cet évitement en échec.
- ✅ **`docker-compose`** à la racine, un seul fichier, auquel la tranche 7
  ajoutera le service applicatif.
- ✅ **Mode watch** : `npm run dev` démarre la base, surveille client et serveur
  et redémarre le serveur (`node --watch`). Le navigateur n'est pas rechargé
  automatiquement — `webpack-dev-server` serait une dépendance de plus, à
  arbitrer si la gêne se confirme.
- ✅ **Composants testables** : les gabarits passent de
  `require("./x.html").default` à `import template from "./x.html"`, servi par
  `html-loader` dans le bundle et par un greffon Vitest dans les tests. Tout
  paquet à composants embarque la déclaration `declare module "*.html"`.
- ✅ Intégration continue (`.github/workflows/ci.yml`) : typage, tests unitaires
  et parcours Playwright contre un service PostgreSQL.

**Porte de sortie** — franchie. `npm test` : 39 tests, dont 10 contre une vraie
base. `npm run test:e2e` : 3 parcours sur `bootstrap/`.

**Ce que la tranche a fait remonter**

- **Le cycle de vie des composants perdait des rafraîchissements.** Le premier
  test de composant écrit l'a montré : `refresh()` appelé pendant un
  rafraîchissement en cours retournait immédiatement sans rien faire, et sans
  attendre celui en cours. Poser deux attributs à la suite pouvait donc laisser
  le composant sur l'état intermédiaire. Les rafraîchissements sont désormais
  regroupés — une passe supplémentaire est exécutée derrière — et la promesse
  rendue se résout quand le composant reflète l'état au moment de l'appel.
- **`getEnvStringOptional` traite maintenant la chaîne vide comme absente.** Un
  environnement n'a pas d'autre façon d'exprimer « non défini », et
  `GOOGLE_CLIENT_ID=""` faisait croire à une configuration Google valide.
- **Le parcours Playwright est plus mince que prévu.** `bootstrap/` ne sait
  s'authentifier que par Google : aucun navigateur ne franchit la page de
  connexion sans compte réel. Les trois parcours vérifient donc la chaîne
  (build, serveur, base, navigateur) et la fermeture aux anonymes — API
  comprise, appelée directement. Les vrais parcours arrivent en tranche 1.
- **Collision de noms sur `Dagda`, résolue.** Le paquet client exportait une
  classe `Dagda` homonyme de la fonction `Dagda` du paquet partagé, avec deux
  `init()` de signatures incompatibles appelés à deux lignes d'écart dans
  `bootstrap/client/src/index.ts`. Décision prise et appliquée :
  - le registre de services devient une **classe `Dagda` dans le paquet
    partagé** : `Dagda.init(services)`, `Dagda.get("nom")`, `Dagda.loaded`.
    Un seul nom, identique côté client, serveur et partagé ;
  - la syntaxe appelable `Dagda("nom")` disparaît au profit de `Dagda.get("nom")`
    (FEATURES §9 mis à jour) — une classe ne peut pas être appelée, et c'est ce
    qui bloquait toute mise en commun ;
  - l'amorçage client devient **`DagdaClient`**, avec
    `DagdaClient.start(model, adapter)` au lieu de `init`.

  Fait maintenant plutôt que plus tard : chaque tranche suivante ajoute des
  écrans, donc des sites d'appel. Le coût de ce renommage ne fera qu'augmenter.

  Le registre est par ailleurs devenu un objet (`DagdaRegistry`) derrière la
  façade statique, et `Dagda.reset()` rend le registre courant en en installant
  un neuf. Un test s'isole donc sans recharger le module. Attention à ce que ça
  ne promet pas : les composants lisent `Dagda.get(...)`, donc un seul registre
  est actif à la fois dans un processus. Faire tourner deux applications
  réellement en parallèle demanderait de passer le registre le long de la chaîne
  d'appel — pas fait, pas nécessaire aujourd'hui.

---

## Tranche 1 — « Je vois les messages MQTT arriver en direct »

*MQTTToolbox : §1 connexion, §2 historique, §7 page Statut, §9 temps réel, §11 persistance*

Le squelette complet de l'application, avec le minimum de fonctionnalités.

**Ce que ça tire de Dagda**

- Modèle d'entités + génération de schéma (premier vrai modèle après EurekAI).
- **Énumérations déclaratives** (FEATURES §2), dès ce modèle : le statut d'un
  message ou d'un topic est le premier candidat naturel. Introduites ici plutôt
  qu'à la conversion d'EurekAI (tranche 8), pour que le générateur de formulaires
  (tranche 3) et le reste du framework les exercent tout du long.
- **Validation runtime des entités** (FEATURES §2), sur ce premier modèle.
- Chargement par contexte, cache, invalidation — **y compris un contexte avec
  options** (par topic), pour ne pas s'enfermer dans des contextes triviaux.
- **Fonctions d'intersection de contextes prêtes à l'emploi** (FEATURES §3 :
  toujours / jamais / égalité de tous les paramètres), une par type de contexte.
  À construire avec ce premier `ContextAdapter`, pour ne pas laisser chaque
  application réécrire à la main l'équivalent de `AppContextAdapter` du
  bootstrap actuel.
- Notifications WebSocket serveur → clients, reconnexion.
- Composants et pages, composant de statut.
- **Coquille SPA — disposition paysage** (FEATURES §8, spec détaillée dans
  [`specs/navigation.md`](specs/navigation.md)) — **faite**. `PageContainer` et
  `Navbar`, menu piloté par la seule liste des pages enregistrées, page
  courante marquée. L'application n'écrit qu'un `<dagda-app>` dans son
  `index.html` (`specs/navigation.md` §6.1) : la coquille entière est montée
  par le framework, qui enregistre ses propres éléments personnalisés — les
  imports « pour effet de bord » ont disparu des deux applications. Les quatre
  questions ouvertes sont tranchées et consignées dans la spec : bascule
  manuelle mémorisée, sections toujours développées, clic sur un badge rétracté
  = navigation vers la première page, et la marque en paramètre de
  `DagdaClient.start()`. Seule la disposition paysage est construite ; le
  portrait (barre + tiroir) attend la tranche 4, avec le reste du mobile.
- Variables d'environnement pour l'amorçage seul (port, URL de base, connexion PG).
- **Mécanisme de paramètres système** (FEATURES §11.5) : déclaration typée,
  stockage côté framework, notification de changement. Nécessaire dès cette
  tranche — la configuration du broker en relève, et sa reconnexion à chaud
  repose sur la notification. L'écran d'édition, lui, attend les rôles
  (tranche 3) ; en attendant, amorçage par variables d'environnement.
- **Intégration du design system, en séparant structure et jetons.** On part de
  Nocturne et on le scinde en deux :
  - `dagda-ui.css` — le vocabulaire de classes et les règles, repris tels quels
    (`.btn`, `.card`, `.input`, `.field`, `.nav`, `.table`, `.dialog`, `.tag`,
    `.seg`, `.elev-*`). Aucune valeur en dur : uniquement des `var()`.
  - `themes/*.css` — un jeu de jetons **complet** par thème (~60 lignes), dans des
    blocs `[data-theme="…"]` d'un même fichier.

  Remaniement à faire au passage, plus petit qu'annoncé : les `--radius-*` sont
  déjà des variables ; il ne reste qu'à hisser la densité (les `--space-*` sont
  pré-multipliés par 0,7 → `calc(4px * var(--density))`) et le style de bouton
  (contour vs aplat). Rapatrier les polices localement.

  Un seul thème suffit à cette tranche — mais la séparation doit être faite
  maintenant, sinon les écrans des tranches 1 à 3 la rendront coûteuse.
- **Icônes** : police Phosphor embarquée localement (six graisses déclarées, une
  seule téléchargée à l'usage), la graisse étant un jeton de thème. **Pas de
  composant** : FEATURES §8 a écarté `<dagda-icon name="…">` — le thème d'icônes
  étant tranché, un `<i class="ph ph-…">` direct suffit, sans l'indirection JS.
  L'accessibilité (`aria-hidden` sur l'icône décorative, libellé obligatoire sur
  un bouton sans texte) devient donc une règle d'écriture, documentée avec la
  feuille de style.
- Brancher le lint d'adhérence livré dans le bundle (`_adherence.oxlintrc.json`)
  dès maintenant : il refuse les hex bruts, les `px` bruts et les polices hors
  système. C'est lui qui garantit que les écrans des tranches 1 à 3 resteront
  thémables sans réécriture.

**Tests**

- Entités : chargement, fusion dans le cache, contexte déjà chargé, contexte
  *dirty*, intersection de contextes. L'adaptateur mémoire existe déjà.
- Notifications : diffusion, reconnexion, absence de perte au reconnect.
- Bout en bout : un message publié sur le broker apparaît dans l'interface.
- **Lint d'adhérence en CI** : premier garde-fou contre les valeurs en dur.
- **Rendu des composants contre deux thèmes** (un clair, un sombre) dès qu'un
  second thème existe. Le lint attrape les valeurs en dur dans le code, pas les
  hypothèses implicites sur la polarité — un texte lisible seulement sur fond
  sombre passe le lint sans problème.
- **`Navbar` déployée et rétractée** (`specs/navigation.md`) : menu filtré par
  permission dans les deux états, page courante correctement marquée, aucune
  fuite de libellé de section interdite dans le rail rétracté.

**Porte de sortie** — l'application affiche en temps réel les messages d'un vrai
broker, l'historique est persisté, et couper/rétablir le réseau ne casse rien.

---

## Tranche 2 — « Je publie, y compris en différé »

*MQTTToolbox : §3 publication*

**Ce que ça tire de Dagda**

- Transactions optimistes complètes : `withTransaction`, ids temporaires,
  remappage après réponse serveur, file de soumission.
- Remontée des échecs d'écriture à l'utilisateur (aujourd'hui un simple
  `console.error`, cf. FEATURES §3).
- **Collection d'actions typée** (FEATURES §11.1) et variable globale `dagda`
  (§11.2). À faire **ici**, avec la première écriture : c'est une convention
  d'écriture, pas une fonctionnalité, et fixer la frontière après coup coûterait
  une réécriture. La globale, elle, est presque gratuite une fois les actions
  déclarées.
- C'est aussi ici que se calibre la frontière API / gestionnaire de clic. Le
  critère est écrit dans FEATURES §11.1 ; MQTTToolbox est le premier terrain où
  l'éprouver, et il faudra sans doute l'ajuster après les premiers écrans.

**Tests** — c'est le code le plus subtil du framework, la suite doit être dense :

- insertion + mise à jour dans une même transaction ;
- **id temporaire réutilisé dans la même transaction** (exigence EurekAI, à
  couvrir ici même si MQTTToolbox ne la réclame pas) ;
- deux transactions enchaînées avant la réponse du serveur ;
- échec de soumission → invalidation du cache et état visible ;
- ordre de la file de soumission.

**Porte de sortie** — publication immédiate et différée, les messages différés
survivent à un redémarrage du serveur (sans hook d'arrêt), et un échec réseau
pendant une publication est visible et rattrapable.

- ✅ Publication immédiate et différée, avec formulaire (topic, message,
  `retain`, QoS, « maintenant » / « plus tard »), liste des publications
  programmées et annulation. `publishMessage`/`schedulePublish`/
  `cancelScheduledPublish`/`listScheduledPublishes` (actions), `PublishScheduler`
  (`setTimeout`, un par publication programmée), liste tenue à jour côté client
  par la notification `scheduledPublishesChanged` plutôt que par un sondage.
  Échec réseau visible via un toast (`showToast`), comme toute action.
- ⚠️ **Écart assumé par rapport à la porte de sortie telle qu'écrite** : la
  file des publications différées est **en mémoire seulement** — décision
  explicite prise plus tôt dans la tranche (« prend l'option d'un setTimeout
  pour l'instant, ce n'est pas grave si on perd un envoi de message quand le
  serveur redémarre »). Une publication programmée ne survit donc **pas** à
  un redémarrage. À revoir si ça devient gênant en pratique : passer par la
  persistance de Dagda plutôt que par le fichier de configuration que faisait
  la v1 (FEATURES MQTTToolbox §3).
- ✅ Formulaire construit avec le générateur de formulaires (FEATURES §8.1),
  premier consommateur applicatif réel : éditeurs par défaut réutilisés tels
  quels (texte, nombre, booléen, énumération pour le QoS), et un éditeur
  `TIMESTAMP` propre à l'application enregistré par-dessus le défaut
  (`registerForType`) pour le champ « envoyer le ». Assemblage à la main
  (cinq champs fixes), pas via une déclaration générique — cette pièce-là
  reste à construire pour l'écran de paramètres et la matrice de permissions
  (tranche 3).

---

## Tranche 3 — « Je me connecte »

*MQTTToolbox : §12 utilisateurs · Dagda : FEATURES §7*

**Ce que ça tire de Dagda**

- ✅ Comptes locaux : mot de passe haché (scrypt), **seul mode d'authentification**.
  `passport` est entièrement sorti — plus seulement sa stratégie Google : quatre
  paquets ont quitté l'arbre de dépendances (`passport`, `passport-google-oauth20`
  et leurs `@types`), `PassportProfile` / `_isUserValid(profile)` /
  `registerAuthStrategy` / `registerGoogleStrategy` ont disparu avec, ainsi que
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. `express-session` reste, c'est lui
  qui porte la session. Premier compte `admin`/`admin` amorcé sur base vide.
- ✅ **Création sur invitation d'un administrateur** (lien à usage unique, avec
  expiration) : `UserStore.invite()`/`acceptInvitation()`/`reinvite()`, routes
  `GET`/`POST /invite/:token`. Pas de service d'e-mail (FEATURES §0) — le lien
  est copié à la main par l'administrateur. `reinvite()` sert aussi de
  réinitialisation de mot de passe : même mécanisme, le mot de passe courant
  reste valide tant que le nouveau lien n'a pas été utilisé. Exposé via
  `dagda.actions.inviteUser/reinviteUser/listUsers/setUserEnabled` — premier
  usage réel de la couche d'actions (§11.1) côté framework, et premières
  actions gardées par une permission (`isSuperAdmin`, en attendant la matrice
  de rôles ci-dessous).
- ✅ Rôles et matrice de permissions (FEATURES §7.1). La liste des permissions
  est une constante applicative (`DAGDA_PERMISSIONS`, `packages/shared/src/auth/permissions.ts`) :
  `users.manage`, `roles.manage`, `settings.manage` pour l'instant — une
  application ajoute les siennes de la même façon le jour où elle en a besoin.
  Les rôles, eux, sont une donnée (`RoleStore`, table `system_roles`, `permissions`
  en JSON — le connecteur SQL n'a pas de type tableau natif) : nom + sous-ensemble
  de permissions, créés librement par l'administrateur. Un compte porte au plus
  un rôle (`system_users.roleId`, `ON DELETE SET NULL`) ; `UserInfo.permissions`
  est résolu côté serveur à chaque requête, vide pour un super-admin — son
  drapeau `isSuperAdmin` court-circuite `hasPermission()`, rien à énumérer.
  `listUsers`/`inviteUser`/`reinviteUser`/`setUserEnabled` sont passées de
  `isSuperAdmin` en dur à `users.manage` ; `listRoles`/`createRole`/`updateRole`/
  `deleteRole`/`setUserRole` gardées par `roles.manage`. Écran « Rôles » construit
  côté MQTTToolbox (matrice éditable, assemblée à la main depuis les éditeurs
  du générateur de formulaires — un tableau à deux dimensions n'est pas ce que
  `<dagda-form>` rend), suivi de l'écran « Utilisateurs » : inviter, réinviter
  (sert aussi de réinitialisation de mot de passe), activer/désactiver, et
  attribuer un rôle depuis une liste déroulante construite à partir des rôles
  chargés. Plus rien en console pour la gestion courante des comptes.
  - ✅ **Dialogue modal** (`openDialog()`, `<dagda-dialog-host>`), ajouté à
    cette occasion : premier vrai usage des classes `.dialog`/`.dialog-backdrop`
    de `dagda-ui.css`, jusque-là posées mais jamais consommées. A révélé un
    bug réel — `.dialog-backdrop` restait visible et interceptait les clics
    malgré l'attribut `hidden`, sa propre règle `display: grid` l'emportant
    sur la feuille de style par défaut du navigateur, corrigé par une règle
    `.dialog-backdrop[hidden]`. Le contrat `onClick` accepte un retour `false`
    pour enchaîner un second dialogue sans que le premier ne le referme aussitôt
    (le dialogue d'invitation → le dialogue du lien à copier, par exemple).
- **Générateur de formulaires** (FEATURES §8.1), construit ici plutôt qu'à
  l'apparition du premier écran métier : c'est lui qui rend possible, dans la
  même tranche, l'écran de matrice rôle × permission *et* l'écran de paramètres
  système ci-dessous — les deux premiers de ses trois usages identifiés
  (le troisième, les paramètres de script, attend la tranche 5 bis).
  - ✅ Mécanisme d'enregistrement d'un éditeur par type de champ, avec un
    éditeur par défaut pour chaque type de base (texte, nombre, booléen,
    énumération). C'est la brique qui laisse chaque application décider
    l'éditeur d'un type nommé particulier (ex. `MARKDOWN` face à un simple
    `TEXT`) sans rien reconstruire pour les autres.
  - ✅ Assemblage : `<dagda-form>` prend une liste de `FormFieldDeclaration`
    (libellé, type, défaut, obligatoire), rend un éditeur par champ via le
    registre, valide au submit et émet `dagda-form-submit` avec les valeurs
    collectées. Encore sans consommateur réel — l'écran de paramètres et la
    matrice de permissions ci-dessous seront les premiers à s'en servir.
- Écran d'édition des paramètres système, réservé aux administrateurs, avec les
  paramètres secrets en écriture seule (FEATURES §11.5).
  - **À partir de cet écran, plus aucun réglage applicatif ne doit rester en
    variable d'environnement dès lors qu'il peut être un paramètre système**
    (FEATURES §11.5 : l'amorçage seul — port, URL de base, chaîne de connexion
    à la base — reste en variable d'environnement, tout le reste va dans les
    paramètres). Un choix explicite à faire ici, réglage par réglage : ce qui
    est amorçage reste en `.env` / variable d'environnement, ce qui peut
    attendre le premier accès en base bascule vers les paramètres système.
- **Routes client → serveur protégées par permission** (FEATURES §5) : le
  mécanisme est posé ici, en même temps que les permissions qu'il vérifie —
  aucun écran de cette tranche ne l'exige encore, mais le construire plus tard
  reviendrait à le greffer sur des permissions déjà figées. Premier usage réel
  en tranche 6 (déclenchement manuel d'un automatisme).
- Identité de l'utilisateur courant accessible côté serveur pendant les écritures
  (nécessaire pour tracer la source `manuel` des messages, MQTT §2).
- Service `auth` côté client.
- Préférences par utilisateur — premier usage : mémoriser le thème choisi
  (tranche 4).
- **Comptes, préférences et scripts sont internes à Dagda**, hors modèle
  d'entités (FEATURES §11.4). Trois conséquences à traiter ici :
  - le jeu de migrations propre au framework, distinct de celui de l'application ;
  - le type `USER_ID` exposé au modèle métier, avec la clé étrangère SQL qui va
    vers la table utilisateurs du framework ;
  - l'**annuaire des utilisateurs côté client**, chargé une fois et consultable de
    façon synchrone. Sans lui, aucun écran ne pourra afficher un nom d'auteur
    pendant le rendu — et MQTTToolbox en a besoin dès la tranche 4.

**Tests** — le point le plus sensible à la régression :

- cycle invitation → activation → connexion ; lien expiré, lien rejoué ;
- accès refusé sans session, sur les API *et* sur les entités ;
- élévation de privilège : un utilisateur simple ne doit atteindre aucune
  route ni aucune donnée d'administration — **à tester en appelant les actions
  directement**, pas en vérifiant qu'un bouton est masqué (FEATURES §11.2) ;
- deux stratégies actives en parallèle.

**Porte de sortie** — plus aucun accès anonyme, et la traçabilité des
publications manuelles fonctionne.

---

## Tranche 4 — « Je compose mon tableau de bord »

*MQTTToolbox : §6 tableaux de bord, §6.1 composants, §6.2 API JavaScript*

**Ce que ça tire de Dagda**

- Propriétaire d'une entité et partage entre utilisateurs ; **filtrage par
  utilisateur au niveau du chargement** (une donnée non partagée ne doit pas
  traverser le réseau).
- **Filtrage des notifications par utilisateur et par permissions** (FEATURES
  §6), **côté serveur**, dès qu'un tableau de bord privé existe : sans lui, le
  filtrage du fetch ci-dessus ne sert à rien — la modification d'un tableau non
  partagé continuerait à être diffusée en broadcast à tous les clients connectés.
  À couvrir par le même test d'étanchéité que le fetch (porte de sortie
  ci-dessous).
- Routage par URL (un tableau de bord doit être adressable).
- **Coquille SPA — disposition portrait** (FEATURES §8, `specs/navigation.md`) :
  barre horizontale (☰ + marque + groupe secondaire) et panneau déroulant en
  overlay, réutilisant le même `Navbar` que la tranche 1 — seul le rendu
  change, pas la source du menu. Reste à trancher ici : le seuil de bascule
  paysage/portrait, et la fermeture du panneau (tap extérieur, second tap sur
  ☰, sélection d'une page — probablement les trois).
- Navigation mobile par gestes (swipe entre pages) — indépendante du panneau
  ci-dessus : porte sur le contenu, pas sur le menu.
- **Thèmes, partie visible** : liste déclarée dans le code (celle du framework,
  sur-définie par l'application si besoin), sélection par l'utilisateur, bascule à
  chaud (attribut `data-theme` sur la racine), mémorisation du choix (préférences
  de la tranche 3) avec miroir local pour l'appliquer avant le premier rendu, et
  repli sur le thème par défaut si le thème mémorisé a disparu de la liste.
  La feuille de style, elle, a été intégrée en tranche 1 et ne bouge plus.
- Ajout d'un second thème de polarité opposée — c'est lui qui révèle les jetons
  oubliés lors du découpage de la tranche 1.
- Rien de particulier à faire pour le HTML utilisateur des tableaux de bord : il
  emploie les mêmes classes et les mêmes jetons que le reste de l'interface, donc
  il suit le thème actif sans traitement spécifique.

- **Intégration de Monaco comme brique du framework**, chargée à la demande.
  Embarquer comme ressource les `.d.ts` déjà émis par `tsc` dans `.tsc-build/`
  (actions et entités) et les charger en bibliothèques supplémentaires : c'est ce
  qui donne l'autocomplétion sur l'API réelle de l'application. MQTTToolbox en a
  besoin ici pour les tableaux de bord ; l'éditeur de scripts (tranche 5 bis) et
  l'éditeur d'automatismes (tranche 6) le réutiliseront.

**Spécifique à l'application**

- Multi-tableaux de bord, langage d'expression partagé entre `mqtt-if` /
  `mqtt-json` et les filtres de déclencheurs (préfigure la tranche 6).

**Tests** — filtrage par propriétaire côté serveur (test d'accès, pas seulement
d'affichage), **un client sans accès à un tableau ne reçoit aucune notification
le concernant** (pas seulement un fetch vide), rendu des composants, évaluation
des expressions, **panneau portrait** (`specs/navigation.md`) : ouverture en
overlay sans redimensionner le contenu, fermeture par les trois voies retenues,
même filtrage par permission qu'en paysage.

**Porte de sortie** — deux utilisateurs, des tableaux de bord distincts, un
tableau partagé, et rien qui fuite entre les deux.

---

## Tranche 5 — Extraction du boilerplate

> Objectif n°2 de la liste. Il arrive ici parce qu'avant, les motifs ne sont pas
> stabilisés — un boilerplate écrit trop tôt serait à refaire.

- `bootstrap/` remonte les motifs éprouvés : entités et contextes (dont un
  contexte à options), authentification, notifications, pages, composants,
  gestion d'erreur.
- Documentation : README par package, guide de démarrage.
- Éventuellement le générateur de projet — mais seulement si le boilerplate
  s'est révélé stable.

**Porte de sortie** — un tiers (ou toi dans six mois) démarre une application
Dagda en suivant le guide, sans lire le code du framework.

---

## Tranche 5 bis — Éditeur de scripts utilisateur

*Dagda : FEATURES §11.3*

Fonctionnalité du framework, livrée à toutes les applications. Placée ici parce
qu'elle réunit trois briques qui n'existent qu'à ce stade : la couche d'actions
(tranche 2), les comptes et préférences pour ranger les scripts (tranche 3), et
l'intégration de Monaco (tranche 4).

- Édition, enregistrement et exécution de scripts TypeScript, **privés à leur
  auteur**.
- Déclaration de paramètres par le script ; le framework en dérive le formulaire
  affiché avant exécution.
- Exécution dans la page, avec la session de l'utilisateur — pas de bac à sable,
  puisque le script ne peut rien de plus que la console.
- Trancher au passage la question des **entités du framework** (FEATURES §11.4) :
  les scripts sont la troisième table que Dagda veut posséder, après les comptes
  et les préférences.

**Porte de sortie** — un script paramétré, écrit dans l'application, charge des
données et exécute une suite d'actions ; l'autocomplétion propose les actions
réelles de l'application.

> Bénéfice pour la suite : l'éditeur d'automatismes de la tranche 6 réutilise
> l'éditeur, la déclaration de paramètres et le `.d.ts`. Seuls le lieu
> d'exécution et le modèle de sécurité diffèrent.

## Tranche 6 — Planificateur et automatismes

*MQTTToolbox : §4 cron, §5 automatismes*

De loin le plus gros morceau, et **presque entièrement applicatif** : il tire
peu de Dagda, ce qui en fait un bon dernier chantier avant EurekAI.

Découpage interne suggéré :

1. **Cron** (§4) — petit, autonome, met en place l'ordonnanceur partagé.
2. **Exécution TypeScript en bac à sable** (§5.4) — le cœur du risque. À traiter
   comme un composant isolé, testé pour lui-même, avant toute intégration.
3. **Déclencheurs et API d'automatisme** (§5.2, §5.3), dont le langage
   d'expression déjà introduit en tranche 4.
   - **Hooks sur les modifications de données** (Dagda FEATURES §3), le point
     d'accroche serveur déclenché par une transaction : c'est sur lui que
     reposent les déclencheurs « sur changement ». Fonctionnalité de Dagda,
     pas de MQTTToolbox — à construire ici parce que c'est le premier (et
     jusqu'ici seul) consommateur identifié.
   - **Déclenchement manuel d'un automatisme** via une **route protégée**
     (Dagda FEATURES §5, mécanisme posé en tranche 3) : premier usage réel des
     routes.
4. **Magasin de secrets** (§5.3) et appels HTTP sortants — question ouverte à
   trancher au passage (Dagda FEATURES §11.5) : le framework expose-t-il le
   secret en clair au script, ou réalise-t-il lui-même l'appel HTTP sortant ?
5. **API externes et jetons d'API** (Dagda FEATURES §5) : c'est le besoin qui a
   fait remonter ce mécanisme — piloter un automatisme (le déclencher, en lire
   l'historique) depuis un `curl`, hors navigateur. Inclut l'écran de gestion
   des jetons (chacun voit et révoque les siens ; le super-admin voit tout).
6. **Historique d'exécution et garde-fous** (§5.5, §5.6).

**Tests — à écrire avant la mise en service, pas après**

- Évasion du bac à sable : `globalThis`, `constructor.constructor`, `require`,
  `process`, accès à la base. Chaque tentative doit échouer.
- Boucle infinie interrompue par le délai maximal ; dépassement mémoire.
- Chaîne d'automatismes au-delà de la profondeur maximale : arrêtée **et** tracée.
- Deux automatismes qui se répondent lentement : rattrapés par la limite de
  fréquence, pas par la profondeur.
- Désactivation automatique après N échecs, remise à zéro du compteur au succès.
- Un secret n'est lisible que par l'API prévue, jamais dans un export.
- Une formule de filtrage lente ne bloque pas la réception MQTT.

**Porte de sortie** — la suite d'évasion passe intégralement, et un automatisme
fautif ne peut ni figer, ni compromettre, ni noyer le serveur.

---

## Tranche 7 — Déploiement de MQTTToolbox 2

- Migrations de schéma versionnées (**prérequis absolu** avant EurekAI, qui a des
  données réelles à conserver).
- Image Docker multi-architecture, `docker-compose` app + PostgreSQL.
- Import / export de configuration, secrets exclus.

**Porte de sortie** — MQTTToolbox 2 tourne en production et remplace la v1.

---

## Tranche 8 — Conversion d'EurekAI

Volontairement en dernier. C'est une **migration de données réelles**, pas un
portage de code : le risque principal n'est pas le framework, ce sont les projets
et les images existants.

- Reprendre la checklist du haut de ce document : tout ce qui n'a pas été
  exercé par MQTTToolbox est un trou de framework à combler ici.
- Remplacer la copie locale de Dagda v1 (`eurekai/dagda/*`) par les paquets v2.
- Convertir le modèle d'entités (l'API `EntitiesModel` est déjà très proche).
- **Retirer la table `users` du modèle EurekAI** : elle devient interne à Dagda
  (FEATURES §11.4). Disparaissent avec elle le contexte de chargement `users` et
  les `getById("users", …)`, à remplacer par l'annuaire du framework.
- **Basculer les comptes Google vers des comptes locaux.** Dagda n'authentifie
  plus que localement (FEATURES §0) : chaque utilisateur existant reçoit une
  invitation et choisit un mot de passe. Les `uid` Google sont abandonnés, mais
  l'identifiant interne est conservé — c'est lui que référencent projets et
  images, donc aucune donnée métier n'est à réaffecter.
  À préparer avant la bascule : la liste des utilisateurs actifs et leur
  ré-invitation, sans quoi plus personne ne peut se connecter au redémarrage.
- **Convertir les énumérations** `ComputationStatus` et `PictureType` : les `enum`
  TypeScript laissent place aux énumérations déclaratives (FEATURES §2). Les
  valeurs numériques stockées en base doivent être préservées à l'identique.
- **Écrire les migrations** du schéma existant vers le modèle converti — le mode
  automatique ayant été écarté, rien ne se fera tout seul.
- Convertir les pages, en commençant par la plus simple (Maintenance) pour
  valider la chaîne complète avant de toucher aux pages Images / Quick / Stars.
- Migrer le schéma et les données : sauvegarde, migration, vérification, retour
  arrière possible. À répéter à blanc sur une copie avant la vraie bascule.
- Trancher au passage le stockage des images en base64 en base (FEATURES EurekAI).

**Porte de sortie** — EurekAI tourne sur Dagda v2, sans perte de données ni
régression fonctionnelle.

---

## Backlog — confort d'outillage, sans tranche dédiée

Fonctionnalités **NEW** de FEATURES.md qui ne bloquent la porte de sortie
d'aucune tranche et n'ont donc pas de créneau fixe. À prendre quand une tranche
laisse du temps, ou à répartir sur `bootstrap/` en tranche 5 :

- Interface web de lancement et de suivi des tests (FEATURES §1) — le `npm test`
  en CLI (tranche 0) suffit à toutes les portes de sortie.
- Journalisation structurée / niveaux de log configurables (FEATURES §10).
- Déclaration de services applicatifs custom **documentée** (FEATURES §9) — le
  mécanisme (`Dagda.init`) existe depuis la v2 initiale ; ce qui manque est la
  doc, donc naturellement en tranche 5.

## Couverture — FEATURES.md → tranche

Table de traçabilité : chaque section de FEATURES.md doit apparaître au moins
une fois ci-dessous. Une section absente de cette table en cours de route est
un signal à traiter, pas à ignorer.

| § FEATURES.md | Tranche(s) |
|---|---|
| 0. Partis pris | cadre, toutes tranches |
| 1. Structure & outillage | 0 (socle, docker-compose, watch), 5 (générateur de projet, doc) |
| 2. Modèle d'entités | 1 (déclaratif, énumérations, validation runtime), 7 (migrations versionnées) |
| 3. Cache & synchronisation | 1 (contextes, intersection), 2 (transactions, échecs visibles), 6 (hooks) |
| 4. Accès base de données | 0 (fixture Postgres réelle), transverse ensuite |
| 5. Routes & API externes | 3 (routes protégées), 6 (API externes, jetons) |
| 6. Notifications temps réel | 1 (WebSocket, reconnexion), 4 (filtrage par permission) |
| 7. Serveur applicatif & authentification | 3 |
| 7.1 Rôles & permissions | 3 |
| 8. Client / UI | 1 (design system, icônes, coquille SPA paysage — `specs/navigation.md`), 4 (thèmes partie choix, routage URL, coquille SPA portrait, gestes mobiles) |
| 8.1 Générateur de formulaires | 3 (premier usage), 5 bis (deuxième usage) |
| 9. Injection de services | acquis en v2 initiale ; `auth` en 3 ; doc en 5 |
| 10. Utilitaires partagés | transverse ; niveaux de log → backlog |
| 11.1 Couche d'actions | 2 |
| 11.2 API console | 2 (variable globale), 5 bis (script en tire parti) |
| 11.3 Éditeur de scripts | 5 bis |
| 11.4 Données natives du framework | 3 (comptes, USER_ID, annuaire), 5 bis (scripts) |
| 11.5 Paramètres système | 1 (mécanisme + config broker), 3 (écran d'édition) |
| 11.6 Préférences utilisateur | 3 |
| 12. Ce qu'une application déclare | contrat vérifié à chaque tranche, formalisé en 5 |

## Décisions prises

- **Lanceur de tests** : Vitest, pour le framework et les applications.
- **Tests d'interface** : DOM simulé pour les composants, Playwright pour les
  parcours et le temps réel.
- **Design system** : un seul, repris de Nocturne (généré par Claude Design). Son
  vocabulaire de classes et ses règles vont dans `dagda-ui.css`, intégré en
  tranche 1, et ne changent plus.
- **Thèmes** : un thème est un **jeu de jetons complet**, pas une surcharge
  partielle ni une feuille entière. Liste fixée dans le code — celle du framework,
  sur-définie par l'application. **Le choix appartient à l'utilisateur**, jamais à
  l'administrateur. Bascule par `data-theme`. Livré en tranche 4.
- **Icônes** : Phosphor (MIT), livré en police d'icônes, embarquée localement.
  Le jeu est fixe pour toute l'application ; c'est la **graisse** qui est un jeton
  de thème. Employé directement (`<i class="ph ph-…">`) : le composant
  `<dagda-icon>` est écarté (FEATURES §8).
- Le lint d'adhérence du bundle est branché en CI dès la tranche 1.

## Questions encore ouvertes

- ~~**Rangement du design system**~~ — tranché en tranche 1 : le bundle est
  dézippé côté framework, sous `packages/client/src/styles/`. Seules les
  sources utiles sont reprises (jetons, règles, polices, icônes) ; les
  `templates/`, la photo de référence et les vignettes du bundle sont des
  exemples de présentation et restent dehors. Voir le
  [README du dossier](packages/client/src/styles/README.md).
