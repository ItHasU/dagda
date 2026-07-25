# Spécification — Disposition de la SPA (menu + zone de contenu)

> Dérivé de la maquette `specs/disposition.pptx` (3 slides : paysage déployé,
> paysage rétracté, portrait fermé/ouvert). Précise FEATURES §8 — « SPA fournie
> clé en main : menu de navigation + zone de contenu » — pour les composants
> `PageContainer` et `Navbar`. Implémentation : ROADMAP tranche 1 (structure +
> disposition paysage), tranche 4 (disposition portrait + gestes mobiles).

## 1. Deux familles de disposition, pas un troisième thème

- **Paysage** → menu latéral, en colonne.
- **Portrait** → barre horizontale + tiroir déroulant.

La bascule entre les deux familles est pilotée par la forme de la fenêtre
(largeur/orientation), pas par un réglage utilisateur — à la différence du
thème (FEATURES §8), ce n'est pas un choix mémorisé. Seuil exact non fixé par
la maquette, cf. Questions ouvertes.

Dans les deux familles, chaque disposition a **deux états** : déployé
(labels visibles) et rétracté (icônes seules) en paysage ; ouvert et fermé en
portrait. Le principe commun : le menu ne doit jamais prendre plus de place
que nécessaire au détriment de la zone d'affichage des pages.

## 2. Structure commune aux deux familles

Quatre zones, présentes dans les deux familles sous une forme différente :

| Zone | Rôle | Paysage | Portrait |
|---|---|---|---|
| Marque | Identité de l'application | Haut de colonne, pleine ou compacte | Haut de barre, avec le déclencheur ☰ |
| Groupe primaire | Navigation applicative : sections (catégories, FEATURES §8) et leurs pages | Liste verticale, sous la marque | Panneau déroulant, révélé par ☰ |
| Groupe secondaire | Paramètres (avec Configuration / Préférences) et Utilisateur | Bas de colonne, ancré | Icônes en haut de barre, à droite |
| Zone de contenu | Rendu de la page courante | Occupe le reste de la largeur | Occupe le reste, sous la barre |

Le groupe secondaire n'est **jamais** mélangé au groupe primaire — deux listes
distinctes quelle que soit la disposition, pas un sous-menu commun.

## 3. Disposition paysage

### 3.1 État déployé

- Colonne pleine hauteur, largeur fixe, fond distinct de la zone de contenu.
- Marque en toutes lettres en tête de colonne.
- Groupe primaire : chaque section porte un badge rond (icône) + son libellé.
  Une section contenant des pages les affiche indentées sous elle pendant
  qu'elle est développée ; la page courante est marquée en gras souligné.
- Espace flexible entre les deux groupes : le groupe secondaire reste ancré en
  bas de colonne quelle que soit la longueur du groupe primaire.
- Groupe secondaire : entrée « Paramètres » avec ses deux enfants
  (Configuration, Préférences) toujours visibles, puis « Utilisateur » en
  dessous.
- Zone de contenu : occupe le reste de la largeur, coins arrondis, légère
  marge par rapport aux bords.

### 3.2 État rétracté (rail d'icônes)

- La colonne se réduit à la largeur des badges seuls ; tous les libellés
  disparaissent, y compris ceux des pages d'une section par ailleurs
  développée en état déployé.
- La marque se replie sur un rendu compact (pas une troncature du texte
  complet : un second rendu dédié, ex. sigle sur deux lignes) — implique que
  le composant Marque expose un mode compact, pas seulement un
  `overflow: hidden`.
- Le groupe secondaire suit la même règle : badges seuls, ancrés en bas.
- La zone de contenu récupère toute la largeur libérée.

## 4. Disposition portrait

### 4.1 Barre supérieure (commune aux deux états)

- Barre horizontale en tête d'écran : ☰ (déclencheur du panneau) + Marque à
  gauche ; icônes du groupe secondaire à droite.
- Le groupe secondaire migre du bas de colonne (paysage) vers le haut de
  barre (portrait) : en disposition horizontale, la notion de « bas de
  colonne ancré » n'existe plus.
- Zone de contenu : pleine largeur, sous la barre.

### 4.2 État fermé

- Seule la barre est visible ; la zone de contenu occupe tout le reste de
  l'écran.

### 4.3 État ouvert

- ☰ révèle un panneau qui **se superpose** au haut de la zone de contenu
  (overlay), ancré sous la marque — il ne redimensionne ni ne pousse la zone
  de contenu.
- Le panneau reprend le même contenu que le groupe primaire déployé en
  paysage : sections, pages indentées, page courante en gras souligné.
- Un overlay implique un moyen de le refermer autre que ☰ lui-même (clic
  hors panneau, sélection d'une page) — non représenté sur la maquette,
  cf. Questions ouvertes.

## 5. Comportements transverses

- **Page active** : une seule convention visuelle (gras + souligné),
  indépendante de la disposition — un seul état à calculer côté composant,
  deux rendus possibles.
- **Filtrage par permission** (FEATURES §7.1) s'applique identiquement aux
  quatre combinaisons disposition × état : un rail rétracté ne doit pas
  révéler par une icône seule une section par ailleurs interdite à
  l'utilisateur.
- **Menu piloté par une seule source** : la liste des pages enregistrées
  (FEATURES §12, `PageHandler`/`ApplicationPage` cible v2) — paysage et
  portrait, déployé et rétracté, sont quatre rendus du même arbre, jamais
  quatre déclarations séparées.

## 6. Composants concernés (FEATURES §8)

- **`<dagda-app>`** — **le seul élément que l'application écrit dans son
  `index.html`.** Il monte toute la coquille : disposition, `Navbar`, zone de
  contenu, groupe secondaire, indicateur d'état. Voir §6.1.
- **`PageContainer`** — porte la disposition (paysage/portrait) et son état
  (déployé/rétracté ou ouvert/fermé) ; orchestre `Navbar` et la zone de
  contenu. Interne à `<dagda-app>`.
- **`Navbar`** — rend le groupe primaire et le groupe secondaire à partir de
  l'arbre de menu, dans les quatre combinaisons ci-dessus. Interne.
- **Marque** — expose un rendu compact en plus du rendu complet. Interne.

### 6.1 `<dagda-app>` : un seul élément dans la page

L'`index.html` d'une application se réduit à :

```html
<body>
    <dagda-app></dagda-app>
</body>
```

Rien d'autre. Aujourd'hui l'application place elle-même `<page-container>` et
doit en plus référencer `Navbar`, `PageContainer` et `EntitiesStatusComponent`
depuis son `index.ts` pour forcer leur enregistrement — un effet de bord
d'import qui n'a aucune raison d'être le problème de l'application.

Conséquences à traiter en même temps :

- **Le framework enregistre ses propres éléments personnalisés.** Les lignes
  d'import « pour effet de bord » disparaissent des applications.
- **La composition de la coquille appartient au framework.** Une application ne
  choisit pas où va la barre ni où va l'indicateur d'état ; elle déclare ses
  pages (`DagdaClient.start`), le reste en découle.
- **Ce qu'il reste à trancher** : par quoi une application personnalise la
  marque et le groupe secondaire. Un attribut sur `<dagda-app>`, un paramètre de
  `DagdaClient.start()`, ou des `slot` nommés — les trois sont tenables, aucun
  n'est décidé. À régler avant d'écrire le composant, comme les trois questions
  ci-dessous l'ont été.

## 7. Hors de cette spec

- Le contenu rendu à l'intérieur de la zone de page (propre à chaque page).
- Les gestes tactiles (swipe entre pages) — fonctionnalité distincte
  (FEATURES §8, tranche 4) ; cette spec couvre la structure du menu, pas
  l'interaction gestuelle sur le contenu.
- Les valeurs visuelles (couleurs, espacements, rayons) — held par les
  jetons de thème (FEATURES §8, `dagda-ui.css`), pas par cette spec.

## Décisions prises (tranche 1)

Les trois questions qui bloquaient l'écriture de `Navbar` sont tranchées. Le
point commun des trois réponses : **aucun état de menu à conserver**. Le seul
état du composant est déployé/rétracté, et la seule chose à calculer au rendu
est la page active.

- **Déclencheur du rétracté en paysage** : **bascule manuelle mémorisée**,
  façon VS Code. Pas de seuil de largeur en paysage — le seuil ne sert qu'à
  choisir entre paysage et portrait. Le choix est rangé dans les préférences
  utilisateur (FEATURES §11.6, tranche 3) ; en attendant, miroir local, pour
  que l'état soit appliqué avant le premier rendu et n'affiche pas la colonne
  déployée le temps d'un aller-retour serveur.
- **Sections en colonne déployée** : **toujours toutes développées**. Pas de
  pliage, pas d'accordéon, pas d'auto-développement sur la page active — donc
  rien à mémoriser et rien à recalculer quand la page change. La maquette
  montrait la Section 1 sans ses pages ; on lit ça comme une section sans
  enfants, pas comme une section repliée.
- **Clic sur une icône de section en rail rétracté** : **navigation directe
  vers la première page** de la section. Aucun nouveau composant (ni flyout,
  ni redéploiement temporaire), et le contenu n'est jamais poussé puis remis
  en place.

  Limite assumée : les autres pages d'une section sont inatteignables tant que
  le rail est rétracté. C'est acceptable parce que le rétracté est désormais
  un choix explicite de l'utilisateur — il redéploie s'il a besoin de
  naviguer. À revoir si une application se retrouve avec beaucoup de sections
  à plusieurs pages.

## Questions ouvertes

- **Fermeture du panneau en portrait** : tap en dehors, deuxième tap sur ☰,
  sélection d'une page — probablement les trois, à confirmer. *Tranche 4.*
- **Seuil paysage / portrait** : largeur de bascule non fournie par la
  maquette (probablement dérivé des breakpoints déjà en usage côté design
  system plutôt qu'une valeur ad hoc — à vérifier au moment de l'implémenter).
  *Tranche 4.*
