import { AbstractWebComponent, Attribute, NumberMarshaller, Ref } from "@dagda/client/src/components/abstract.webcomponent";
import { PROJECT_STATUS } from "@dagda-app/shared/src/entities/model";
import { dagda } from "../../dagda";
import template from "./project-card.component.html";

/**
 * One project, as a component of its own rather than a row a page builds by
 * hand (FEATURES §8) — the natural example the boilerplate points to
 * (ROADMAP tranche 5): a web component, not a page, with a `@Ref()` for what
 * it draws and an `@Attribute()` for what it draws it *from*.
 *
 * Reads the entities cache directly rather than fetching on its own: a card
 * is placed by a page that has already fetched the `projects` (or `project`)
 * context, the same division of work `AbstractPageElement`'s own doc comment
 * describes for `_refresh()` — fetching stays the page's decision.
 */
export class ProjectCard extends AbstractWebComponent {

    @Ref()
    protected _title!: HTMLElement;
    @Ref()
    protected _status!: HTMLElement;
    @Ref("note-count")
    protected _noteCount!: HTMLElement;

    /**
     * Which project to show. Setting it refreshes the card on its own
     * (FEATURES §8, GUIDE.md §2.3) — a page swapping `element.projectId`
     * needs nothing else to redraw it.
     */
    @Attribute<number>({ name: "project-id", marshaller: NumberMarshaller })
    public projectId!: number | null;

    constructor() {
        super({ template });
    }

    protected override async _refresh(): Promise<void> {
        const id = this.projectId;
        const project = id == null ? undefined : dagda.entities.getHandler().getById("projects", id);
        this._title.textContent = project?.name ?? "Projet inconnu";
        this._status.textContent = project == null ? "" : (PROJECT_STATUS.getLabel(project.status) ?? "");
        const notes = id == null ? [] : dagda.entities.getHandler().getItems("notes").filter((note) => note.projectId === id);
        this._noteCount.textContent = `${notes.length} note(s)`;
    }

}

customElements.define("project-card", ProjectCard);
