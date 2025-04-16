import Handlebars from "handlebars";

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
export abstract class AbstractWebComponent<Data = never> extends HTMLElement {

    protected _initialized = false;
    protected _data: Data | undefined;

    constructor(protected _options?: WebComponentOptions) {
        super();
    }

    /** Get the component data */
    public get data(): Data | undefined {
        return this._data;
    }

    /** 
     * Set the component data.
     * Call refresh() to re-render the component.
     */
    public set data(data: Data | undefined) {
        this._data = data;
    }

    /** 
     * This method must initialize static elements of the component.
     * It is called after the template is rendered in the inner HTML.
     */
    protected _init(): Promise<void> { return Promise.resolve(); }

    /**
     * This method is called to render the component.
     */
    protected _refresh(): Promise<void> { return Promise.resolve(); }

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
        if (this._options?.template) {
            const template = Handlebars.compile(this._options.template);
            this.innerHTML = template(this, {
                allowProtoPropertiesByDefault: true
            });
        } else {
            this.innerHTML = "";
        }
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
                const element = this.querySelector(`[ref="${ref}"]`) as HTMLElement | null;
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