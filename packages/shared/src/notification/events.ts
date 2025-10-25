import { AuthEvents } from "../auth/events";

/** Web socket related events */
export type SocketEvents = {
    /** Only triggered on the client side */
    connected: boolean;
}


/** All events available in the application */
export type DagdaEvents = SocketEvents & AuthEvents;