import { AppTypes } from "@dagda-app/shared/src/app/types";
import { APP_CONTEXT_ADAPTER } from "@dagda-app/shared/src/entities/contexts";
import { APP_MODEL } from "@dagda-app/shared/src/entities/model";
import { DagdaClient } from "@dagda/client/src/app";
import { GoodbyePage } from "@dagda/client/src/app/goodbye/goodbye.page";
import { HelloPage } from "@dagda/client/src/app/hello/hello.page";
import { PageContainer } from "@dagda/client/src/components/container/container.component";
import { LoginComponent } from "@dagda/client/src/components/login/login.component";
import { Navbar } from "@dagda/client/src/components/navbar/navbar.component";
import { EntitiesStatusComponent } from "@dagda/client/src/components/status/status.component";
import { AppPages } from "./services";

// Add all components here to make sure they are registered
LoginComponent;
Navbar;
PageContainer;
EntitiesStatusComponent;

DagdaClient.start<AppTypes, AppPages>({
    model: APP_MODEL,
    contextAdapter: APP_CONTEXT_ADAPTER,
    pages: {
        hello: { order: 1, title: "Hello", constructor: HelloPage },
        goodbye: { order: 2, title: "Goodbye", constructor: GoodbyePage }
    }
});
