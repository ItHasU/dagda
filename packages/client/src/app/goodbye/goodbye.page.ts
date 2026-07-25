import { AbstractPageElement } from "../../pages/abstract.page.element";
import template from "./goodbye.page.html";

/** A static page sample, no init, no refresh, just a template */
export class GoodbyePage extends AbstractPageElement {

    constructor() {
        super({
            template: template
        });
    }

    /** Nothing to be done here */
    protected override _refresh(): Promise<void> {
        return Promise.resolve();
    }

    /** Nothing to be done here */
    public override dispose(): Promise<void> {
        return Promise.resolve();
    }

}

customElements.define("goodbye-page", GoodbyePage);