import { GoodbyePage } from "@dagda/client/src/app/goodbye/goodbye.page";
import { HelloPage } from "@dagda/client/src/app/hello/hello.page";
import { AppTypes } from "@dagda-app/shared/src/app/types";

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

/** The application's contract, `pages` included (FEATURES §0) */
export interface ClientAppTypes extends AppTypes {
    pages: AppPages;
}
