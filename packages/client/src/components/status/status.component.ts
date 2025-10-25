import { Dagda } from "@dagda/shared/src/dagda";
import { EntitiesEvents } from "@dagda/shared/src/entities/events";
import { EntitiesService } from "@dagda/shared/src/entities/service";
import { DagdaEvents } from "@dagda/shared/src/notification/events";
import { NotificationService } from "@dagda/shared/src/notification/service";
import { Event } from "@dagda/shared/src/tools/events";
import { LogService } from "@dagda/shared/src/tools/log";
import { AbstractWebComponent, Ref } from "../abstract.webcomponent";

/** 
 * A simple component to display communication status of the SQLHandler.
 * This component cannot be inserted in HTML as it requires and handler at construction.
 */
export class EntitiesStatusComponent extends AbstractWebComponent {

    @Ref()
    protected _downloadIcon!: HTMLElement;
    @Ref()
    protected _uploadIcon!: HTMLElement;
    @Ref()
    protected _uploadCountSpan!: HTMLSpanElement;
    @Ref()
    protected _refreshIcon!: HTMLElement;
    @Ref()
    protected _disconnectedIcon!: HTMLElement;

    protected _state: EntitiesEvents["state"] = {
        downloading: 0,
        uploading: 0,
        dirty: false
    };

    constructor() {
        super({
            template: require("./status.component.html").default
        });
    }

    protected override async _init(): Promise<void> {
        // -- Register the handler --
        try {
            Dagda<EntitiesService<any, any>>("entities").getHandler().on("state", (event: Event<EntitiesEvents["state"]>) => {
                this._state = event.data;
                this.refresh().catch(Dagda<LogService>("log").handleError);
            });
        } catch (e) {
            Dagda<LogService>("log").handleError(e);
        }
        Dagda<NotificationService<DagdaEvents>>("notification").on("connected", (event) => {
            this._disconnectedIcon.classList.toggle("d-none", !!event.data);
        });
    }

    protected override async _refresh(): Promise<void> {
        this._downloadIcon.classList.toggle("d-none", this._state.downloading === 0);
        this._uploadIcon.classList.toggle("d-none", this._state.uploading === 0);
        this._uploadCountSpan.classList.toggle("d-none", this._state.uploading < 2);
        this._uploadCountSpan.innerHTML = "" + this._state.uploading;
        this._refreshIcon.classList.toggle("text-danger", this._state.dirty);
        if (this._state.dirty) {
            this._refreshIcon.parentElement?.parentElement?.animate([
                { transform: "scale(1)" },
                { transform: "scale(1.2)" },
                { transform: "scale(1)" },
            ], {
                duration: 200,
                iterations: 1
            }).play();
        }
    }
}

customElements.define("entities-status", EntitiesStatusComponent);