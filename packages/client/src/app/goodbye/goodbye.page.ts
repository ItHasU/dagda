import { AbstractPageElement } from "../abstract.page.element";

/** A static page sample, no init, no refresh, just a template */
export class GoodbyePage extends AbstractPageElement {

    constructor() {
        super({
            template: require("./goodbye.page.html").default
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