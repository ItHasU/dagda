import { AppTypes } from "@dagda-app/shared/src/app/types";
import { AppContextAdapter } from "@dagda-app/shared/src/entities/contexts";
import { APP_MODEL } from "@dagda-app/shared/src/entities/model";
import { DagdaClient } from "@dagda/client/src/app";
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

// Register the services first: the client bootstrap and every component
// reach them through Dagda.get(), and wait on Dagda.loaded.
initServices();

DagdaClient.start<AppTypes>(APP_MODEL, new AppContextAdapter());
