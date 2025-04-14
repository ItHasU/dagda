import { AppTypes } from "@dagda-app/shared/src/app/types";
import { AbstractClientApp } from "@dagda/client/src/app";

export class ClientApp extends AbstractClientApp<AppTypes & { pageNames: "admin" }> {
    protected override _injectUserInfos(displayName: string, photoUrl: string | null): void {
        const userName = document.getElementById("userName") as HTMLSpanElement | null;
        const userPhoto = document.getElementById("userPhoto") as HTMLImageElement | null;
        if (userName != null) {
            userName.innerText = displayName;
        }
        if (userPhoto != null) {
            userPhoto.src = photoUrl || "";
            userPhoto.alt = displayName;
        }
    }
}