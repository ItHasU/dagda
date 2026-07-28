import { AuthEvents } from "@dagda/shared/src/auth/events";
import { UserInfo } from "@dagda/shared/src/auth/types";
import { NotificationService } from "@dagda/shared/src/notification/service";
import { EventHandlerData, EventHandlerImpl, EventListener } from "@dagda/shared/src/tools/events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DagdaClient } from "../../app";
import { _setDagda } from "../../app/dagda";
import { LoginComponent } from "./login.component";

/**
 * The account badge (FEATURES §8).
 *
 * The tests that matter here are about ordering. `userInfoChanged` is
 * broadcast once, while the shell is being assembled, and a component that
 * subscribes one tick later hears nothing — which is exactly how this badge
 * spent a version reading "Unknown", and then a second one reading nothing at
 * all.
 */

const ADMIN: UserInfo = { id: 1, login: "admin", displayName: "Ada Lovelace", isSuperAdmin: true, enabled: true, roleId: null, permissions: [] };

/** A notification service that only does what this component asks of it */
function notifications(): NotificationService<AuthEvents> & { fire: (user: UserInfo) => void } {
    const data: EventHandlerData<AuthEvents> = {};
    return {
        on: <K extends keyof AuthEvents>(name: K, listener: EventListener<AuthEvents[K]>): void => {
            EventHandlerImpl.on(data, name, listener);
        },
        broadcast: (): void => { },
        fire: (user: UserInfo): void => {
            EventHandlerImpl.fire<AuthEvents, "userInfoChanged">(data, "userInfoChanged", user);
        }
    } as unknown as NotificationService<AuthEvents> & { fire: (user: UserInfo) => void };
}

describe("LoginComponent", () => {

    let notification: ReturnType<typeof notifications>;

    beforeEach(() => {
        document.body.replaceChildren();
        notification = notifications();
        _setDagda({ notification } as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("shows the account that was already known when it was built", async () => {
        // The ordering that broke it: the answer arrived before this component
        // existed, so there is no event left to catch. It has to ask.
        vi.spyOn(DagdaClient, "currentUser", "get").mockReturnValue(ADMIN);

        const component = new LoginComponent();
        document.body.appendChild(component);
        await component.refresh();

        expect(component.querySelector(".shell-initials")?.textContent).toBe("AL");
        expect(component.querySelector(".shell-label")?.textContent).toBe("Ada Lovelace");
    });

    it("shows the account announced after it was built", async () => {
        vi.spyOn(DagdaClient, "currentUser", "get").mockReturnValue(null);

        const component = new LoginComponent();
        document.body.appendChild(component);
        await component.refresh();
        expect(component.querySelector(".shell-initials")?.textContent).toBe("");

        notification.fire(ADMIN);
        await component.refresh();
        expect(component.querySelector(".shell-initials")?.textContent).toBe("AL");
    });

    it("names the link, which is the only text a rail shows of it", async () => {
        vi.spyOn(DagdaClient, "currentUser", "get").mockReturnValue(ADMIN);
        const component = new LoginComponent();
        document.body.appendChild(component);
        await component.refresh();

        const link = component.querySelector("a")!;
        expect(link.getAttribute("aria-label")).toBe("Ada Lovelace — se déconnecter");
        expect(link.getAttribute("href")).toBe("/logout");
    });

    it("still leads out when nobody is known yet", async () => {
        vi.spyOn(DagdaClient, "currentUser", "get").mockReturnValue(null);
        const component = new LoginComponent();
        document.body.appendChild(component);
        await component.refresh();

        expect(component.querySelector("a")?.getAttribute("aria-label")).toBe("Se déconnecter");
    });

    describe("initials", () => {

        it("takes the first letter of the first two words", () => {
            expect(LoginComponent.getInitials("Ada Lovelace")).toBe("AL");
        });

        it("stops at two, however many names there are", () => {
            expect(LoginComponent.getInitials("Jean Baptiste Camille Corot")).toBe("JB");
        });

        it("copes with a single name, and with none", () => {
            expect(LoginComponent.getInitials("admin")).toBe("A");
            expect(LoginComponent.getInitials("")).toBe("");
            expect(LoginComponent.getInitials("   ")).toBe("");
        });

    });

});
