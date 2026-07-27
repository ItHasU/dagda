import { AuthEvents } from "@dagda/shared/src/auth/events";
import { UserInfo } from "@dagda/shared/src/auth/types";
import { Dagda, DagdaRegistry } from "@dagda/shared/src/dagda";
import { NotificationService } from "@dagda/shared/src/notification/service";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DagdaClient } from "../app";
import { AuthService, AuthServiceImpl } from "./auth.service";

/**
 * The client-side auth service (ROADMAP tranche 3): the standard
 * `Dagda.get("auth")` door onto who is logged in, replacing the special-cased
 * `DagdaClient.currentUser` as the way application/component code reaches it
 * — `DagdaClient` still holds the account, this is a thin accessor over it.
 */

const ALICE: UserInfo = {
    id: 1,
    login: "alice",
    displayName: "Alice",
    isSuperAdmin: false,
    enabled: true,
    roleId: null,
    permissions: []
};

vi.mock("../api", () => ({
    apiCall: vi.fn()
}));

// Imported after the mock so the mocked module is what `DagdaClient` sees.
import { apiCall } from "../api";

describe("AuthServiceImpl", () => {

    afterEach(async () => {
        Dagda.reset(new DagdaRegistry());
        // `DagdaClient._systemInfo` is module state, not part of the
        // registry `Dagda.reset()` swaps out — clear it too, so one test's
        // account never leaks into the next.
        vi.mocked(apiCall).mockRejectedValueOnce(new Error("reset"));
        await DagdaClient.refreshSystemInfo();
        vi.restoreAllMocks();
    });

    it("answers null before refreshSystemInfo() has ever resolved", () => {
        expect(new AuthServiceImpl().currentUser).toBeNull();
    });

    it("reflects the account once DagdaClient has read the system information", async () => {
        Dagda.init<{ notification: NotificationService<AuthEvents>["notification"] }>({
            notification: { on: vi.fn(), broadcast: vi.fn(), notifyLocal: vi.fn() }
        });
        vi.mocked(apiCall).mockResolvedValueOnce({ startTimeMilliseconds: 0, errors: [], user: ALICE, routes: [] });

        await DagdaClient.refreshSystemInfo();

        expect(new AuthServiceImpl().currentUser).toEqual(ALICE);
    });

    it("is reachable via Dagda.get(\"auth\") once registered", () => {
        const auth = new AuthServiceImpl();
        Dagda.init<AuthService>({ auth });
        expect(Dagda.get<AuthService>("auth")).toBe(auth);
    });

    it("logout() sends the browser to the server's /logout route", () => {
        const original = window.location;
        // No existing client spec stubs `window.location` yet (jsdom's
        // implements navigation only partially, and warns on a plain
        // assignment) — this is the minimal reassignment that lets
        // `location.href` be asserted on and then restored.
        Object.defineProperty(window, "location", {
            configurable: true,
            value: { ...original, href: "" }
        });

        try {
            new AuthServiceImpl().logout();
            expect(window.location.href).toBe("/logout");
        } finally {
            Object.defineProperty(window, "location", { configurable: true, value: original });
        }
    });

    it("fires userInfoChanged locally once the current user becomes known (regression: the event used to be dead on the sending end)", async () => {
        const notifyLocal = vi.fn();
        Dagda.init<{ notification: NotificationService<AuthEvents>["notification"] }>({
            notification: { on: vi.fn(), broadcast: vi.fn(), notifyLocal }
        });
        vi.mocked(apiCall).mockResolvedValueOnce({ startTimeMilliseconds: 0, errors: [], user: ALICE, routes: [] });

        await DagdaClient.refreshSystemInfo();

        expect(notifyLocal).toHaveBeenCalledWith("userInfoChanged", ALICE);
    });

    it("never broadcasts userInfoChanged over the network — that would leak this session's identity to every other connected browser (FEATURES §6)", async () => {
        const broadcast = vi.fn();
        Dagda.init<{ notification: NotificationService<AuthEvents>["notification"] }>({
            notification: { on: vi.fn(), broadcast, notifyLocal: vi.fn() }
        });
        vi.mocked(apiCall).mockResolvedValueOnce({ startTimeMilliseconds: 0, errors: [], user: ALICE, routes: [] });

        await DagdaClient.refreshSystemInfo();

        expect(broadcast).not.toHaveBeenCalled();
    });

});
