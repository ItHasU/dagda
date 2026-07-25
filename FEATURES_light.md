Dagda est un Framework TypeScript full stack.

# Service disponibles de base dans les applications

Toutes les applications Dagda viennent avec un certain nombre de services déjà disponible.
Ces services peuvent être paramétrés spécifiquement pour l'application, cependant il doivent être autonomes.

## Chaine de compilation

* Fournit une chaîne de compilation côté client + serveur
* Mécanismes de tests unitaires (client avec DOM virtuel, shared & serveur) + interface web

## Authentification

* Gestion des comptes en local uniquement
* Page de gestion des utilisateurs

## Permission

* Rôle "super admin" existant par défaut (et ne peut pas être supprimé)
* Gestion des rôles (création, suppression)
* Page d'attribution des permissions à chaque rôle (matrice de permission)

## Configuration

* Les paramètres sont persistés dans la base de données
* Ils peuvent être configurés depuis la page de configuration de l'application
* Ils peuvent être disponible côté client (si activé) et côté serveur
* Les paramètres peuvent être stockés sous forme de secrets (impossible de les lire côté client)
* Les secrets sont stockés de manière chiffrée dans la base de donnée (clé dans les variables d'environnement)
* Page de gestion de la configuration

## Base de données

* PostgreSQL uniquement
* Initialisation automatique de la base de données pour les tables systèmes de l'application (utilisateurs, rôles, configuration, préférences utilisateurs, ...) (préfixe system_)
* Mise à jour de la base de données des entités métier (préfixe data_)

## Modèle de données métier

* Définition d'entités typées (dans la partie Shared de l'application)
* Gestion de la mise à jour des tables en fonction du modèle
* Pour les énumérations ne pas utiliser les énumérations TypeScript, mais proposer une définition <"uid", "value" (integer / string), "display name">
* Possibilité de stocker des champs JSON => Dans ce cas l'utilisateur peut stocker ce qu'il veut tant que c'est compatible avec la persistance PG

## Persistence des données

* Mécanisme de fetch des entités par contexte
* Détection de collision entre deux contextes lors des mises à jour
* Mécanisme de persistence des modifications générique (optimiste)
* Persistance via transactions
* Ré-initialisation du cache client en cas d'erreur
* Clés étrangères
* Notification des clients des modifications
* Hook sur les modifications de données

## Navigation & Menu

* L'application propose une SPA contenant :
  * Un menu de navigation
  * Une zone pour le contenu de la page courante
* Les pages dérivent du composant ApplicationPage
* Elles peuvent être enregistrées dans le menu système (ou non)
* Si elle sont enregistrées elles apparaissent dans le menu (hiérarchie par catégorie)
* Sinon elles peuvent quand même être affichées via le service de navigation

## Préférences utilisateurs

* Permet d'enregistrer les préférences liée à un utilisateur
* Fournit toujours une valeur par défaut
* Stockées dans la base de données

## Mise à disposition d'une API pour la console

* Possibilité de piloter l'application depuis la console
* Possibilité de modifier les données depuis la console (utilisation des mêmes méthodes métier que l'UI)
* Possibilité de créer des scripts
* Possibilité de manipuler des données depuis le serveur (fetch, transactions)

## Routes

* Le développeur peut définir des routes spécifiques pour déclencher des actions côté serveur
* Protection des routes en fonction de l'utilisateur connecté et de ses permissions

## API Externe

* Lors d'un appel externe, l'utilisateur est identifié par son token
* Les permissions sont identiques à celles de l'utilisateur
* Page de gestion des tokens (seulement mes tokens pour les utilisateurs, tous les tokens pour le super admin)

## Notifications

* Possibilité de déclencher des notifications
* Possibilité de filtrer les notifications en fonction de l'utilisateur et de ses permissions

# Services complémentaires

## Design system

* Dagda fourni un design système standard
* Dagda fourni plusieurs thèmes standards
* Chaque application peut définir sa propre liste de thèmes (parmi les standard et des thèmes spécifiques à l'application)

## Mécanisme de formulaire

* Un mécanisme permet de générer de manière assistée un formulaire
* Il suffit de faire une liste de champs avec des types, le formulaire est généré automatiquement

# Création d'une application

Liste des actions à mener par le développeur d'une application Dagda.

## Constantes à définir lors du développement de l'application

Ces constantes sont utilisées pour définir les types de base de l'application.
Ce mécanisme permet de vérifier les typages en TypeScript.

Partie Shared de l'application :

* Types de champs
* Modèle des entités métiers (tables et champs avec leurs types)
* Liste des permissions (chaînes de caractères)
* Types de contextes + paramètres associés
* Notifications serveur -> client
* Routes client -> serveur
* API externes

Partie client de l'application :

* Type de page (même celles non accessibles via le menu) + Position dans le menu (optionnel)

## Modèle de données

* Le développeur défini son modèle de données métier sous forme d'entités.
* Au besoin, il peut créer ses types de champs pour les énumérations (numériques + string) et les objets JSON.

## Contextes

* Le développeur défini les contextes d'entités
* Ainsi qu'une fonction permettant de déterminer l'intersection entre deux contextes de même type
* On peut définir une fonction par type de contexte
* Mettre à disposition des fonctions standard : Toujours en intersection, Jamais en intersection, En intersection si tous les paramètres du contexte sont identiques, ...

## API de modification des données

* Fonctions de modification de données (le premier paramètre est toujours un objet transaction)

## Événements

* Liste d'événements pouvant être remontés du serveur vers le client
* Chaque type d'événement peut avoir ses propres paramètres

## Routes

* Liste des routes disponibles pour l'application (appelables depuis le client)
* Fonctions de permission liée à l'utilisateur et ses permissions

## API externe

* Liste d'API mises à disposition pour un appel externe (ex : curl)

## Pages

* Composants de pages

## Composants

* Composants spécifiques de l'application

# Ce qui n'est pas géré par le framework

* I18N
* Authentification autre que locale
* Base de données autre que PostgreSQL

