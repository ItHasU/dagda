/** 
 * A generic context implementation.
 * 
 * This is only a recommendation and can be changed
 * to fit your needs.
 */
export type BaseContext<T extends string, Options> = {
    type: T;
    options: Options;
}
