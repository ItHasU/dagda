import { EntitiesHandler } from "./handler";
import { EntitiesTypes } from "./types";

/** Methods provided by the entities service */
export interface EntitiesService<Entities extends EntitiesTypes, Contexts> {
    /** 
     * This method must get you an handler usable :
     * - On the client side, the handler is created only once and shared.
     * - On the server side, a new handler is created on each request.
     */
    entities: {
        getHandler(): EntitiesHandler<Entities, Contexts>;
    }
}