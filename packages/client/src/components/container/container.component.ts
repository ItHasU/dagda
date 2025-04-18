import { AbstractWebComponent } from "../abstract.webcomponent";

/** A container */
export class PageContainer extends AbstractWebComponent {

    constructor() {
        super({
            template: require("./container.component.html").default
        });

        this.classList.add("w-100", "h-100", "d-flex", "flex-column");
    }

    protected override async _init(): Promise<void> {
        // Register to APP to react on page change
    }

    protected override _refresh(): Promise<void> {
        // FIXME this._currentPage?.refresh();
        return Promise.resolve();
    }

}

customElements.define("page-container", PageContainer);