import { UserInfo } from "@dagda/shared/src/auth/types";
// A cycle on paper — `DagdaClient` pulls in the shell, and nothing in the
// shell pulls in this file — but the reference below is inside method
// bodies, so it only resolves once a service consumer calls in, long after
// both modules have finished evaluating. Same situation as
// `login.component.ts`.
import { DagdaClient } from "../app";

/**
 * Client-side auth service (ROADMAP tranche 3): the standard `Dagda.get("auth")`
 * door onto who is logged in, alongside `UsersDirectory`/`users`.
 *
 * `DagdaClient` remains the actual holder of the account — `_systemInfo` is
 * tied to `refreshSystemInfo()`'s bootstrap lifecycle, which this service
 * does not restructure. This is a thin accessor over it, not a second source
 * of truth, so `DagdaClient.currentUser` keeps working for the framework
 * code that already calls it directly.
 */
export class AuthServiceImpl {

    /** @returns the account this browser is logged in as, once known */
    public get currentUser(): UserInfo | null {
        return DagdaClient.currentUser;
    }

    /**
     * Leaves the session through the same server route the login badge's
     * link used to point at directly (`/logout`), which clears the session
     * and redirects. Logging in stays a server-rendered page reached by URL
     * (`/login`) — deliberately out of scope here, so there is no matching
     * `login()`.
     */
    public logout(): void {
        window.location.href = "/logout";
    }

}

/** Registration name of the auth service in the service registry */
export type AuthService = {
    "auth": AuthServiceImpl;
}
