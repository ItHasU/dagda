# dagda

Dagda is a simple full stack Typescript framework for prototyping.
DO NOT use this in production.

- [FEATURES.md](FEATURES.md) — what the framework does.
- [ROADMAP.md](ROADMAP.md) — in which order it gets built.
- [GUIDE.md](GUIDE.md) — how to turn `bootstrap/` into an application.
- [packages/client/src/styles/README.md](packages/client/src/styles/README.md) —
  the design system: classes, themes, fonts and icons.

## Développer

Prérequis : Node 24 ou plus récent, et Docker pour la base de données.

```bash
npm install
cp .env.example .env      # PORT, BASE_URL, DB_URL
npm run dev               # base + compilation continue + serveur qui redémarre
```

`npm run dev` démarre PostgreSQL, lance webpack en mode surveillance sur le
client et le serveur, et redémarre le serveur à chaque reconstruction. Le
navigateur, lui, n'est pas rechargé automatiquement : il faut rafraîchir la page.

| Commande | Effet |
|---|---|
| `npm run build` | Compile tous les paquets et l'application `bootstrap/` |
| `npm run typecheck` | Vérifie le typage, tests et parcours compris |
| `npm run lint` | Lint d'adhérence au design system (hex, `px` et polices en dur) |
| `npm test` | Tests unitaires (Vitest) |
| `npm run test:watch` | Idem, en surveillance |
| `npm run test:e2e` | Parcours de bout en bout (Playwright) |
| `npm run db:up` / `db:down` | Démarre / arrête PostgreSQL |

## Tester

Les tests sont à trois niveaux :

- **`shared`** — modèle, cache, transactions. Aucune dépendance externe.
- **`client`** — composants pris isolément, sous DOM simulé.
- **`server`** — dont les tests qui parlent à une **vraie base PostgreSQL**.

Les tests serveur ont besoin de la base démarrée par `npm run db:up`. Sans elle
ils sont ignorés, avec un avertissement. En intégration continue la variable
`DAGDA_REQUIRE_DB=1` transforme cet évitement en échec, pour qu'une fixture
cassée ne passe pas pour une suite verte.

Chaque suite qui touche la base travaille dans un schéma PostgreSQL qui lui est
propre, créé et détruit autour d'elle : deux suites en parallèle ne se voient pas.
