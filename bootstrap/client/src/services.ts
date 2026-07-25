import { GoodbyePage } from "@dagda/client/src/app/goodbye/goodbye.page";
import { HelloPage } from "@dagda/client/src/app/hello/hello.page";
import { PageService } from "@dagda/client/src/pages/service";
import { SharedServices } from "@dagda-app/shared/src/services";

/**
 * The pages of the application.
 * Everything else — log, entities, notification — is registered by the
 * framework: those were its own implementations, and the application only ever
 * repeated the same wiring.
 */
export type AppPages = {
    "hello": HelloPage;
    "goodbye": GoodbyePage;
};

/** Custom page service */
export type AppPageService = PageService<AppPages>;

/** All services available from the client */
export type ClientServices = SharedServices & AppPageService;
