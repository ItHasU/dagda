type BaseServices = {
    [serviceName: string]: any;
}

/**
 * A set of services, addressed by name.
 *
 * Applications never build one themselves: they go through the static `Dagda`
 * facade below, which holds the registry of the running application. This class
 * exists so that a test can work on a registry of its own instead of reaching
 * into module state.
 */
export class DagdaRegistry {

    /** One entry per registered service, keyed by name */
    private readonly _services: { [name: string]: any } = {};

    /** Resolver of `loaded`. Assigned by the promise executor just below. */
    private _resolveLoaded: () => void = () => { };

    /** Resolves once init() has been called at least once on this registry */
    public readonly loaded: Promise<void> = new Promise<void>((resolve) => {
        this._resolveLoaded = resolve;
    });

    /**
     * Register services.
     * Calling it several times adds to the registry rather than replacing it,
     * so an application can declare its services in several places.
     */
    public init<Services extends BaseServices>(services: Services): void {
        for (const [name, service] of Object.entries(services)) {
            this._services[name] = service;
        }
        this._resolveLoaded();
    }

    /**
     * @returns the service registered under this name.
     * The caller states which services it expects, which is what gives the
     * typing: asking for a name outside that set is a compile error.
     */
    public get<Services extends BaseServices>(name: keyof Services): Services[keyof Services] {
        return this._services[name as string];
    }

}

/**
 * Entry point to the services, shared by the client and the server.
 *
 * Static on purpose: a component reaches a service by name, without being
 * handed a reference through its whole call chain.
 *
 * ```ts
 * Dagda.init<ClientServices>({ log, notification, entities, pages });
 * const pages = Dagda.get<PageService>("pages");
 * ```
 */
export class Dagda {

    /** Registry of the running application */
    private static _registry: DagdaRegistry = new DagdaRegistry();

    /** @see DagdaRegistry.loaded */
    public static get loaded(): Promise<void> {
        return this._registry.loaded;
    }

    /** @see DagdaRegistry.init */
    public static init<Services extends BaseServices>(services: Services): void {
        this._registry.init(services);
    }

    /** @see DagdaRegistry.get */
    public static get<Services extends BaseServices>(name: keyof Services): Services[keyof Services] {
        return this._registry.get<Services>(name);
    }

    /**
     * Install a registry in place of the current one, for tests.
     *
     * Note that whoever is already awaiting the previous `Dagda.loaded` keeps
     * awaiting that one: a promise cannot be taken back. This swaps what the
     * *next* readers see, which is what a test between two cases needs.
     *
     * @param registry the registry to install, a fresh one by default
     * @returns the registry that was replaced, so a test can put it back
     */
    public static reset(registry: DagdaRegistry = new DagdaRegistry()): DagdaRegistry {
        const previous = this._registry;
        this._registry = registry;
        return previous;
    }

}
