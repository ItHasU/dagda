import { APICollection } from "@dagda/shared/src/api/types";
import { UserId } from "./entities/types";

/**
 * Applicative API routes (FEATURES §5), on top of the framework's own
 * (`SystemAPI`, the entities `fetch`/`submit`). Declared the same way as
 * those — a plain function signature per route — and registered server-side
 * with `ServerApp.registerAPI()`.
 */
export interface AppAPI extends APICollection {
    /**
     * Number of projects owned by the given account.
     *
     * Demonstrates a *parameterized* permission (FEATURES §5, commit
     * 610b842): open to any authenticated account, but only to ask about
     * their own id — "may act on their own entities, not someone else's",
     * a check a flat permission string cannot express. See its registration
     * in `ServerApp` for the permission function.
     */
    countProjects: (params: { userId: UserId }) => number;
}
