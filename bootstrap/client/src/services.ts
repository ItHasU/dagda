import { AppContextAdapter } from "@dagda-app/shared/src/entities/contexts";
import { APP_MODEL } from "@dagda-app/shared/src/entities/model";
import { SharedServices } from "@dagda-app/shared/src/services";
import { GoodbyePage } from "@dagda/client/src/app/goodbye/goodbye.page";
import { HelloPage } from "@dagda/client/src/app/hello/hello.page";
import { buildClientEntitiesService } from "@dagda/client/src/entities/service";
import { ClientNotificationImpl } from "@dagda/client/src/notification/notification.impl";
import { PageHandler } from "@dagda/client/src/pages/handler";
import { PageService } from "@dagda/client/src/pages/service";
import { Dagda } from "@dagda/shared/src/dagda";
import { buildConsoleLogService } from "@dagda/shared/src/tools/log";

export type AppPages = {
    "hello": HelloPage;
    "goodbye": GoodbyePage;
};

/** Custom page service */
export type AppPageService = PageService<AppPages>;

/** All services available from the client */
export type ClientServices = SharedServices & AppPageService;

export function initServices(): void {
    const pageHandler = new PageHandler<AppPages>();
    pageHandler.registerPage("hello", { order: 1, title: "Hello", constructor: HelloPage });
    pageHandler.registerPage("goodbye", { order: 2, title: "Goodbye", constructor: GoodbyePage });

    // Initialize the services
    Dagda.init<ClientServices>({
        log: buildConsoleLogService(),
        notification: new ClientNotificationImpl(),
        entities: buildClientEntitiesService(APP_MODEL, new AppContextAdapter()),
        pages: pageHandler
    });
}