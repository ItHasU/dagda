import { apiCall } from "@dagda/client/src/api";
import { Ref } from "@dagda/client/src/components/abstract.webcomponent";
import { showToast } from "@dagda/client/src/components/toast/toast.component";
// Side-effect import: registers the "dagda-form" custom element (FEATURES
// §8.1) — the template's <dagda-form> tag renders as nothing without it.
import "@dagda/client/src/forms/form.component";
import { DagdaForm, FormSubmitDetail } from "@dagda/client/src/forms/form.component";
import { AbstractPageElement } from "@dagda/client/src/pages/abstract.page.element";
import { EntitiesModel } from "@dagda/shared/src/entities/model";
import { JSTypes } from "@dagda/shared/src/entities/tools/javascript.types";
import { asNamed } from "@dagda/shared/src/entities/tools/named";
import { FormFieldDeclaration } from "@dagda/shared/src/forms/types";
import { AppAPI } from "@dagda-app/shared/src/api";
import { ProjectEntity, UserId } from "@dagda-app/shared/src/entities/types";
import { dagda } from "../../dagda";
import "../../components/project-card/project-card.component";
import { ProjectCard } from "../../components/project-card/project-card.component";
import template from "./projects.page.html";

const TEXT_TYPE = EntitiesModel.type({ rawType: JSTypes.string });

/**
 * The projects of the connected account (ROADMAP tranche 5): the boilerplate's
 * "list" page, loading the `projects` context and rendering one `<project-card>`
 * per row instead of a hand-built `<tr>` — the component is the reusable unit,
 * this page is only responsible for fetching and laying them out.
 *
 * Its form doubles as the client-side proof of EurekAI risk #2 (ROADMAP
 * tranche 2): submitting it creates a project *and* its first note in one
 * transaction (`dagda.model.createProject`, see `../../model.ts`), which is
 * the client-side counterpart to what `bootstrap/server/src/app.spec.ts`
 * already proves server-side.
 */
export class ProjectsPage extends AbstractPageElement {

    @Ref()
    protected _count!: HTMLElement;
    @Ref()
    protected _cards!: HTMLElement;
    @Ref()
    protected _form!: DagdaForm;

    constructor() {
        super({ template });
    }

    protected override async _init(): Promise<void> {
        this._form.setFields(this._formFields());
        this._form.addEventListener("dagda-form-submit", (event) => {
            const values = (event as CustomEvent<FormSubmitDetail>).detail.values;
            this._createProject(values).catch((err: unknown) => showToast(err instanceof Error ? err.message : String(err)));
        });

        // Delegated rather than one listener per card: cards come and go on
        // every refresh, a single listener on the container never needs
        // rewiring.
        this._cards.addEventListener("click", (event) => {
            const card = (event.target as HTMLElement).closest("project-card");
            const id = card?.getAttribute("project-id");
            if (id == null) {
                return;
            }
            dagda.pages.setPage("projectDetail", { "project-id": id }).catch(dagda.log.handleError);
        });
    }

    protected _formFields(): FormFieldDeclaration[] {
        return [
            { key: "name", type: TEXT_TYPE, label: "Nom du projet", required: true },
            { key: "note", type: TEXT_TYPE, label: "Première note", required: true }
        ];
    }

    protected override async _refresh(): Promise<void> {
        const entities = dagda.entities;
        await entities.getHandler().fetch({ type: "projects", options: {} });

        const projects = entities.getHandler().getItems("projects");
        this._cards.replaceChildren();
        for (const project of projects) {
            const card = document.createElement("project-card") as ProjectCard;
            card.projectId = project.id;
            this._cards.appendChild(card);
        }

        await this._refreshCount();
    }

    /**
     * `countProjects` (ROADMAP tranche 5): the applicative API route with a
     * *parameterized* permission — any account may call it, only for its own
     * id (`bootstrap/server/src/app.ts`'s `isOwnAccount`). A route call, not
     * an entity fetch, so a failure here is the `apiCall`/`showToast` path
     * (FEATURES §5), distinct from the entities cache's own error handling.
     */
    protected async _refreshCount(): Promise<void> {
        const user = dagda.auth.currentUser;
        if (user == null) {
            this._count.textContent = "";
            return;
        }
        try {
            const count = await apiCall<AppAPI, "countProjects">("countProjects", {}, { userId: asNamed<"USER_ID", number>(user.id) });
            this._count.textContent = `${count} projet(s)`;
        } catch (err) {
            showToast(err instanceof Error ? err.message : String(err));
        }
    }

    protected async _createProject(values: Record<string, unknown>): Promise<void> {
        const user = dagda.auth.currentUser;
        if (user == null) {
            showToast("Compte inconnu : impossible de créer un projet.");
            return;
        }
        const name = String(values["name"] ?? "").trim();
        const note = String(values["note"] ?? "").trim();
        const userId = asNamed<"USER_ID", number>(user.id) as UserId;
        const created = await dagda.model.createProject(userId, name, note) as { project: ProjectEntity };
        showToast(`Projet « ${name} » créé.`, "success");
        await dagda.pages.setPage("projectDetail", { "project-id": String(created.project.id) });
    }

    /** Nothing to release */
    public override dispose(): Promise<void> {
        return Promise.resolve();
    }

}

customElements.define("projects-page", ProjectsPage);
