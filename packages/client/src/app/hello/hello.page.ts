import { AbstractPageElement } from "../../pages/abstract.page.element";

var count = 0;

/** A static page sample, no init, no refresh, just a template */
export class HelloPage extends AbstractPageElement {

    constructor() {
        super({
            template: require("./hello.page.html").default
        });
        count++;
        console.log("Active HelloPage pages:", count);
    }

    /** Nothing to be done here */
    protected override _refresh(): Promise<void> {
        return Promise.resolve();
    }

    /** Nothing to be done here */
    public override dispose(): Promise<void> {
        count--;
        console.log("Active HelloPage pages:", count);
        return Promise.resolve();
    }

}

customElements.define("hello-page", HelloPage);