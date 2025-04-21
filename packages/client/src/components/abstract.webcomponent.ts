import { Dagda } from "@dagda/shared/src/dagda";

/** 
 * Options for the web component creation
 * They should all be provider by the child class constructor to allow empty constructor.
 */
export interface WebComponentOptions {
    /** If specified the template will be rendered in the inner HTML of the component */
    template?: string;
}

/**
 * An utility class to create a web component.
 * 
 * This class handles :
 * - the rendering of the template HTML
 * - typed methods to set attributes
 * 
 * The component will refresh itself :
 * - when the component is connected to the DOM,
 * - when an attribute is set.
 * 
 * For all other changes, you must call the refresh() method manually.
 */
export abstract class AbstractWebComponent extends HTMLElement {

    /** 
     * Constructor can only be called by child class. 
     * All parameters must be provided by the child class constructor.
     */
    protected constructor(protected _options?: WebComponentOptions) {
        super();

        // Save existing children
        const existingChildren = Array.from(this.childNodes);

        // Set the template
        this.innerHTML = this._options?.template ?? "";

        // Distribute existing children into corresponding slots
        existingChildren.forEach(child => {
            if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).hasAttribute("slot")) {
                const slotName = (child as HTMLElement).getAttribute("slot");
                const slot = this.querySelector(`slot[name="${slotName}"]`);
                slot?.appendChild(child);
            } else {
                const defaultSlot = this.querySelector("slot:not([name])");
                defaultSlot?.appendChild(child);
            }
        });
    }

    /** 
     * This method must be called to initialize the component.
     * It will set the template and call _init() method.
     */
    public connectedCallback(): void {
        this.refresh();
    }

    //#region Refresh methods -------------------------------------------------

    /** Store state of init */
    protected _initialized = false;
    /** Prevent calling refresh while already refreshing */
    protected _refreshing = false;

    /**
     * Call this method to refresh the component.
     * This can be done only once all attributes are set.
     */
    public async refresh(): Promise<void> {
        if (this._refreshing) {
            console.debug("Component is already refreshing, ignoring refresh call");
            return;
        }

        this._refreshing = true;
        try {
            await Dagda.loaded; // Wait for Dagda to be loaded

            // Initialize the component if needed
            if (!this._initialized) {
                this._initialized = true;
                await this._init();
            }

            await this._refresh();
        } catch (e) {
            console.error('Error during component refresh', e);
            this.innerHTML = `<code>An error occurred while refreshing the component\n${"" + e}</code>`;
            this._initialized = false;
        } finally {
            this._refreshing = false;
        }
    }

    /** 
     * This method must initialize static elements of the component.
     * It is called after the template is rendered in the inner HTML.
     * 
     * This method is called only once on the first call to refresh().
     */
    protected _init(): Promise<void> { return Promise.resolve(); }

    /**
     * This method is called to render the component.
     */
    protected abstract _refresh(): Promise<void>;

    //#endregion

    //#region Utility methods -------------------------------------------------

    /** Bind callback to element with ref passed. Callback is surrounded by a try/catch. */
    protected _bindClickForRef(ref: string, cb: () => Promise<void> | void): void {
        (this.querySelector(`*[ref="${ref}"]`) as HTMLButtonElement | undefined)?.addEventListener("click", async function () {
            try {
                await cb();
            } catch (e) {
                console.error(e);
            }
        });
    }

    //#endregion

}

/** 
 * Utility decorator to get the element with ref attribute set to the name of the property.
 * 
 * The ref value is set as the kebab-case of the property name without the leading underscore.
 * For example, if the property name is "_myProperty", the ref value will be "my-property".
 * For convenience, you can also override the name of the ref.
 */
export function Ref(refName?: string): PropertyDecorator {
    return function (classPrototype: unknown, propertyKey: string | symbol): void {
        // 
        const ref = refName ?? camelToKebabCase(propertyKey.toString());
        Object.defineProperty(classPrototype, propertyKey, {
            get(): HTMLElement {
                const element = (this as AbstractWebComponent).querySelector(`[ref="${ref}"]`) as HTMLElement | null;
                if (!element) {
                    throw `Element with ref "${ref}" not found`;
                }
                return element;
            }
        });
    };
};


/** 
 * Utility decorator to access an attribute of the web component.
 */
export interface AttributeMarshaller<T = any> {
    read: (value: string | null) => T | null;
    write: (value: T) => string | null;
}
export function Attribute<T = string>(options?: { name?: string; marshaller?: AttributeMarshaller<T>; defaultValue?: T }): PropertyDecorator {
    return function (classPrototype: unknown, propertyKey: string | symbol): void {
        // Use custom attribute name if specified or convert property name to kebab case
        const attributeName = options?.name ?? camelToKebabCase(propertyKey.toString());

        Object.defineProperty(classPrototype, propertyKey, {
            get(): T | null {
                const rawValue = (this as HTMLElement).getAttribute(attributeName);
                if (rawValue == null) {
                    return options?.defaultValue ?? null;
                }
                return options?.marshaller?.read ? options.marshaller.read(rawValue) : (rawValue as unknown as T);
            },
            set(value: T): void {
                const rawValue = options?.marshaller?.write ? options.marshaller.write(value) : (value as unknown as string | null);
                if (rawValue == null) {
                    (this as HTMLElement).removeAttribute(attributeName);
                } else {
                    (this as HTMLElement).setAttribute(attributeName, rawValue);
                }
                if (this instanceof AbstractWebComponent) {
                    (this as AbstractWebComponent).refresh();
                }
            }
        });
    };
};

export const NumberMarshaller: AttributeMarshaller<number> = {
    read: (value: string | null): number | null => {
        if (value == null) {
            return null;
        }
        const parsed = Number(value);
        if (isNaN(parsed)) {
            throw new Error(`Invalid number: ${value}`);
        }
        return parsed;
    },
    write: (value: number): string | null => {
        return value.toString();
    }
};

/**
 * Utility function to convert a camelCase string to kebab-case and remove trailing underscores.
 */
export function camelToKebabCase(input: string): string {
    return input.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().replace(/^_+/, '');
}