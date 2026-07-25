import { AuthEvents } from "@dagda/shared/src/auth/events";
import { UserInfo } from "@dagda/shared/src/auth/types";
import { Dagda } from "@dagda/shared/src/dagda";
import { NotificationService } from "@dagda/shared/src/notification/service";
import { Event } from "@dagda/shared/src/tools/events";
// A cycle on paper — `DagdaClient` pulls in the shell, which pulls in this
// component — but not in practice: the reference is inside a method body, so
// it resolves when the badge renders, long after both modules have finished
// evaluating.
import { DagdaClient } from "../../app";
import { AbstractWebComponent, Ref } from "../abstract.webcomponent";
import template from "./login.component.html";

/**
 * The badge of the current account, and the way out (FEATURES §8).
 *
 * Local accounts carry no photo — there is no provider to get one from — so the
 * avatar is the initials. They used to be painted on a canvas with two greys
 * written into the code, which is why this file carried a lint waiver: a
 * canvas takes concrete colours, and concrete colours ignore the theme. They
 * are now text in a themed badge, so the waiver is gone and the avatar follows
 * the theme like everything else.
 */
export class LoginComponent extends AbstractWebComponent {

    @Ref()
    protected _photo!: HTMLElement;
    @Ref()
    protected _link!: HTMLAnchorElement;
    @Ref()
    protected _label!: HTMLSpanElement;

    protected _user: UserInfo | null = null;

    constructor() {
        super({ template });
    }

    protected override _init(): Promise<void> {
        Dagda.get<NotificationService<AuthEvents>>("notification").on("userInfoChanged", (event: Event<UserInfo>) => {
            this._user = event.data;
            this.refresh();
        });
        return Promise.resolve();
    }

    protected override async _refresh(): Promise<void> {
        // The event is a notification of change, not the source of truth.
        // Relying on it alone loses the race it cannot win: `userInfoChanged`
        // is broadcast once, while the shell is being built, and a component
        // that subscribes a tick later never hears it and shows an empty badge
        // for the rest of the session. Ask, then listen.
        this._user ??= DagdaClient.currentUser;
        const displayName = this._user?.displayName ?? "";
        this._photo.textContent = LoginComponent.getInitials(displayName);
        this._label.textContent = displayName;
        // The label is hidden in the collapsed rail and the badge is two
        // letters, so without this the way out of the application is a link
        // that announces itself as "JD".
        this._link.title = displayName === "" ? "Se déconnecter" : `${displayName} — se déconnecter`;
        this._link.setAttribute("aria-label", this._link.title);
    }

    /** @returns up to two initials, or an empty string when there is no name */
    public static getInitials(name: string): string {
        return name
            .split(/\s+/)
            .filter(part => part.length > 0)
            .slice(0, 2)
            .map(part => part.charAt(0).toUpperCase())
            .join("");
    }

}

customElements.define("dagda-login", LoginComponent);
