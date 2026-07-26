# Le design system de Dagda

Tout ce que l'interface d'une application Dagda utilise pour se peindre :
un vocabulaire de classes, un jeu de jetons par thème, les polices et les
icônes. Le tout est servi par le framework, sans CDN — une application Dagda
doit fonctionner sur un réseau sans Internet.

## Utilisation

```ts
import "@dagda/client/src/styles/index.css";
```

Un seul import. Il tire les quatre feuilles dans le bon ordre : les jetons,
puis les polices, puis les icônes, puis les règles.

```html
<button class="btn btn-primary">Publier</button>
<i class="ph ph-paper-plane-tilt" aria-hidden="true"></i>
```

> **Bootstrap est encore chargé.** `packages/client/src/app/index.ts` et
> `packages/client/src/pages/handler.ts` importent Bootstrap et
> bootstrap-icons, et les composants existants s'appuient sur ses classes.
> `index.css` n'est donc **pas** importé automatiquement : le faire
> appliquerait sur Bootstrap la remise à zéro de Nocturne (`body`, `*`, les
> titres) et changerait l'aspect des écrans en place. La bascule est un
> chantier à part entière — cf. la fin de ce fichier.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `index.css` | Le point d'entrée : quatre `@import`, rien d'autre |
| `themes.css` | **Les jetons.** Un bloc `[data-theme="…"]` par thème, tous dans ce fichier |
| `dagda-ui.css` | **Le vocabulaire de classes.** Aucune valeur en dur : uniquement des `var()` |
| `fonts.css` | Les `@font-face` du texte (Inter) |
| `icons.css` | Les `@font-face` des icônes (Phosphor, six graisses) et la table des glyphes |
| `fonts/` | Les fichiers `.woff2` embarqués |

La séparation est la raison d'être de l'ensemble : **`dagda-ui.css` ne bouge
plus**. Changer d'apparence, c'est écrire un jeu de jetons, jamais toucher une
règle. Les `@font-face` sont à part pour la même raison — ajouter une famille
ne doit pas obliger à rouvrir le vocabulaire.

## Les thèmes

Un thème est un jeu de jetons **complet**, jamais une surcharge partielle. Les
ombres de Nocturne, par exemple, sont accordées au fond : sur fond sombre,
c'est un liseré plus du noir ambiant, pas une ombre d'encre. Un thème clair qui
n'aurait redéfini que les couleurs hériterait d'une élévation calculée pour du
sombre.

Tous les thèmes vivent dans `themes.css`. Basculer, c'est poser
`data-theme="…"` sur l'élément racine : pas de feuille externe à charger, donc
ni clignotement ni échec de chargement. Les blocs ont la même spécificité,
c'est donc **l'ordre du fichier qui départage**. Le premier bloc s'applique
aussi à `:root` nu, ce qui en fait le thème par défaut ; tout thème ajouté doit
venir après lui.

Un seul thème existe aujourd'hui : `nocturne`, sombre. Le second arrive en
tranche 4, et c'est lui qui révélera les jetons oubliés.

### Ce qui a été hissé en jeton par rapport à Nocturne

- **La densité.** Nocturne livrait ses `--space-*` déjà multipliés par 0,7
  (`--space-3: 8.4px`). Ils s'expriment maintenant
  `calc(4px * var(--density) * 3)`, avec `--density: 0.7`. Les valeurs
  calculées sont identiques.
- **Le style de bouton.** Nocturne cuisait le contour dans la règle
  (`.btn-primary` = texte et bordure accent sur transparent). Le dessin passe
  par `--btn-primary-fg` / `-bg` / `-border` et leurs variantes `-hover` /
  `-active` — sans toucher `dagda-ui.css`. Nocturne est elle-même passée en
  aplat depuis (l'accent dans `--btn-primary-bg`, une couleur lisible dessus
  dans `--btn-primary-fg`, `transparent` dans `--btn-primary-border`) : un
  bouton contouré à côté d'un `.seg` — lui aussi contouré — se lisait comme
  deux boutons-poussoirs plutôt qu'une action et un choix.
- **Le reste des valeurs cuites** : échelle typographique, hauteurs de
  contrôle, épaisseurs de trait, longueur du dégradé de fin de filet, opacités
  d'état. C'est ce qui fait que le jeu de jetons est plus long que les
  « ~60 lignes » annoncées dans le ROADMAP : la contrainte « aucune valeur en
  dur dans `dagda-ui.css` » est plus exigeante que l'estimation.

Les `--radius-*` étaient déjà des variables chez Nocturne.

## Les polices

**Inter**, OFL 1.1. Reprise du CDN Google Fonts (v20), sur l'axe variable
`400..700` : un seul fichier par sous-ensemble couvre les quatre graisses que
`theme.json` réclame. Seuls `latin` et `latin-ext` sont embarqués —
l'internationalisation est hors périmètre (FEATURES §0).

Le repli `system-ui, sans-serif` reste déclaré dans `--font-heading` et
`--font-body` : si un fichier ne se charge pas, l'interface reste lisible.

Conséquence des thèmes : **chaque famille nommée par un thème doit être
embarquée ici**. Garder leur nombre bas.

## Les icônes

**Phosphor** 2.1.2, MIT. Six graisses déclarées, six `.woff2` embarqués ; le
navigateur ne télécharge que celle que le thème désigne.

Pas de composant : FEATURES §8 a écarté `<dagda-icon>`. L'usage est direct.

```html
<!-- Icône décorative : masquée au lecteur d'écran -->
<i class="ph ph-plug" aria-hidden="true"></i>

<!-- Bouton sans texte : le libellé est obligatoire -->
<button class="btn btn-icon" aria-label="Supprimer">
    <i class="ph ph-trash" aria-hidden="true"></i>
</button>
```

**La graisse est un jeton**, pas une classe : `--font-icon` nomme l'une des six
familles (`Phosphor-Thin`, `Phosphor-Light`, `Phosphor`, `Phosphor-Bold`,
`Phosphor-Fill`, `Phosphor-Duotone`) et tous les `.ph` suivent. C'est possible
parce que les cinq graisses de trait partagent la même table nom → glyphe : le
nom d'icône ne change jamais, seule la famille change.

**Duotone fait exception.** En amont, elle se rend en deux glyphes empilés
(`::before` + `::after`) avec sa propre table, qu'aucun jeton ne peut piloter.
La police est déclarée et embarquée, mais sa table appariée ne l'est pas : la
désigner dans `--font-icon` ne peindrait que la première couche. La rendre
utilisable demande de générer la table depuis `duotone/style.css` et de
l'activer élément par élément — laissé de côté tant que rien ne le réclame.

### Régénérer après une mise à jour de Phosphor

Le paquet npm `@phosphor-icons/web` **n'est pas une dépendance** (FEATURES §0) :
seuls ses fichiers ont été repris.

```bash
npm pack @phosphor-icons/web
tar xzf phosphor-icons-web-*.tgz
cp package/src/*/Phosphor*.woff2 packages/client/src/styles/fonts/
```

Puis reconstruire la table de `icons.css` depuis `package/src/regular/style.css` :
chaque `.ph.ph-NOM:before { content: "\eXXX" }` devient
`.ph-NOM::before { content: "\eXXX" }`. Le reste du fichier est écrit à la main.

## Le lint d'adhérence

```bash
npm run lint
```

Il refuse les hex bruts, les `px` bruts et les polices hors système dans le
code TypeScript, et tourne en intégration continue. Sa configuration est
`.oxlintrc.json` à la racine, dérivée du `_adherence.oxlintrc.json` livré dans
le bundle ; les règles elles-mêmes sont dans
`packages/build/oxlint-adherence.mjs`. Les deux fichiers expliquent en tête ce
qui a dû être adapté.

Ce qu'il ne voit pas : les fichiers `.css` et `.html`, qu'oxlint n'analyse pas.
Les feuilles de style sont gardées par la revue — la règle est que
`dagda-ui.css` ne contient aucune valeur littérale, et que le seul endroit où
un littéral a sa place est `themes.css`.

## Ce qu'il reste à faire

- **Sortir Bootstrap.** Les imports vivent dans
  `packages/client/src/app/index.ts` et `packages/client/src/pages/handler.ts`.
  Les composants du framework (`navbar`, `container`, `login`, `status`) et
  leurs gabarits emploient les classes Bootstrap ; il faut les retraduire vers
  le vocabulaire ci-dessus, puis remplacer les deux imports par `index.css` et
  retirer `bootstrap` et `bootstrap-icons` des dépendances de
  `packages/client/package.json`.
- **`login.component.ts`** peint un avatar sur un canvas avec deux gris en dur :
  il ignore le thème. C'est la seule exception au lint d'adhérence
  (`.oxlintrc.json`), à lever en lisant les jetons via `getComputedStyle`.
- **Second thème** (tranche 4), de polarité opposée : c'est lui qui dira quels
  jetons manquent.
