import { ContextAdapter } from "@dagda/shared/src/entities/tools/adapters";
import { alwaysIntersects, buildContextAdapter, intersectsOnEqualOptions, intersectsWhen } from "@dagda/shared/src/entities/tools/contexts";
import { BaseContext } from "@dagda/shared/src/entities/types";
import { ProjectId, UserId } from "./types";

//#region Fetch contexts ------------------------------------------------------

/** Get the list of projects for a given user */
export type ProjectsContext = BaseContext<"projects", { userId?: UserId }>;
/** Get the content of a project */
export type ProjectContext = BaseContext<"project", { projectId: ProjectId }>;

/** List of all contexts */
export type AppContexts = ProjectsContext | ProjectContext;

/**
 * Implementation of the context adapter for the app.
 *
 * An application only declares one rule per context type, the framework
 * assembles the ContextAdapter the EntitiesHandler expects.
 */
export const APP_CONTEXT_ADAPTER: ContextAdapter<AppContexts> = buildContextAdapter<AppContexts>({
    // userId is optional and undefined means "every user", so a change on one
    // user's projects also concerns the unfiltered list
    projects: intersectsWhen((newContext, oldContext) =>
        newContext.options.userId == null
        || oldContext.options.userId == null
        || newContext.options.userId === oldContext.options.userId),
    // A change on a project only concerns that project
    project: intersectsOnEqualOptions()
});

//#endregion
