import { Dagda } from "@dagda/shared/src/dagda";
import { DagdaEvents } from "@dagda/shared/src/notification/events";
import { NotificationService } from "@dagda/shared/src/notification/service";
import { Event } from "@dagda/shared/src/tools/events";
import { AbstractWebComponent, Attribute, NumberMarshaller, Ref } from "../abstract.webcomponent";

export const DEFAULT_SIZE = 32;

export interface LoginComponentData {
    displayName: string;
    photoURL: string | null;
}

export class LoginComponent extends AbstractWebComponent {

    @Attribute({ defaultValue: "true" })
    public rounded!: "true" | "false";

    @Attribute({ marshaller: NumberMarshaller, defaultValue: DEFAULT_SIZE })
    public size!: number;

    @Ref()
    protected _photo!: HTMLImageElement;
    @Ref()
    protected _link!: HTMLAnchorElement;

    constructor() {
        super({
            template: require("./login.component.html").default
        });
    }

    protected _data: DagdaEvents["userInfoChanged"] = {
        displayName: "Unknown"
    };

    protected override _init(): Promise<void> {
        Dagda<NotificationService<DagdaEvents>>("notification").on("userInfoChanged", (event: Event<DagdaEvents["userInfoChanged"]>) => {
            this._data = event.data;
            this.refresh();
        });
        return Promise.resolve();
    }

    protected override async _refresh(): Promise<void> {
        this._photo.style.maxWidth = `${this.size}px`;
        this._photo.style.maxHeight = `${this.size}px`;
        this._photo.classList.toggle("rounded-circle", this.rounded === "true");
        this._photo.src = this._data.photoURL ?? LoginComponent._getInitialsAsIconBase64(this._data.displayName, this.size);
        this._link.title = this._data.displayName;
    }

    protected static _getInitialsAsIconBase64(name: string, size: number): string {
        const initials = name
            .split(" ")
            .map(part => part.charAt(0).toUpperCase())
            .join("");

        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;

        const context = canvas.getContext("2d");
        if (context) {
            context.fillStyle = "#cccccc"; // Background color
            context.fillRect(0, 0, size, size);

            context.font = `${size / 2}px sans-serif`;
            context.fillStyle = "#ffffff"; // Text color
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(initials, size / 2, size / 2);

            return canvas.toDataURL();
        }
        return "";
    }
}

customElements.define("login-component", LoginComponent);