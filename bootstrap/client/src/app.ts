import { AppTypes } from "@dagda-app/shared/src/app/types";
import { AbstractClientApp } from "@dagda/client/src/app";
import { AbstractPageElement } from "@dagda/client/src/app/abstract.page.element";
import { LoginComponent } from "@dagda/client/src/components/login/login.component";

LoginComponent;

export class ClientApp extends AbstractClientApp<AppTypes> {

    /** @inheritdoc */
    protected override _injectUserInfos(displayName: string, photoUrl: string | null): void {
        const login = document.querySelector("login-component") as LoginComponent | null;
        if (login != null) {
            login.setAttribute("displayName", displayName);
            login.setAttribute("photo", photoUrl ?? "");
            login.refresh();
        }
    }

    protected override _disposePage(page: AbstractPageElement): void {
        // Dispose page
        if (page != null) {
            page.remove();
        }
    }

    protected override _injectPage(page: AbstractPageElement): void {
        // Inject page
        const container = document.getElementById("pageContainer") as HTMLDivElement | null;
        if (container != null) {
            container.appendChild(page);
        }
    }
}