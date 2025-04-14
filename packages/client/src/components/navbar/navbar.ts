import { applyTemplate } from "src/tools/html";

export interface TemplateData {
    title: string;
}

export class Navbar extends HTMLDivElement {
    constructor() {
        super();
        applyTemplate(this, require("./navbar.html").default, undefined);
    }

    protected async _loadTemplate(): Promise<void> {
        const template = require("./navbar.html").default;
        this.innerHTML = template.default;
    }
}