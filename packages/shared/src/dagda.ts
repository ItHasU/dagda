type BaseServices = {
    [serviceName: string]: any;
}

const _dagdaServices: { [name: string]: any } = {};
let _dagdaInitialized: (() => void);

/** This is the entry point to access to the services */
export function Dagda<Services extends BaseServices>(name: keyof Services): Services[typeof name] {
    // This is a placeholder for the Dagda function
    return _dagdaServices[name as string];
}

Dagda.init = function <Services extends BaseServices>(services: Services): void {
    // Initialize the Dagda services
    for (const [name, service] of Object.entries(services)) {
        _dagdaServices[name] = service;
    }
    _dagdaInitialized();
}

Dagda.loaded = new Promise<void>((resolve) => {
    _dagdaInitialized = resolve;
});
