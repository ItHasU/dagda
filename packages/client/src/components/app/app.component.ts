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

        // Opening a page is `Router`'s job now (ROADMAP tranche 4,
        // `DagdaClient.start()` calls `router.start()` before this first
        // draw) — deep link if the URL names one, the default page
        // otherwise. Nothing left to do here beyond rendering.
        await this._container?.refresh();
    }

}

customElements.define("dagda-app", DagdaApp);
