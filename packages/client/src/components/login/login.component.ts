import { AbstractWebComponent, Ref } from "../abstract.webcomponent";

export class LoginComponent extends AbstractWebComponent<"displayName" | "photo"> {

    @Ref()
    protected photo!: HTMLImageElement;
    @Ref()
    protected link!: HTMLAnchorElement;

    constructor() {
        super({
            template: require("./login.component.html").default,
            templateApplyOnRefresh: false
        });

        this.classList.add("d-flex align-items-center");
    }

    protected async _init(): Promise<void> {
    }

    protected async _refresh(): Promise<void> {
        this.photo.src = this.getAttribute("photo") ?? "/assets/images/empty.png";
        this.link.title = (this.getAttribute("displayName") ?? "Logout");
    }

}

customElements.define("login-component", LoginComponent);