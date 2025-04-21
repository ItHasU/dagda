import { EntitiesAPI } from "@dagda/shared/src/api/impl/entities.api";
import { EntitiesHandler } from "@dagda/shared/src/entities/handler";
import { EntitiesModel } from "@dagda/shared/src/entities/model";
import { EntitiesService } from "@dagda/shared/src/entities/service";
import { ContextAdapter } from "@dagda/shared/src/entities/tools/adapters";
import { EntitiesTypes } from "@dagda/shared/src/entities/types";
import { apiCall } from "../api";

/** Build service from the model and the adapter */
export function buildClientEntitiesService<Entities extends EntitiesTypes, Contexts>(model: EntitiesModel<any, any>, contextAdapter: ContextAdapter<Contexts>): EntitiesService<Entities, Contexts>["entities"] {
    // -- Create the handler --
    // -- Create the handler --
    const handler = new EntitiesHandler<Entities, Contexts>(model, contextAdapter, {
        fetch: async (context) => {
            return apiCall<EntitiesAPI<Contexts, Entities>, "fetch">("fetch", {}, context);
        },
        submit: async (data) => {
            return apiCall<EntitiesAPI<Contexts, Entities>, "submit">("submit", {}, data);
        }
    });


    // -- Return the service impl --
    return {
        getHandler: () => {
            return handler;
        }
    };
}