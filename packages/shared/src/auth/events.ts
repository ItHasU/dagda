import { UserInfo } from "./types";

/** Auth related events */
export type AuthEvents = {
    /**
     * The current account became known, or changed.
     *
     * Only triggered on the client side, by DagdaClient once it has read the
     * system information. Components listen rather than call, so a component
     * built before the answer arrived still gets it.
     */
    userInfoChanged: UserInfo;
};
