import { ContextAdapter } from "@dagda/shared/src/entities/tools/adapters";
import { BaseContext } from "@dagda/shared/src/entities/types";
import { assertUnreachable } from "@dagda/shared/src/tools/asserts";
import { ProjectId, UserId } from "./types";

//#region Fetch contexts ------------------------------------------------------

/** Get the list of users */
export type UsersContext = BaseContext<"users", undefined>;
/** Get the list of projects for a given user */
export type ProjectsContext = BaseContext<"projects", { userId?: UserId }>;
/** Get the content of a project */
export type ProjectContext = BaseContext<"project", { projectId: ProjectId }>;

/** List of all contexts */
export type AppContexts = UsersContext | ProjectsContext | ProjectContext;

/** Implementation of context adapter for the app */
export class AppContextAdapter implements ContextAdapter<AppContexts> {
    /** @inheritdoc */
    public contextEquals(newContext: AppContexts, oldContext: AppContexts): boolean {
        if (newContext.type !== oldContext.type) {
            return false;
        } else {
            switch (newContext.type) {
                case "users": {
                    return true; // No options to compare
                }
                case "projects": {
                    return newContext.options.userId === (oldContext as ProjectsContext).options.userId;
                }
                case "project": {
                    return newContext.options.projectId === (oldContext as ProjectContext).options.projectId;
                }
                default: {
                    assertUnreachable(newContext);
                }
            }
        }
    }

    /** @inheritdoc */
    public contextIntersects(newContext: AppContexts, oldContext: AppContexts): boolean {
        return this.contextEquals(newContext, oldContext);
    }
}

//#endregion
