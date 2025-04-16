import { AbstractPageElement } from "../abstract.page.element";

/** A static page sample, no init, no refresh, just a template */
export class HelloPage extends AbstractPageElement<{ name: string }> {

    constructor() {
        super({
            template: require("./hello.page.html").default,
            templateApplyOnRefresh: true
        });
    }

}

customElements.define("hello-page", HelloPage);