import { CallOptions } from "@dagda/client/src/api";
import { SystemGetInfoAPI, SystemInfo } from "@dagda/shared/src/api/impl/system.api";
import { BaseAppTypes } from "@dagda/shared/src/app/types";
import "bootstrap";
import "bootstrap-icons/font/bootstrap-icons.css";
import "bootstrap/dist/css/bootstrap.css";
import Handlebars from "handlebars";
import { apiCall } from "../api";

export class AbstractClientApp<AppTypes extends BaseAppTypes & { pageNames: string }> {

    constructor() {
        this._injectHeaders();
    }

    protected _injectHeaders(): void {
        const headersTemplate = Handlebars.compile(require("./index.header.html").default);
        const headers = headersTemplate({
            title: "Dagda"
        });
        document.head.insertAdjacentHTML("beforeend", headers);
    }

    public getSystemInfo(): Promise<SystemInfo> {
        return apiCall<SystemGetInfoAPI<CallOptions<[], SystemInfo>>, "getSystemInfo", [], SystemInfo>("getSystemInfo", {});
    }
}


// class App {

//     protected readonly _pageDiv: HTMLDivElement;
//     protected readonly _statusPlaceholder: HTMLSpanElement;

//     protected _currentPage: AbstractPageElement | null = null;

//     protected _lastRefreshed: DOMHighResTimeStamp | null = null;

//     constructor() {
//         // -- SQLHandler --
//         this._statusPlaceholder = document.getElementById("statusPlaceholder") as HTMLSpanElement;
//         this._statusPlaceholder.append(new SQLStatusComponent(StaticDataProvider.entitiesHandler));
//         this._statusPlaceholder.addEventListener("click", async () => {
//             StaticDataProvider.entitiesHandler.markCacheDirty();
//             if (this._currentPage) {
//                 await this._currentPage.refresh();
//             }
//         });

//         // -- Bind lock button --
//         const lockButton = document.getElementById("lockButton");
//         if (lockButton) {
//             lockButton.addEventListener("click", () => this._toggleLocked());
//         }
//         // -- Bind pages --
//         this._pageDiv = document.getElementById("pageDiv") as HTMLDivElement;
//         this._bindPage("projectsButton", ProjectsPage);
//         this._bindPage("maintenanceButton", MaintenancePage);

//         this.setPage(ProjectsPage);

//         // -- Auto-lock on inactivity --
//         // Wait for next frame animation and if delta is > to 5 seconds, lock
//         const step = (timestamp: DOMHighResTimeStamp) => {
//             if (this._lastRefreshed == null || (timestamp - this._lastRefreshed) > 5000) {
//                 this._toggleLocked(true);
//             }
//             this._lastRefreshed = timestamp;
//             window.requestAnimationFrame(step);
//         }
//         window.requestAnimationFrame(step);

//         // -- Notification helper --
//         NotificationHelper.set(new ClientNotificationImpl());

//         // -- Generation display --
//         const generationSpan = document.getElementById("generationSpan");
//         const generationCount = document.getElementById("generationCount");
//         if (generationSpan && generationCount) {
//             let previousCount = 0;
//             NotificationHelper.on<AppEvents>("generating", (event) => {
//                 generationSpan.classList.toggle("d-none", event.data.count === 0);
//                 generationCount.innerText = "" + event.data.count;
//                 if (previousCount != 0 && event.data.count === 0) {
//                     showNotificationIfPossible({
//                         body: `All images generated`
//                     });
//                     previousCount = 0;
//                 }
//                 previousCount = event.data.count;
//             });
//         }
//     }

//     protected _bindPage(buttonId: string, pageConstructor: PageConstructor): void {
//         const button = document.getElementById(buttonId);
//         if (button) {
//             button.addEventListener("click", this.setPage.bind(this, pageConstructor));
//         } else {
//             console.error(`Button ${buttonId} not found, cannot bind page`);
//         }
//     }

//     public setPage(pageConstructor: PageConstructor): void {
//         // -- Empty page --
//         this._pageDiv.innerHTML = "";
//         // -- Create page --
//         this._currentPage = new pageConstructor();
//         this._pageDiv.appendChild(this._currentPage);
//         this._currentPage.refresh(); // Catched by the page
//     }

//     public refresh(): void {
//         this._currentPage?.refresh();
//     }

//     protected _toggleLocked(locked?: boolean): void {
//         document.body.classList.toggle("locked", locked);
//     }

// }
