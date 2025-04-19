import { AbstractWebComponent } from "../components/abstract.webcomponent";

/**
 * Abstract class for a page. Same as AbstractWebComponent, but with a connectedCallback method.
 */
export abstract class AbstractPageElement extends AbstractWebComponent {

    /**
     * Dispose resources or perform cleanup when the page is no longer needed.
     */
    public dispose(): Promise<void> {
        return Promise.resolve();
    }

}