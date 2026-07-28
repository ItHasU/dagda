import { BaseAppTypes } from "@dagda/shared/src/app/types";
import { BaseServicesParams, Dagda } from "@dagda/shared/src/dagda";
import { SettingsDeclaration } from "@dagda/shared/src/settings/model";
import { SettingsWriteService } from "@dagda/shared/src/settings/service";

/** Parameters needed to build the server's own base services, on top of the shared ones */
export interface ServerOwnServicesParams<Settings extends SettingsDeclaration<Settings>> {
    settings: SettingsWriteService<Settings>["settings"];
}

/**
 * The services every Dagda server application receives: the shared base
 * (`log`/`entities`/`notification`) plus the system settings values
 * (FEATURES §11.5) — writing/watching them goes through `AbstractServerApp
 * .settings` instead, which is a store, not a Dagda service.
 *
 * An application extends this with its own services (FEATURES §0) — see
 * `Dagda`'s own doc comment for the shape. None does today, so
 * `AbstractServerApp` builds this directly rather than through an
 * overridable hook.
 */
export class ServerDagda<
    AppTypes extends BaseAppTypes = BaseAppTypes,
    Settings extends SettingsDeclaration<Settings> = {}
> extends Dagda<AppTypes> {

    public readonly settings: SettingsWriteService<Settings>["settings"];

    constructor(params: BaseServicesParams<AppTypes> & ServerOwnServicesParams<Settings>) {
        super(params);
        this.settings = params.settings;
    }

}

/**
 * The running application's services (FEATURES §0) — the same instance every
 * `ServerDagda`/`Dagda` field is reached through, whichever module imports
 * it. Assigned once, synchronously, in `AbstractServerApp`'s constructor.
 */
export let dagda: ServerDagda<BaseAppTypes, any>;

/**
 * @internal set by `AbstractServerApp`'s constructor once every parameter is known.
 *
 * The cast is deliberate, same reason as the client's `_setDagda`: `dagda` is
 * exposed here through the framework's own loose types, not the concrete
 * application's.
 */
export function _setDagda<AppTypes extends BaseAppTypes, Settings extends SettingsDeclaration<Settings>>(
    instance: ServerDagda<AppTypes, Settings>
): void {
    dagda = instance as unknown as ServerDagda<BaseAppTypes, any>;
}
