import { Dagda } from "@dagda/shared/src/dagda";
import { Event } from "@dagda/shared/src/tools/events";
import { PageEvents } from "../../pages/handler";
import { PageService } from "../../pages/service";
import { AbstractWebComponent, Ref } from "../abstract.webcomponent";
import template from "./container.component.html";

/** A container */
export class PageContainer extends AbstractWebComponent {

    @Ref()
    protected _pageContainer!: HTMLDivElement;

    constructor() {
        super({
            template: template
        });
    }

    protected override async _init(): Promise<void> {
        await Dagda.loaded; // Wait for Dagda to be loaded
        // Register a callback to handle page changes
        Dagda.get<PageService>("pages").on("pageChanged", (event: Event<PageEvents["pageChanged"]>) => {
            if (this._pageContainer) {
                this._pageContainer.innerHTML = ""; // Clear the container
                this._pageContainer.appendChild(event.data.page); // Append the new page
            }
        });
    }

    protected override async _refresh(): Promise<void> {
        await Dagda.loaded; // Wait for Dagda to be loaded
        await Dagda.get<PageService>("pages").refresh();
    }

}

customElements.define("page-container", PageContainer);