/** Auth related events */
export type AuthEvents = {
    /** Only triggered on the client side */
    userInfoChanged: {
        /** The user display name */
        displayName: string;
        /** The user photo URL */
        photoURL?: string;
    };
};