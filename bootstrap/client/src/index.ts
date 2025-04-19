import { AppTypes } from "@dagda-app/shared/src/app/types";
import { AppContextAdapter } from "@dagda-app/shared/src/entities/contexts";
import { APP_MODEL } from "@dagda-app/shared/src/entities/model";
import { Dagda } from "@dagda/client/src/app";
import { GoodbyePage } from "@dagda/client/src/app/goodbye/goodbye.page";
import { HelloPage } from "@dagda/client/src/app/hello/hello.page";
import { PageContainer } from "@dagda/client/src/components/container/container.component";
import { LoginComponent } from "@dagda/client/src/components/login/login.component";
import { Navbar } from "@dagda/client/src/components/navbar/navbar.component";

// Add all components here to make sure they are registered
LoginComponent;
Navbar;
PageContainer;
HelloPage;
GoodbyePage;

// Custom types
export interface ClientAppTypes extends AppTypes {
    pages: { "hello": HelloPage, "goodbye": GoodbyePage };
}

Dagda.init<ClientAppTypes>(APP_MODEL, new AppContextAdapter());
Dagda.registerPage<ClientAppTypes, "hello">("hello", { order: 1, title: "Hello", constructor: HelloPage });
Dagda.registerPage<ClientAppTypes, "goodbye">("goodbye", { order: 2, title: "Goodbye", constructor: GoodbyePage });
