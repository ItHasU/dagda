import { AppTypes } from "@dagda-app/shared/src/app/types";
import { AppContextAdapter } from "@dagda-app/shared/src/entities/contexts";
import { APP_MODEL } from "@dagda-app/shared/src/entities/model";
import { Dagda } from "@dagda/client/src/app";
import { PageContainer } from "@dagda/client/src/components/container/container.component";
import { LoginComponent } from "@dagda/client/src/components/login/login.component";
import { Navbar } from "@dagda/client/src/components/navbar/navbar.component";
import { EntitiesStatusComponent } from "@dagda/client/src/components/status/status.component";
import { initServices } from "./services";

// Add all components here to make sure they are registered
LoginComponent;
Navbar;
PageContainer;
EntitiesStatusComponent;

initServices();

Dagda.init<AppTypes>(APP_MODEL, new AppContextAdapter());
