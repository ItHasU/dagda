# `@dagda/client`

Tout ce qui tourne dans le navigateur : le bootstrap de l'application
(`DagdaClient.start()`), la coquille SPA (menu, navigation, dialogues,
toasts, indicateur d'état), la classe de base des web components, le
générateur de formulaires, et les quatre écrans d'administration fournis
d'office (Préférences, Utilisateurs, Rôles, Paramètres). Il dépend de
`@dagda/shared` pour tout ce qui est typé côté contrat, et n'a lui-même
aucune dépendance vers `@dagda/server`.

## Carte du dossier

| `src/<dossier>` | Contenu |
|---|---|
| `app/` | Le bootstrap : `index.ts` (`DagdaClient.start()`), `dagda.ts` (`ClientDagda`, la variable `dagda` et `dagdaReady`), `model.ts` (`dagda.model`, les fonctions nommées agissant sur le modèle), `console.ts` (`window.dagda`), `brand.ts` (`BrandInfo`), `index.header.html` (gabarit des `<head>` injectés) |
| `pages/` | `abstract.page.element.ts` (`AbstractPageElement`), `handler.ts` (`PageHandler`), `menu.ts` (construction de l'arbre de menu), `router.ts` (deep-link par query string), `service.ts`, `defaults.ts` (les pages par défaut). Sous-dossiers `preferences/`, `users/`, `roles/`, `settings/` : les quatre écrans fournis d'office (voir plus bas) |
| `components/` | `abstract.webcomponent.ts` (`AbstractWebComponent`, `@Ref()`, `@Attribute()`) et les composants de la coquille : `app/` (`<dagda-app>`), `container/` (`<dagda-page-container>`, bascule paysage/portrait), `navbar/` (`<dagda-navbar>`), `login/` (`<dagda-login>`, badge de compte), `dialog/` (`<dagda-dialog-host>`, `openDialog()`), `toast/` (`<dagda-toast-host>`, `showToast()`), `status/` (`<dagda-status>`, indicateur de synchronisation) |
| `forms/` | Le générateur de formulaires (FEATURES §8.1) : `editors.ts` (`FieldEditorRegistry`, `defaultFieldEditors`), `defaults.ts` (`registerDefaultFieldEditors()`), `form.component.ts` (`<dagda-form>`), `editors/` (les éditeurs par défaut : texte, nombre, booléen, énumération) |
| `auth/` | `auth.service.ts` (`AuthServiceImpl`, `dagda.auth`), `directory.ts` (`UsersDirectory`, annuaire client des comptes), `service.ts` (type d'enregistrement du service) |
| `preferences/` | `directory.ts` (`PreferencesDirectory`, lecture synchrone après chargement), `service.ts` |
| `themes/` | `service.ts` (`ThemeRegistry`, `DAGDA_THEMES`), `boot.ts` (applique le thème mémorisé avant le premier rendu — importé en tout premier par `app/index.ts`) |
| `notification/` | `notification.impl.ts` (`ClientNotificationImpl`, le client WebSocket, reconnexion automatique) |
| `api/` | `index.ts` (`apiCall()`, l'appel typé `POST /<nom>`) |
| `actions/` | `index.ts` (`actionCall()`, l'appel typé `POST /actions/<nom>`) |
| `editor/` | `editor.component.ts` (`<dagda-code-editor>`, Monaco), `monaco.loader.ts` (chargement paresseux, hors bundle principal), `monaco.service.ts` (`loadExtraLibs()`, autocomplétion sur les `.d.ts` de l'application) |
| `gestures/` | `swipe.ts` (`attachSwipe()`, détection de swipe horizontal) |
| `styles/` | Le design system — feuilles, thèmes, polices, icônes. Voir son propre [README.md](src/styles/README.md), qui fait référence en matière de ton et de détail |
| `test/` | Réglages d'environnement pour les tests du framework lui-même sous DOM simulé (`matchmedia.setup.ts`, `storage.setup.ts`) — pas encore empaquetés pour l'usage d'une application (FEATURES §1, NEW) |
| `templates.d.ts` | `declare module "*.html"` — à copier dans tout paquet applicatif qui importe des gabarits de composant |

## Ce qu'une application en importe

### Démarrer l'application

```ts
// client/src/index.ts
import { APP_CONTEXT_ADAPTER } from "@dagda-app/shared/src/entities/contexts";
import { APP_MODEL } from "@dagda-app/shared/src/entities/model";
import { DagdaClient } from "@dagda/client/src/app";
import { ProjectsPage } from "./pages/projects/projects.page";

DagdaClient.start<ClientAppTypes>({
    title: "Mon application",
    model: APP_MODEL,
    contextAdapter: APP_CONTEXT_ADAPTER,
    brand: { label: "Mon application", icon: "ph-wrench" },
    sections: { demo: { label: "Démonstration", icon: "ph-flask", order: 1 } },
    pages: {
        projects: { title: "Projets", constructor: ProjectsPage, icon: "ph-folder", menu: { section: "demo", order: 1 } }
    }
});
```

`index.html` ne contient qu'un `<dagda-app></dagda-app>` — le framework
enregistre lui-même ses éléments personnalisés, plus la peine d'importer
`Navbar`/`PageContainer`/`EntitiesStatusComponent` pour effet de bord.

### Une page

```ts
// client/src/pages/projects/projects.page.ts
import { AbstractPageElement } from "@dagda/client/src/pages/abstract.page.element";
import { dagda } from "@dagda/client/src/app/dagda";
import template from "./projects.page.html";

export class ProjectsPage extends AbstractPageElement {
    constructor() { super({ template }); }
    protected override async _refresh(): Promise<void> {
        const handler = dagda.entities.getHandler();
        await handler.fetch({ type: "projects", options: {} });
        // ... rendu à partir de handler.getItems("projects")
    }
}
customElements.define("projects-page", ProjectsPage);
```

### Un composant

```ts
// client/src/components/project-card/project-card.component.ts
import { AbstractWebComponent, Attribute, Ref, NumberMarshaller } from "@dagda/client/src/components/abstract.webcomponent";
import template from "./project-card.component.html";

export class ProjectCard extends AbstractWebComponent {
    @Ref() private _title!: HTMLElement;
    @Attribute<number>({ marshaller: NumberMarshaller }) public projectId!: number;
    constructor() { super({ template }); }
    protected override async _refresh(): Promise<void> {
        this._title.textContent = `Projet #${this.projectId}`;
    }
}
customElements.define("project-card", ProjectCard);
```

Poser `element.projectId = 42` déclenche automatiquement `_refresh()`
(FEATURES §8, GUIDE.md §2.3).

### Le générateur de formulaires

```ts
import "@dagda/client/src/forms/form.component"; // enregistre <dagda-form>
```

```html
<dagda-form ref="form"></dagda-form>
```

```ts
this._form.setFields([
    { key: "name", type: EntitiesModel.type({ rawType: JSTypes.string }), label: "Nom", required: true },
    { key: "status", type: PROJECT_STATUS, label: "Statut" }, // PROJECT_STATUS est une EnumDefinition, rendu en <select>
]);
this._form.addEventListener("dagda-form-submit", (event) => {
    const values = (event as CustomEvent<FormSubmitDetail>).detail.values;
    // écrire values (paramètre, entité, appel d'action) reste au consommateur
});
```

`type` attend une définition de type résolue (`FieldTypeDefinition` ou
`EnumDefinition`, pas le nom du type sous forme de chaîne) — `SettingsPage`
(`pages/settings/settings.page.ts`) et `RolesPage`/`UsersPage` en sont les
exemples réels à suivre. `<dagda-form>` valide au submit et émet
l'événement — il n'écrit jamais lui-même la valeur quelque part
(FEATURES §8.1).

Les éditeurs des types de base sont déjà en place : le framework appelle
`registerDefaultFieldEditors()` au niveau module de `app/index.ts`, parce que
ses propres pages Utilisateurs et Rôles construisent des éditeurs et ne
peuvent pas dépendre de l'application pour ça. Une application n'a donc à
déclarer que ses **surcharges**, et elles gagnent : un module ES est évalué
avant le corps du module qui l'importe, donc les défauts sont posés avant que
le code applicatif ne tourne.

```ts
// Surcharger l'éditeur d'un type nommé du modèle — le motif de MQTTToolbox 2
import { defaultFieldEditors } from "@dagda/client/src/forms/editors";
defaultFieldEditors.registerForType("TIMESTAMP", () => new DateTimeFieldEditor());
```

### Dialogues et messages

```ts
import { openDialog } from "@dagda/client/src/components/dialog/dialog.component";
import { showToast } from "@dagda/client/src/components/toast/toast.component";

openDialog({ title: "Confirmer", body: someNode, actions: [{ label: "Supprimer", className: "btn-danger", onClick: async () => { /* ... */ } }] });
showToast("Enregistré.", "success");
```

## Ce qu'une application n'a jamais à écrire

- **La coquille SPA** : menu de navigation (paysage et portrait), zone de
  contenu, bascule déployé/rétracté, indicateur de statut, badge de
  compte — tout `<dagda-app>` (FEATURES §8, `specs/navigation.md`).
- **Les quatre écrans d'administration**, enregistrés automatiquement par
  `DagdaClient.start()` via `pages/defaults.ts` (`buildDefaultPages()`) :
  - `preferences` — `PreferencesPage`, la page « Préférences » (choix du
    thème aujourd'hui, sans permission requise) ;
  - `users` — `UsersPage`, gestion des comptes (`users.manage`) ;
  - `roles` — `RolesPage`, la matrice rôle × permission (`roles.manage`) ;
  - `settings` — `SettingsPage`, l'édition des paramètres système
    (`settings.manage`), incluse seulement si l'application déclare un
    `SettingsModel`.

  Une application qui déclare une page sous l'une de ces quatre clés dans
  `pages` de `DagdaClient.start()` **remplace** le défaut au lieu d'entrer
  en collision avec lui.
- **La console `window.dagda`** (FEATURES §11.2) : services, entités,
  `dagda.system.*` (actions du framework), `dagda.api.*` (actions de
  l'application), `dagda.model.*`, `dagda.help()` — installée par
  `DagdaClient.start()`.
- **Les thèmes standard** (`DAGDA_THEMES` — `nocturne`, `aurore`,
  `frenchy`) et leur bascule à chaud, la mémorisation par préférence, et
  le miroir pré-peinture qui évite le flash (`themes/boot.ts`).
- **Le cycle de vie des web components** : rendu du gabarit, coalescence
  des rafraîchissements, gestion des slots — `AbstractWebComponent`.
- **L'éditeur de code Monaco**, chargé à la demande hors du bundle
  principal, avec l'alignement automatique sur le thème clair/sombre de
  l'application (`<dagda-code-editor>`).
- **La détection de swipe** sur la zone de contenu (`attachSwipe`), déjà
  câblée par `PageContainer` — une page n'a qu'à écouter `dagda-swipe`.

## Pour aller plus loin

- FEATURES.md — §8 (client/UI), §8.1 (générateur de formulaires), §9
  (injection de services), §11.2 (API console).
- GUIDE.md — §2, « Partie *client* », pour la marche à suivre complète.
- [`src/styles/README.md`](src/styles/README.md) — le design system :
  classes, thèmes, polices, icônes, lint d'adhérence.
