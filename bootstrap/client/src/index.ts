import { AppTypes } from "@dagda-app/shared/src/app/types";
import { AppContextAdapter } from "@dagda-app/shared/src/entities/contexts";
import { APP_MODEL } from "@dagda-app/shared/src/entities/model";
import { Dagda } from "@dagda/client/src/app";
import { HelloPage } from "@dagda/client/src/app/hello/hello.page";
import { PageContainer } from "@dagda/client/src/components/container/container.component";
import { LoginComponent } from "@dagda/client/src/components/login/login.component";

// Add all components here to make sure they are registered
LoginComponent;
PageContainer;
HelloPage;

// Custom types
export interface ClientAppTypes extends AppTypes {
    pages: {
        "hello": HelloPage;
    };
}

Dagda.init<ClientAppTypes>(APP_MODEL, new AppContextAdapter());
// dagda.registerPage("hello", HelloPage);
