import { APP_CONTEXT_ADAPTER } from "@dagda-app/shared/src/entities/contexts";
import { APP_MODEL } from "@dagda-app/shared/src/entities/model";
import { APP_PERMISSIONS } from "@dagda-app/shared/src/permissions";
import { DagdaClient } from "@dagda/client/src/app";
import { ClientDagda } from "@dagda/client/src/app/dagda";
import { showToast } from "@dagda/client/src/components/toast/toast.component";
import { _setDagda, dagda } from "./dagda";
import { APP_MODEL_FUNCTIONS } from "./model";
import { GoodbyePage } from "./pages/goodbye/goodbye.page";
import { HelloPage } from "./pages/hello/hello.page";
import { ProjectDetailPage } from "./pages/project-detail/project-detail.page";
import { ProjectsPage } from "./pages/projects/projects.page";
import { ClientAppTypes } from "./services";

// No component imported for its side effect any more: the framework registers
// its own custom elements, and `index.html` is down to `<dagda-app>`
// (specs/navigation.md §6.1). The application's own elements are still
// imported by the page that uses them, not here.

DagdaClient.start<ClientAppTypes>({
    model: APP_MODEL,
    contextAdapter: APP_CONTEXT_ADAPTER,
    title: "Dagda",
    brand: {
        label: "Dagda",
        icon: "ph-wrench"
    },
    // Two pages under one section, so the boilerplate exercises the nesting
    // and not only the flat case: a click on a collapsed section badge, which
    // navigates to the first page, has nothing to act on otherwise.
    sections: {
        demo: { label: "Démonstration", icon: "ph-flask", order: 1 },
        data: { label: "Données", icon: "ph-folders", order: 2 }
    },
    pages: {
        hello: { title: "Hello", constructor: HelloPage, icon: "ph-hand-waving", menu: { section: "demo", order: 1 } },
        goodbye: { title: "Goodbye", constructor: GoodbyePage, icon: "ph-door-open", menu: { section: "demo", order: 2 } },
        projects: { title: "Projets", constructor: ProjectsPage, icon: "ph-folder", menu: { section: "data", order: 1 } },
        // No `menu` entry: reachable by navigation, never listed. A detail
        // page has no meaning without the project it is handed
        // (specs/navigation.md), so it is opened from a card in ProjectsPage.
        projectDetail: { title: "Projet", constructor: ProjectDetailPage, icon: "ph-folder-open" }
    },
    // Named functions acting on the data model (FEATURES §11.2). Spelled
    // `modelFunctions` because `model` above is already the entities model;
    // they are reached as `dagda.model.xxx(...)`, console included.
    modelFunctions: APP_MODEL_FUNCTIONS,
    // Only this application's own keys — DAGDA_PERMISSIONS is added by the
    // framework. This is what puts "Gérer les notes" in the Rôles matrix
    // next to the framework's own permissions (FEATURES §7.1).
    permissions: APP_PERMISSIONS,
    // Narrows the framework's `dagda` to this application's own types, so a
    // page fetching the `project` context gets its options checked at compile
    // time. An application with a *service* of its own returns a subclass
    // here instead — `bootstrap/server/src/dagda.ts` is that example.
    buildDagda: (params) => {
        const instance = new ClientDagda<ClientAppTypes>(params);
        _setDagda(instance);
        return instance;
    }
}).then(() => {
    // Subscribed once, here, rather than in ProjectDetailPage: `setPage()`
    // builds a new page instance on every visit and the notification service
    // has no unsubscribe, so a page-scoped listener would pile up one per
    // visit. The server only ever sends this to the project's owner
    // (FEATURES §6, recipient filtering) — there is nothing to filter again
    // on this side.
    dagda.notification.on("noteAdded", (event) => {
        // The payload travels in `event.data` — the listener is handed an
        // `Event<T>` wrapper, not the payload itself (`tools/events.ts`).
        showToast(`Note ajoutée : « ${event.data.text} » (${event.data.totalNotes} au total)`, "info");
        // The open page may be showing that very project; refreshing is
        // cheaper to reason about than working out whether it is.
        dagda.pages.refresh().catch(dagda.log.handleError);
    });
}).catch((err: unknown) => console.error("Dagda failed to start", err));
