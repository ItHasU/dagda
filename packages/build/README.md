# `@dagda/build`

La chaîne de compilation partagée : les `tsconfig` de base, les
configurations webpack du client et du serveur, et le lint d'adhérence au
design system. Contrairement aux trois autres paquets, une application
n'importe rien de ce paquet dans son code — elle l'étend depuis sa
configuration (`tsconfig.json`, `webpack.config.js`, `.oxlintrc.json`), en
suivant `bootstrap/{client,server,shared}` comme référence. Il ne fournit
aucun runtime : rien d'ici ne finit dans le bundle livré au navigateur ou
exécuté par le serveur.

## Carte du dossier

| Fichier | Rôle |
|---|---|
| `tsconfig-base.json` | Le socle TypeScript commun : `strict`, `ES2024`, décorateurs expérimentaux (`experimentalDecorators`, `useDefineForClassFields: false`, requis pour `@Ref()`/`@Attribute()`), `module: "commonjs"` |
| `tsconfig-client.json` | Étend `tsconfig-base.json` : `lib` avec `DOM`, et surtout `module: "esnext"` / `moduleResolution: "bundler"` — un `import()` dynamique doit rester une vraie syntaxe pour que webpack le découpe en chunk séparé (c'est ce qui garde Monaco hors du bundle principal) |
| `tsconfig-server.json` | Étend `tsconfig-base.json` : `lib` sans `DOM`, `types: ["node"]` |
| `webpack-client.config.js` | Exporte une fonction `(dirname, entry?, assets?)` : `ts-loader` avec `projectReferences: true`, `html-loader` pour les gabarits de composant, chargement des polices/icônes en `asset/resource`, `TsconfigPathsWebpackPlugin` pour les alias de chemins, et branchement conditionnel de `monaco-editor-webpack-plugin` — absent si l'application n'a jamais installé Monaco, ce n'est pas un échec de build |
| `webpack-server.config.js` | Exporte une fonction `(dirname, entry?, node_modules?)` : `target: "node"`, externalise automatiquement les dépendances déclarées par le `package.json` du paquet buildé (pour qu'elles restent résolues depuis son propre `node_modules` à l'exécution) tout en embarquant celles atteintes *à travers* un paquet local du monorepo — une application qui référence le framework depuis un autre dépôt ne peut pas résoudre les dépendances du framework autrement |
| `oxlint-adherence.mjs` | Le plugin oxlint qui implémente les trois règles d'adhérence (hex bruts, `px` bruts, polices hors système) — voir plus bas |
| `package.json` | Nom du paquet (`@dagda/build`) et ses propres `devDependencies` (`copy-webpack-plugin`) ; ne déclare aucun `main` ni `exports`, les fichiers ci-dessus sont référencés par leur chemin direct |

## Ce qu'une application en étend

### TypeScript

```json
// shared/tsconfig.json
{
    "extends": "@dagda/build/tsconfig-base.json",
    "compilerOptions": { "baseUrl": ".", "outDir": "./.tsc-build/" },
    "include": ["./src/**/*.ts"],
    "references": [{ "path": "../../packages/shared" }]
}
```

```json
// client/tsconfig.json
{
    "extends": "@dagda/build/tsconfig-client.json",
    "compilerOptions": { "baseUrl": ".", "outDir": "./.tsc-build/" },
    "include": ["./src/**/*.ts"],
    "references": [
        { "path": "../shared" },
        { "path": "../../packages/shared" },
        { "path": "../../packages/client" }
    ]
}
```

Le paquet serveur suit le même patron avec `tsconfig-server.json` et une
référence vers `../../packages/server`. Chaque `tsconfig.json` applicatif
n'ajoute que `baseUrl`/`outDir`/`include`/`references` — jamais de nouvelle
règle de compilation, qui appartient au socle partagé.

### webpack

```js
// client/webpack.config.js
module.exports = require("@dagda/build/webpack-client.config")(__dirname);
```

```js
// server/webpack.config.js
module.exports = require("@dagda/build/webpack-server.config")(__dirname, "./src/main.ts");
```

Une application n'a jamais de configuration webpack à elle : elle appelle
la fonction exportée avec son propre `__dirname` (et, côté serveur, le
chemin de son point d'entrée).

### Le lint d'adhérence

Une application n'importe pas `oxlint-adherence.mjs` directement — elle
écrit un `.oxlintrc.json` à sa racine qui le référence comme `jsPlugins`,
sur le modèle du `.oxlintrc.json` racine de ce dépôt :

```json
{
  "jsPlugins": ["./node_modules/@dagda/build/oxlint-adherence.mjs"],
  "rules": { "adherence/design-system": "warn" }
}
```

## Ce qu'une application n'a jamais à écrire

- Les options de compilation TypeScript elles-mêmes (cible, résolution de
  modules, décorateurs, `strict`) : un `tsconfig.json` applicatif ne fait
  qu'étendre l'un des trois socles et ajouter ses propres chemins.
- La configuration webpack : chargement des `.html` comme gabarits, des
  polices/icônes comme ressources, résolution des alias de `tsconfig`,
  découpage en chunk de Monaco — tout est dans `webpack-client.config.js`.
- Le calcul des dépendances à externaliser du bundle serveur (`pg`, `ws`,
  leurs éventuels modules natifs optionnels) — déduit automatiquement du
  `package.json` du paquet serveur applicatif par `webpack-server.config.js`.
- Les trois règles du lint d'adhérence (hex, `px`, police hors système) :
  écrites une fois dans `oxlint-adherence.mjs`, appliquées par chaque
  application via son propre `.oxlintrc.json`.

## Pour aller plus loin

- FEATURES.md — §1 (« Structure & outillage »), pour la place de ce
  paquet dans le monorepo et l'historique de la migration Bootstrap →
  Nocturne qui explique le lint d'adhérence.
- [`packages/client/src/styles/README.md`](../client/src/styles/README.md)
  — le détail du lint d'adhérence côté design system (ce qu'il voit, ce
  qu'il ne voit pas : `.css`/`.html`).
- Le `README.md` racine — la table des commandes (`npm run build`,
  `npm run lint`, `npm run typecheck`) qui invoque cette chaîne de
  compilation sur l'ensemble du monorepo.
