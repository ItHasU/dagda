import { contentUrl } from "@dagda/client/src/api/content";
import { Attribute, NumberMarshaller, Ref } from "@dagda/client/src/components/abstract.webcomponent";
import { showToast } from "@dagda/client/src/components/toast/toast.component";
import { AbstractPageElement } from "@dagda/client/src/pages/abstract.page.element";
import { asNamed } from "@dagda/shared/src/entities/tools/named";
import { PROJECT_STATUS } from "@dagda-app/shared/src/entities/model";
import { dagda } from "../../dagda";
import template from "./project-detail.page.html";

/**
 * One project, in full: its own fields plus its notes — the boilerplate's
 * "detail" page, and the one that loads the `project` context (ROADMAP
 * tranche 5, EurekAI risk #1: the context *with options*). Reached from a
 * click on a `<project-card>` in `ProjectsPage`, never listed on its own —
 * a page registered without a `menu` entry is reachable without being an
 * entry (Dagda `specs/navigation.md`), same posture MQTTToolbox2's
 * `TopicHistoryPage` takes. The project id travels as an HTML attribute,
 * set by `PageHandler.setPage()`, read back with `@Attribute()` — the
 * framework's one mechanism for a typed, observable value on a page,
 * doubling as navigation parameter.
 *
 * It does not itself subscribe to "noteAdded" (ROADMAP tranche 5, FEATURES
 * §6): `PageHandler.setPage()` builds a *new* instance of this class on
 * every visit, and the notification service has no unsubscribe — a
 * page-scoped `.on()` here would pile up one listener per visit, forever.
 * The subscription lives once, at bootstrap, in `index.ts`, and calls
 * `dagda.pages.refresh()` when this page happens to be the one open for the
 * project that changed — see it there for the reasoning.
 */
export class ProjectDetailPage extends AbstractPageElement {

    @Attribute({ name: "project-id", marshaller: NumberMarshaller })
    protected _projectId!: number | null;

    @Ref()
    protected _back!: HTMLButtonElement;
    @Ref()
    protected _title!: HTMLHeadingElement;
    @Ref()
    protected _status!: HTMLElement;
    @Ref()
    protected _description!: HTMLElement;
    @Ref()
    protected _cover!: HTMLImageElement;
    @Ref()
    protected _notes!: HTMLUListElement;

    constructor() {
        super({ template });
    }

    protected override async _init(): Promise<void> {
        this._back.addEventListener("click", () => {
            dagda.pages.setPage("projects").catch(dagda.log.handleError);
        });
    }

    protected override async _refresh(): Promise<void> {
        const id = this._projectId;
        if (id == null) {
            // Reached with no project — e.g. `dagda.pages.setPage()` called
            // from the console (FEATURES §11.2) — nothing to fetch.
            this._title.textContent = "Projet inconnu";
            this._status.textContent = "";
            this._description.textContent = "";
            this._cover.removeAttribute("src");
            this._notes.replaceChildren();
            return;
        }

        const entities = dagda.entities;
        try {
            // One context, two tables: the server pairs a project with its
            // notes in the same round trip (`ServerApp._fetch()`), so there
            // is only ever one fetch to await here.
            await entities.getHandler().fetch({ type: "project", options: { projectId: asNamed(id) } });
        } catch (err) {
            showToast(err instanceof Error ? err.message : String(err));
            return;
        }

        const project = entities.getHandler().getById("projects", id);
        this._title.textContent = project?.name ?? `Projet #${id}`;
        this._status.textContent = project == null ? "" : (PROJECT_STATUS.getLabel(project.status) ?? "");
        this._description.textContent = project?.description ?? "";
        // Not through the entities cache (ROADMAP tranche 5): the browser
        // fetches this itself, with its own conditional GET / 304 dance
        // against `contentRegister`'s route — nothing here to await.
        this._cover.src = contentUrl("projectCover", id);

        const notes = entities.getHandler().getItems("notes").filter((note) => note.projectId === id);
        this._notes.replaceChildren();
        for (const note of notes) {
            const item = document.createElement("li");
            item.textContent = note.text;
            this._notes.appendChild(item);
        }
    }

    /** Nothing to release */
    public override dispose(): Promise<void> {
        return Promise.resolve();
    }

}

customElements.define("project-detail-page", ProjectDetailPage);
