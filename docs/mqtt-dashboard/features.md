# MQTT Dashboard — définition des fonctionnalités

> Application pilote pour le framework **Dagda**.
> Objectif : réécrire [MQTTToolbox](https://github.com/ItHasU/MQTTToolbox) sur Dagda.
> L'app sert de fil conducteur : chaque besoin métier tire une capacité du framework.

Ce document décrit **le quoi et le pourquoi**. Les contrats de types associés
sont dans [`contracts.ts`](./contracts.ts) et font foi pour les signatures.

---

## 1. Décisions cadrantes

| Sujet | Décision | Conséquence framework |
|---|---|---|
| Configuration (connexion, dashboard, cron) | **Système de configuration dédié**, pas des entities. Backend de stockage non tranché (fichier, SQL, autre) — abstrait derrière un service. | **Nouvelle brique Dagda `ConfigService<Schema>`** à créer. |
| Temps réel des messages MQTT | **Push** via les notifications/events Dagda. Plus de polling. | Exercer `NotificationService` de bout en bout (serveur → client). |
| Authentification | **Login activé.** | Exercer la brique `auth` (le repo a déjà `login.component`). |
| Entities / SQL | Pas utilisées pour l'instant (la config n'est pas une entity). À reconsidérer plus tard (historique de messages ?). | Couche entities laissée de côté à ce stade. |

---

## 2. Fonctionnalités de l'application

Format : user stories courtes. `[F]` marque un besoin qui tire une capacité de framework.

### 2.1 Connexion au broker MQTT
- En tant qu'utilisateur, je configure l'URL du broker, les options client (id, mot de passe) et la liste des topics souscrits.
- Le serveur maintient **une** connexion au broker et se réabonne quand la config change. `[F: config + réaction au changement]`
- Je vois l'état de la connexion (connecté / déconnecté). `[F: events]`

### 2.2 Réception & stockage des messages
- Le serveur garde en mémoire le **dernier** message par topic (topic, payload, timestamp).
- Je peux lister les topics connus, lire un topic, ou récupérer tous les messages (filtre topic / `after`).
- Chaque message reçu est **poussé au client** en temps réel. `[F: events push]`

### 2.3 Publication de messages
- Je publie un message sur un topic : **immédiatement**, ou **différé** (délai ou timestamp cible).
- Je vois la file des messages programmés et je peux en **annuler** un. `[F: api]`

### 2.4 Scénarios cron
- Je définis des **scénarios** contenant des tâches récurrentes hebdomadaires (jours de la semaine × heure × minute → topic + payload).
- J'active / désactive un scénario.
- Le planificateur recalcule la prochaine échéance dès que les scénarios changent en config. `[F: config + réaction au changement]`

### 2.5 Dashboard
- J'écris le contenu du dashboard en **HTML libre**, stocké dans la config.
- Le HTML utilise des **web components réactifs** liés aux topics MQTT :
  - `mqtt-value` — affiche la valeur brute d'un topic
  - `mqtt-json` — extrait une valeur via un chemin dans un payload JSON
  - `mqtt-age` — temps écoulé depuis le dernier message
  - `mqtt-date` — formate un timestamp
  - `mqtt-if` — affiche/masque selon une condition sur le payload
- Les composants se mettent à jour **en direct** à l'arrivée d'un message. `[F: web components Dagda + events]`

### 2.6 Éditeur
- J'édite le HTML du dashboard dans un éditeur de code intégré et je sauvegarde. `[F: config]`

### 2.7 Status
- Je vois un tableau des messages reçus et un tableau des messages programmés.
- Rafraîchissement **temps réel** (via events, plus par timer). `[F: events]`

### 2.8 Settings
- J'édite les réglages de connexion MQTT et le contenu du dashboard. `[F: config]`

### 2.9 Navigation & login
- Application multi-pages (dashboard / status / cron / settings). `[F: pages Dagda]`
- Accès protégé par login. `[F: auth]`

---

## 3. Capacités du framework mobilisées

Correspondance besoin app → brique Dagda. `NEW` = à construire, `EXISTS` = présent, `EXTEND` = à compléter.

| Brique | État | Rôle dans l'app |
|---|---|---|
| `Dagda()` (service locator) | EXISTS | Remplace les singletons statiques (`MQTTProxy`, `Config`, `Navigation`). |
| **`ConfigService<Schema>`** | **NEW** | Config typée : `get(key)`, `set(partial)`, `on(key, cb)`. Backend de stockage pluggable. Généralise le `Config` de MQTTToolbox. |
| `NotificationService` / events | EXISTS | Push serveur→client des messages MQTT, de l'état de connexion, des changements de file programmée. |
| `APICollection` (RPC typé) | EXISTS | Remplace les routers express + proxies écrits à la main (`/mqtt`, `/config`). |
| `auth` | EXISTS/EXTEND | Login et protection des pages/API. |
| Pages client + `abstract.webcomponent` | EXISTS/EXTEND | Pages et web components réactifs (`mqtt-*`). |
| `LogService` | EXISTS | Logs. |
| entities / SQL | EXISTS | **Non utilisées à ce stade.** |

---

## 4. La nouvelle brique : `ConfigService<Schema>`

Besoin identifié comme manquant dans Dagda. Généralisation directe du `Config` de MQTTToolbox.

**Contrat (voir `contracts.ts`)**
- `get<K>(key, default?) : Promise<Schema[K]>`
- `set(values: Partial<Schema>) : Promise<void>` — persiste puis notifie.
- `on<K>(key, cb) : void` — réagit aux changements d'une clé (utilisé par le cron et le proxy MQTT pour se reconfigurer).

**Points ouverts (à trancher plus tard)**
- Backend de stockage : fichier JSON (comme aujourd'hui), SQL, ou autre — l'interface doit rester agnostique.
- La config est-elle par-utilisateur ou globale (impact avec le login) ?
- Propagation des changements au client : via events Dagda ? (cohérent avec le choix « push »).

---

## 5. Modèle temps réel (push)

Remplace le polling client de MQTTToolbox.

- À chaque message reçu du broker, le serveur émet un event Dagda (ex. `mqttMessage: MQTTMessage`).
- Le client s'abonne à cet event ; un registre côté client redispatche vers les abonnés **par topic** (les web components `mqtt-*`).
- Les changements d'état de connexion et de la file de messages programmés sont aussi des events.

> Note de conception : les events Dagda ont une map de types statique. Les topics étant
> dynamiques, on n'expose pas un event par topic ; on émet un seul event `mqttMessage`
> et le filtrage par topic se fait côté client.

---

## 6. Hors périmètre à ce stade

- Persistance d'un **historique** de messages (seul le dernier message par topic est gardé).
- Multi-broker.
- Gestion fine des droits (au-delà d'un login unique).
- Migration des données de l'ancienne app.

---

## 7. Prochaines étapes

1. Valider ce périmètre et les contrats de `contracts.ts`.
2. Spécifier en détail la brique `ConfigService` (backend, portée, propagation).
3. Décider du squelette de projet (app à part vs. dans `bootstrap`).
4. Implémenter brique par brique, en commençant par ce qui manque au framework (`ConfigService`).
