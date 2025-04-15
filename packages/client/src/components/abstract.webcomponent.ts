export interface WebComponentOptions {
    /** If specified the template will be rendered in the inner HTML of the component */
    template?: string;
    /** 
     * If true, the template is re-rendered on each refresh
     * You will need to rebind all events on each _refresh()
     */
    templateApplyOnRefresh?: boolean;
}

/**
 * An utility class to create a web component.
 * This class handles :
 * - the rendering of the template HTML
 * - typed methods to set attributes
 * 
 * The component will never refresh itself. 
 * You need to call the refresh() method to re-render the component once all attributes are set.
 */
export abstract class AbstractWebComponent<AttributeNames extends string = string, Data = never> extends HTMLElement {

    protected _initialized = false;
    protected _data: Data | undefined;

    constructor(protected _options?: WebComponentOptions) {
        super();
    }

    /** Set attribute */
    public override setAttribute(attribute: AttributeNames, value?: string): void {
        if (value === undefined) {
            super.removeAttribute(attribute);
        } else {
            super.setAttribute(attribute, value);
        }
    }

    /** 
     * This method must initialize static elements of the component.
     * It is called after the template is rendered in the inner HTML.
     */
    protected abstract _init(): Promise<void>;

    /**
     * This method must be called to render the component.
     */
    protected abstract _refresh(): Promise<void>;

    /**
     * Call this method to refresh the component.
     * This can be done only once all attributes are set.
     */
    public async refresh(): Promise<void> {
        try {
            // Initialize the component if needed
            if (!this._initialized) {
                this._initialized = true;

                if (!this._options?.templateApplyOnRefresh) {
                    // If the template is not applied on refresh, we need to set it here
                    this._applyTemplate();
                }
                await this._init();
            }

            if (this._options?.templateApplyOnRefresh) {
                // If the template is applied on refresh, we need to set it here
                this._applyTemplate();
            }
            await this._refresh();
        } catch (e) {
            console.error('Error during component refresh', e);
            this.innerHTML = `<code>An error occurred while refreshing the component\n${"" + e}</code>`;
            this._initialized = false;
        }
    }

    protected _applyTemplate(): void {
        this.innerHTML = this._options?.template ?? "";
    }

    protected _getElementByRef<T extends HTMLElement>(ref: string): T | null {
        const element = this.querySelector(`[ref="${ref}"]`) as T | null;
        if (!element) {
            throw `Element with ref "${ref}" not found`;
        }
        return element;
    }
}



/** 
 * Utility decorator to get the element with ref attribute set to the name of the property.
 * For convenience, you can also override the name of the ref.
 */
export function Ref(refName?: string): PropertyDecorator {
    return function (classPrototype: unknown, propertyKey: string | symbol): void {
        Object.defineProperty(classPrototype, propertyKey, {
            get(): HTMLElement {
                const ref = refName ?? propertyKey.toString();
                const element = this.querySelector(`[ref="${ref}"]`) as HTMLElement | null;
                if (!element) {
                    throw `Element with ref "${ref}" not found`;
                }
                return element;
            },
            enumerable: true,
        });
    };
};