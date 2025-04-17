import { AppTypes } from "@dagda-app/shared/src/app/types";
import { AppContextAdapter } from "@dagda-app/shared/src/entities/contexts";
import { APP_MODEL } from "@dagda-app/shared/src/entities/model";
import { AbstractClientApp } from "@dagda/client/src/app";
import { AbstractPageElement } from "@dagda/client/src/app/abstract.page.element";
import { HelloPage } from "@dagda/client/src/app/hello/hello.page";
import { LoginComponent } from "@dagda/client/src/components/login/login.component";

LoginComponent;

export interface ClientAppTypes extends AppTypes {
    pages: {
        "hello": HelloPage;
    };
}

export class ClientApp extends AbstractClientApp<ClientAppTypes> {

    constructor() {
        super(APP_MODEL, new AppContextAdapter());
        this.registerPage("hello", HelloPage);
    }

    /** @inheritdoc */
    protected override _injectUserInfos(displayName: string, photoURL: string | null): void {
        const login = document.querySelector("login-component") as LoginComponent | null;
        if (login != null) {
            login.data = { displayName, photoURL };
            login.setAttribute("displayName", displayName);
            login.refresh();
        }
    }

    protected override _disposePage(page: AbstractPageElement<unknown>): void {
        // Dispose page
        if (page != null) {
            page.remove();
        }
    }

    protected override _injectPage(page: AbstractPageElement<unknown>): void {
        // Inject page
        const container = document.getElementById("pageContainer") as HTMLDivElement | null;
        if (container != null) {
            container.appendChild(page);
        }
    }

}