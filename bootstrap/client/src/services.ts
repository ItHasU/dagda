import { GoodbyePage } from "./pages/goodbye/goodbye.page";
import { HelloPage } from "./pages/hello/hello.page";
import { ProjectDetailPage } from "./pages/project-detail/project-detail.page";
import { ProjectsPage } from "./pages/projects/projects.page";
import { AppTypes } from "@dagda-app/shared/src/app/types";
import { AppModel } from "./model";

/**
 * The pages of the application.
 * Everything else — log, entities, notification — is registered by the
 * framework: those were its own implementations, and the application only ever
 * repeated the same wiring.
 */
export type AppPages = {
    "hello": HelloPage;
    "goodbye": GoodbyePage;
    /** Loads the `projects` context (ROADMAP tranche 5) */
    "projects": ProjectsPage;
    /** Loads `project`, the context with options (EurekAI risk #1) — not listed in the menu, see the page's own doc comment */
    "projectDetail": ProjectDetailPage;
};

/** The application's contract, `pages` included (FEATURES §0) */
export interface ClientAppTypes extends AppTypes {
    pages: AppPages;
    /** Named functions acting on the data model (FEATURES §11.2) — see `model.ts` */
    model: AppModel;
}
