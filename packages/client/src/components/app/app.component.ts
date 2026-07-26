import { Dagda } from "@dagda/shared/src/dagda";
import { PageService } from "../../pages/service";
import { AbstractWebComponent } from "../abstract.webcomponent";
// Imported for their side effect — defining the custom elements. This is the
// one place in the codebase where such an import is right: the framework
// registers its own elements so applications no longer have to
// (`specs/navigation.md` §6.1). Every application used to repeat these four
// lines, for no reason of its own.
import "../container/container.component";
import "../dialog/dialog.component";
import "../login/login.component";
import "../navbar/navbar.component";
import "../status/status.component";
import "../toast/toast.component";
import { PageContainer } from "../container/container.component";

/**
 * The whole shell, and the only element an application writes in its
 * `index.html` (`specs/navigation.md` §6.1).
 *
 * ```html
 * <body>
 *     <dagda-app></dagda-app>
 * </body>
 * ```
 *
 * An application does not choose where the bar goes or where the status
 * indicator sits; it declares its pages and its brand through
 * `DagdaClient.start()`, and the rest follows.
 */
export class DagdaApp extends AbstractWebComponent {

    protected _container: PageContainer | null = null;

    constructor() {
        super({ template: "<dagda-page-container ref=\"container\"></dagda-page-container><dagda-toast-host></dagda-toast-host><dagda-dialog-host></dagda-dialog-host>" });
    }

    protected override async _refresh(): Promise<void> {
        this._container ??= this.querySelector<PageContainer>("dagda-page-container");

        // Open something. Until routing by URL exists (FEATURES §8), the first
        // entry of the menu is the landing page — an application that starts on
        // an empty content area looks broken, and every one of them would
        // otherwise write the same line.
        const pages = Dagda.get<PageService>("pages");
        if (pages.currentPageUID == null) {
            const first = pages.getDefaultPageUID();
            if (first != null) {
                await pages.setPage(first);
            }
        }

        await this._container?.refresh();
    }

}

customElements.define("dagda-app", DagdaApp);
