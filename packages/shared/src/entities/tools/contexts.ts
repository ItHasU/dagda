import { BaseContext } from "../types";
import { ContextAdapter } from "./adapters";

//#region Types ---------------------------------------------------------------

/**
 * Comparison rules for a single type of context.
 *
 * Both notions are needed and are NOT interchangeable :
 * - equals() answers "is this the very same fetch ?", it decides if a context is
 *   already loaded in the cache,
 * - intersects() answers "does a change on this context affect that one ?", it
 *   decides which loaded contexts become dirty.
 *
 * @param Context The type of context the rule applies to
 * @param OtherContexts The other types of context of the application, for intersectsOtherTypes()
 */
export interface ContextTypeAdapter<Context, OtherContexts = any> {
    /** MUST BE executable locally without a promise for quick performances */
    equals(newContext: Context, oldContext: Context): boolean;
    /** MUST BE executable locally without a promise for quick performances */
    intersects(newContext: Context, oldContext: Context): boolean;
    /**
     * Does a context of this type intersect a context of ANOTHER type ?
     *
     * Optional : without it, contexts of different types never intersect, which
     * is what most applications need. Declare it on the type that knows about
     * the relation, the other type has nothing to write.
     *
     * buildContextAdapter() asks BOTH sides and keeps true if either one says so,
     * so the relation stays symmetric whichever side declares it.
     *
     * MUST BE executable locally without a promise for quick performances.
     */
    intersectsOtherTypes?(ownContext: Context, otherContext: OtherContexts): boolean;
}

/** Map of a context type to the rules applying to it */
export type ContextTypeAdapters<Contexts extends BaseContext<string, any>> = {
    [Type in Contexts["type"]]: ContextTypeAdapter<Extract<Contexts, { type: Type }>, Exclude<Contexts, { type: Type }>>;
};

//#endregion

//#region Options comparison --------------------------------------------------

/**
 * Compare the options of two contexts, one strict equality per parameter.
 * A parameter set to undefined and a missing parameter are considered equal.
 */
export function optionsEqual(newOptions: unknown, oldOptions: unknown): boolean {
    if (newOptions === oldOptions) {
        return true;
    }
    if (newOptions == null || oldOptions == null) {
        // One of them is null or undefined and they are not identical,
        // but an object holding only undefined values is still equal to nothing.
        return _isEmptyOptions(newOptions) && _isEmptyOptions(oldOptions);
    }
    if (typeof newOptions !== "object" || typeof oldOptions !== "object") {
        // Not objects and not identical
        return false;
    }
    const newValues = newOptions as Record<string, unknown>;
    const oldValues = oldOptions as Record<string, unknown>;
    for (const key of new Set([...Object.keys(newValues), ...Object.keys(oldValues)])) {
        if (newValues[key] !== oldValues[key]) {
            return false;
        }
    }
    return true;
}

/** @returns true if the options hold no defined value */
function _isEmptyOptions(options: unknown): boolean {
    if (options == null) {
        return true;
    }
    if (typeof options !== "object") {
        return false;
    }
    return Object.values(options as Record<string, unknown>).every(value => value === undefined);
}

//#endregion

//#region Ready-made rules ----------------------------------------------------

/**
 * Contexts of this type always intersect each other : a change on any of them
 * makes all the others dirty.
 * Typical for a context with no option, or for a context whose options only
 * narrow a set of data that is invalidated as a whole.
 */
export function alwaysIntersects<Context extends BaseContext<string, any>>(): ContextTypeAdapter<Context> {
    return {
        equals: (newContext, oldContext) => optionsEqual(newContext.options, oldContext.options),
        intersects: () => true
    };
}

/**
 * Contexts of this type never intersect each other : a change on one of them
 * never makes another one dirty.
 * Typical for a context that is refreshed by another channel, or that holds
 * data no transaction can invalidate.
 */
export function neverIntersects<Context extends BaseContext<string, any>>(): ContextTypeAdapter<Context> {
    return {
        equals: (newContext, oldContext) => optionsEqual(newContext.options, oldContext.options),
        intersects: () => false
    };
}

/**
 * Contexts of this type intersect when all their parameters are equal.
 * This is the common case : { type: "project", options: { projectId } } only
 * affects the very same project.
 */
export function intersectsOnEqualOptions<Context extends BaseContext<string, any>>(): ContextTypeAdapter<Context> {
    return {
        equals: (newContext, oldContext) => optionsEqual(newContext.options, oldContext.options),
        intersects: (newContext, oldContext) => optionsEqual(newContext.options, oldContext.options)
    };
}

/**
 * Contexts of this type intersect when the provided predicate says so.
 * Equality stays the equality of all the parameters.
 * Use it for the cases the three ready-made rules do not cover, typically an
 * optional parameter meaning "all the values".
 */
export function intersectsWhen<Context extends BaseContext<string, any>>(predicate: (newContext: Context, oldContext: Context) => boolean): ContextTypeAdapter<Context> {
    return {
        equals: (newContext, oldContext) => optionsEqual(newContext.options, oldContext.options),
        intersects: predicate
    };
}

/**
 * Widen an existing rule so contexts of this type also intersect contexts of
 * OTHER types.
 *
 * This is the case of a list that carries a summary of the details : a message
 * arriving on one topic changes that topic's history AND the topic list, since
 * the list holds the date of the last message of every topic.
 *
 * ```ts
 * topics: alsoIntersectsOtherTypes(alwaysIntersects()),
 * topic: intersectsOnEqualOptions()
 * ```
 *
 * The relation only has to be declared on one side : buildContextAdapter() asks
 * both sides and keeps true if either one says so.
 *
 * @param rule The rule applying between two contexts of the same type
 * @param predicate Which other contexts are concerned, all of them by default
 */
export function alsoIntersectsOtherTypes<Context extends BaseContext<string, any>, OtherContexts = any>(
    rule: ContextTypeAdapter<Context>,
    predicate: (ownContext: Context, otherContext: OtherContexts) => boolean = () => true
): ContextTypeAdapter<Context, OtherContexts> {
    return {
        equals: (newContext, oldContext) => rule.equals(newContext, oldContext),
        intersects: (newContext, oldContext) => rule.intersects(newContext, oldContext),
        intersectsOtherTypes: predicate
    };
}

//#endregion

//#region Composition ---------------------------------------------------------

/**
 * Build a complete ContextAdapter from one rule per type of context.
 *
 * Two contexts of different types are never equal.
 *
 * Two contexts of different types do not intersect either, unless one of the two
 * rules declares intersectsOtherTypes() — see alsoIntersectsOtherTypes(). Both
 * sides are asked and true wins, so :
 * - an application that does not need it writes nothing more,
 * - forgetting a relation is never a compilation error,
 * - the intersection stays symmetric whichever side declares the relation.
 *
 * ```ts
 * export const APP_CONTEXT_ADAPTER = buildContextAdapter<AppContexts>({
 *     users: alwaysIntersects(),
 *     project: intersectsOnEqualOptions()
 * });
 * ```
 */
export function buildContextAdapter<Contexts extends BaseContext<string, any>>(adapters: ContextTypeAdapters<Contexts>): ContextAdapter<Contexts> {
    const getAdapter = (context: Contexts): ContextTypeAdapter<Contexts> => {
        const adapter = adapters[context.type as Contexts["type"]] as ContextTypeAdapter<Contexts> | undefined;
        if (adapter == null) {
            throw new Error(`No rule declared for the context type "${context.type}"`);
        }
        return adapter;
    };

    return {
        contextEquals(newContext: Contexts, oldContext: Contexts): boolean {
            if (newContext.type !== oldContext.type) {
                return false;
            }
            return getAdapter(newContext).equals(newContext, oldContext);
        },
        contextIntersects(newContext: Contexts, oldContext: Contexts): boolean {
            if (newContext.type === oldContext.type) {
                return getAdapter(newContext).intersects(newContext, oldContext);
            }
            // Different types : ask both rules and keep true if either one claims
            // the relation. Declaring it on one side is enough, and the result
            // cannot depend on the order of the arguments.
            const newAdapter = getAdapter(newContext);
            const oldAdapter = getAdapter(oldContext);
            return newAdapter.intersectsOtherTypes?.(newContext, oldContext) === true
                || oldAdapter.intersectsOtherTypes?.(oldContext, newContext) === true;
        }
    };
}

//#endregion
