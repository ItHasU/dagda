import { AuthEvents } from "@dagda/shared/src/auth/events";
import { UserInfo } from "@dagda/shared/src/auth/types";
import { Dagda } from "@dagda/shared/src/dagda";
import { NotificationService } from "@dagda/shared/src/notification/service";
import { Event } from "@dagda/shared/src/tools/events";
import { AbstractWebComponent, Attribute, NumberMarshaller, Ref } from "../abstract.webcomponent";
import template from "./login.component.html";

export const DEFAULT_SIZE = 32;

/**
 * The badge of the current account, and the way out (FEATURES §8).
 *
 * Local accounts carry no photo — there is no provider to get one from — so the
 * avatar is drawn from the initials. That is a feature, not a stopgap: it never
 * fails to load and never leaks a request to a third party.
 */
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
            template: template
        });
    }

    protected _user: UserInfo | null = null;

    protected override _init(): Promise<void> {
        Dagda.get<NotificationService<AuthEvents>>("notification").on("userInfoChanged", (event: Event<UserInfo>) => {
            this._user = event.data;
            this.refresh();
        });
        return Promise.resolve();
    }

    protected override async _refresh(): Promise<void> {
        const displayName = this._user?.displayName ?? "";
        this._photo.style.maxWidth = `${this.size}px`;
        this._photo.style.maxHeight = `${this.size}px`;
        this._photo.classList.toggle("rounded-circle", this.rounded === "true");
        this._photo.src = LoginComponent._getInitialsAsIconBase64(displayName, this.size);
        this._photo.alt = "";
        // The only text there is: without it the link is a bare image, which a
        // screen reader announces as nothing at all.
        this._link.title = displayName === "" ? "Se déconnecter" : `${displayName} — se déconnecter`;
        this._link.setAttribute("aria-label", this._link.title);
    }

    /** @returns a data URL with the initials drawn on a square, or a blank one when the name is empty */
    protected static _getInitialsAsIconBase64(name: string, size: number): string {
        const initials = name
            .split(/\s+/)
            .filter(part => part.length > 0)
            .slice(0, 2)
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
