import { AbstractWebComponent } from "../components/abstract.webcomponent";
/**
 * Abstract class for a page. Same as AbstractWebComponent, but with a connectedCallback method.
 */
export declare abstract class AbstractPageElement<Data> extends AbstractWebComponent<Data> {
    /** Called when the component is inserted in the DOM */
    connectedCallback(): void;
}
