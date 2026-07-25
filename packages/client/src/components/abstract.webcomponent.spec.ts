import { Dagda } from "@dagda/shared/src/dagda";
import { beforeAll, describe, expect, it } from "vitest";
import { GoodbyePage } from "../app/goodbye/goodbye.page";
import { AbstractWebComponent, Attribute, camelToKebabCase, NumberMarshaller, Ref } from "./abstract.webcomponent";

/** A component with a template holding a ref and two slots */
const TEMPLATE = `
<section>
    <slot name="header"></slot>
    <span ref="label"></span>
    <slot></slot>
</section>`;

class SampleComponent extends AbstractWebComponent {

    @Ref()
    protected _label!: HTMLSpanElement;

    @Attribute({ defaultValue: "unnamed" })
    public who!: string;

    @Attribute({ marshaller: NumberMarshaller, defaultValue: 1 })
    public times!: number;

    /** Number of times _refresh() has run, so tests can observe the lifecycle */
    public refreshCount = 0;
    /** Number of times _init() has run */
    public initCount = 0;

    constructor() {
        super({ template: TEMPLATE });
    }

    protected override async _init(): Promise<void> {
        this.initCount++;
    }

    protected override async _refresh(): Promise<void> {
        this.refreshCount++;
        this._label.textContent = `${this.who} x${this.times}`;
    }
}
customElements.define("sample-component", SampleComponent);

describe("AbstractWebComponent", () => {

    beforeAll(() => {
        // refresh() waits on Dagda.loaded, which never settles without an init().
        Dagda.init({});
    });

    it("renders its template on construction", () => {
        const component = new SampleComponent();
        expect(component.querySelector("[ref='label']")).not.toBeNull();
    });

    it("runs _init() once and _refresh() on every refresh", async () => {
        const component = new SampleComponent();
        await component.refresh();
        await component.refresh();
        expect(component.initCount).toBe(1);
        expect(component.refreshCount).toBe(2);
    });

    it("refreshes when connected to the DOM", async () => {
        const component = new SampleComponent();
        document.body.appendChild(component);
        // connectedCallback() starts a refresh without awaiting it; asking for
        // one here must wait for the component to be rendered, not return early.
        await component.refresh();
        expect(component.querySelector("[ref='label']")?.textContent).toBe("unnamed x1");
        component.remove();
    });

    it("coalesces a refresh asked for while another is running", async () => {
        const component = new SampleComponent();
        // Two concurrent requests: the second must not be dropped, and both
        // promises must resolve on a component that reflects the last state.
        const first = component.refresh();
        component.setAttribute("who", "second");
        const second = component.refresh();
        await Promise.all([first, second]);
        expect(component.querySelector("[ref='label']")?.textContent).toBe("second x1");
        // One pass for the initial request, one for the queued one.
        expect(component.refreshCount).toBe(2);
    });

    it("reads attributes through their marshaller, with a default value", async () => {
        const component = new SampleComponent();
        expect(component.who).toBe("unnamed");
        expect(component.times).toBe(1);

        component.setAttribute("who", "world");
        component.setAttribute("times", "3");
        expect(component.who).toBe("world");
        expect(component.times).toBe(3);

        await component.refresh();
        expect(component.querySelector("[ref='label']")?.textContent).toBe("world x3");
    });

    it("writes attributes back to the DOM", () => {
        const component = new SampleComponent();
        component.times = 7;
        expect(component.getAttribute("times")).toBe("7");
    });

    it("throws when a ref is missing from the template", async () => {
        class BrokenComponent extends AbstractWebComponent {
            @Ref()
            protected _missing!: HTMLElement;

            constructor() {
                super({ template: "<div></div>" });
            }

            protected override async _refresh(): Promise<void> {
                this._missing.textContent = "never reached";
            }
        }
        customElements.define("broken-component", BrokenComponent);

        const component = new BrokenComponent();
        // refresh() catches the error and renders it rather than rejecting.
        await component.refresh();
        expect(component.innerHTML).toContain("An error occurred");
    });

    it("distributes existing children into the matching slots", () => {
        const component = document.createElement("div");
        component.innerHTML = `<sample-component><b slot="header">head</b><i>body</i></sample-component>`;
        const sample = component.querySelector("sample-component")!;
        expect(sample.querySelector("slot[name='header'] b")?.textContent).toBe("head");
        expect(sample.querySelector("slot:not([name]) i")?.textContent).toBe("body");
    });

    it("converts property names to ref and attribute names", () => {
        expect(camelToKebabCase("_myProperty")).toBe("my-property");
        expect(camelToKebabCase("who")).toBe("who");
    });

});

describe("Template import", () => {

    it("loads a component template from its .html file", async () => {
        // This is the check that the templates are readable outside a webpack
        // bundle. If the .html import mechanism regresses, this test fails
        // before any component test does.
        const page = new GoodbyePage();
        expect(page.innerHTML).toContain("Goodbye world!");
    });

});
