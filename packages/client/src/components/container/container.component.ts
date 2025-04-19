import { Dagda } from "../../app";
import { AbstractWebComponent, Ref } from "../abstract.webcomponent";

/** A container */
export class PageContainer extends AbstractWebComponent {

    @Ref()
    protected _pageContainer!: HTMLDivElement;

    constructor() {
        super({
            template: require("./container.component.html").default
        });
    }

    protected override async _init(): Promise<void> {
        // Register a callback to handle page changes
        Dagda.on("pageChanged", (event) => {
            if (this._pageContainer) {
                this._pageContainer.innerHTML = ""; // Clear the container
                this._pageContainer.appendChild(event.data.page); // Append the new page
            }
        });
    }

    protected override _refresh(): Promise<void> {
        // FIXME this._currentPage?.refresh();
        return Promise.resolve();
    }

}

customElements.define("page-container", PageContainer);