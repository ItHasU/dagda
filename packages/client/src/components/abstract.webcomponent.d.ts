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
export declare abstract class AbstractWebComponent<Data> extends HTMLElement {
    protected _options?: WebComponentOptions | undefined;
    protected _initialized: boolean;
    protected _data: Data | undefined;
    constructor(_options?: WebComponentOptions | undefined);
    /** Get the component data */
    get data(): Data | undefined;
    /**
     * Set the component data.
     * Call refresh() to re-render the component.
     */
    set data(data: Data | undefined);
    /**
     * This method must initialize static elements of the component.
     * It is called after the template is rendered in the inner HTML.
     */
    protected _init(): Promise<void>;
    /**
     * This method is called to render the component.
     */
    protected _refresh(): Promise<void>;
    /**
     * Call this method to refresh the component.
     * This can be done only once all attributes are set.
     */
    refresh(): Promise<void>;
    protected _applyTemplate(): void;
    /** Bind callback to element with ref passed. Callback is surrounded by a try/catch. */
    protected _bindClickForRef(ref: string, cb: () => Promise<void> | void): void;
}
/**
 * Utility decorator to get the element with ref attribute set to the name of the property.
 *
 * The ref value is set as the kebab-case of the property name without the leading underscore.
 * For example, if the property name is "_myProperty", the ref value will be "my-property".
 * For convenience, you can also override the name of the ref.
 */
export declare function Ref(refName?: string): PropertyDecorator;
/**
 * Utility decorator to access an attribute of the web component.
 */
export interface AttributeMarshaller<T = any> {
    read: (value: string | null) => T | null;
    write: (value: T) => string | null;
}
export declare function Attribute<T = string>(options?: {
    name?: string;
    marshaller?: AttributeMarshaller<T>;
    defaultValue?: T;
}): PropertyDecorator;
export declare const NumberMarshaller: AttributeMarshaller<number>;
/**
 * Utility function to convert a camelCase string to kebab-case and remove trailing underscores.
 */
export declare function camelToKebabCase(input: string): string;
