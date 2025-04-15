import { AppTypes } from "@dagda-app/shared/src/app/types";
import { AbstractClientApp } from "@dagda/client/src/app";
import { AbstractPageElement } from "@dagda/client/src/app/abstract.page.element";

export class ClientApp extends AbstractClientApp<AppTypes> {

    /** @inheritdoc */
    protected override _injectUserInfos(displayName: string, photoUrl: string | null): void {
        const userName = document.getElementById("userName") as HTMLSpanElement | null;
        const userPhoto = document.getElementById("userPhoto") as HTMLImageElement | null;
        if (userName != null) {
            userName.innerText = displayName;
        }
        if (userPhoto != null) {
            userPhoto.src = photoUrl ?? "";
            userPhoto.classList.toggle("d-none", userPhoto == null);
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