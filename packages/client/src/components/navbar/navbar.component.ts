import { AbstractWebComponent } from "../abstract.webcomponent";

export class Navbar extends AbstractWebComponent {
    constructor() {
        super({
            template: require("./navbar.component.html").default
        });
    }
}

customElements.define("app-navbar", Navbar);