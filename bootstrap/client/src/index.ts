import { AppTypes } from "@dagda-app/shared/src/app/types";
import { APP_CONTEXT_ADAPTER } from "@dagda-app/shared/src/entities/contexts";
import { APP_MODEL } from "@dagda-app/shared/src/entities/model";
import { DagdaClient } from "@dagda/client/src/app";
import { GoodbyePage } from "@dagda/client/src/app/goodbye/goodbye.page";
import { HelloPage } from "@dagda/client/src/app/hello/hello.page";
import { AppPages } from "./services";

// No component imported for its side effect any more: the framework registers
// its own custom elements, and `index.html` is down to `<dagda-app>`
// (specs/navigation.md §6.1).

DagdaClient.start<AppTypes, AppPages>({
    model: APP_MODEL,
    contextAdapter: APP_CONTEXT_ADAPTER,
    title: "Dagda",
    brand: {
        label: "Dagda",
        compact: "DG",
        icon: "ph-wrench"
    },
    // Two pages under one section, so the boilerplate exercises the nesting
    // and not only the flat case: a click on a collapsed section badge, which
    // navigates to the first page, has nothing to act on otherwise.
    sections: {
        demo: { label: "Démonstration", icon: "ph-flask", order: 1 }
    },
    pages: {
        hello: { title: "Hello", constructor: HelloPage, icon: "ph-hand-waving", menu: { section: "demo", order: 1 } },
        goodbye: { title: "Goodbye", constructor: GoodbyePage, icon: "ph-door-open", menu: { section: "demo", order: 2 } }
    }
});
