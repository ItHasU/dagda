/**
 * Defines a collection of APIs.
 * @template Options - Specifies the type of options, varying based on client or server usage.
 */

export interface APICollection {
    [name: string]: (...args: unknown[]) => unknown;
}