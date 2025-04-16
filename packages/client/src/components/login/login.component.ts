import { AbstractWebComponent, Attribute, NumberMarshaller, Ref } from "../abstract.webcomponent";

export const DEFAULT_SIZE = 32;

export class LoginComponent extends AbstractWebComponent<{ displayName: string, photoURL: string | null }> {

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
            template: require("./login.component.html").default,
            templateApplyOnRefresh: true
        });
    }

    protected override async _refresh(): Promise<void> {
        const displayName = this.data?.displayName ?? "Unknown";

        this._photo.classList.toggle("rounded-circle", this.rounded === "true");
        this._photo.src = this.data?.photoURL ?? LoginComponent._getInitialsAsIconBase64(this.data?.displayName ?? "Unknown", this.size);
        this._link.title = displayName;
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