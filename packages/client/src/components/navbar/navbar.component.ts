import { PageService } from "@dagda/client/src/pages/service";
import { Dagda } from "@dagda/shared/src/dagda";
import { AbstractWebComponent, Ref } from "../abstract.webcomponent";

export class Navbar extends AbstractWebComponent {

    @Ref()
    protected _pageMenu!: HTMLDivElement;

    constructor() {
        super({
            template: require("./navbar.component.html").default
        });
    }

    protected async _refresh(): Promise<void> {
        const pageService = Dagda<PageService>("pages");

        // Populate the menu with all pages
        this._pageMenu.innerHTML = ""; // Clear the menu
        const currentPageUID = pageService.currentPageUID;
        for (const pageInfo of pageService.getPageInfos()) {
            const item = document.createElement("li");
            this._pageMenu.appendChild(item);

            item.className = "nav-item";
            item.innerHTML = `<a class="nav-link ${currentPageUID === pageInfo.uid ? "active" : ""}" data-page="${pageInfo.uid}">${pageInfo.title}</a>`;
            this._pageMenu.appendChild(item);
            item.addEventListener("click", async () => {
                if (pageService.currentPageUID === pageInfo.uid) {
                    // Just refresh the page
                    pageService.refresh();
                } else {
                    // Set the page
                    try {
                        await pageService.setPage(pageInfo.uid);
                        this.refresh();
                    } catch (err) {
                        console.error("Error while setting page", err);
                    }
                }
            });
        }
    }

}

customElements.define("app-navbar", Navbar);