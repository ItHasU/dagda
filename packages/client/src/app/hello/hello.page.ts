import { AbstractPageElement } from "../abstract.page.element";

export class HelloPage extends AbstractPageElement {

    constructor() {
        super(require("./hello.page.html").default);
    }

    /** @inheritdoc */
    protected _refresh(): Promise<void> {
        // Refresh logic here
        console.log("HelloPage refreshed");
        return Promise.resolve();
    }
}

customElements.define("hello-page", HelloPage);