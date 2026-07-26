import { describe, expect, it } from "vitest";
import { hasPermission } from "./permissions";
import { UserInfo } from "./types";

function user(overrides: Partial<UserInfo> = {}): UserInfo {
    return { id: 1, login: "alice", displayName: "Alice", isSuperAdmin: false, enabled: true, roleId: null, permissions: [], ...overrides };
}

describe("hasPermission", () => {

    it("grants a permission the user's role carries", () => {
        expect(hasPermission(user({ permissions: ["users.manage"] }), "users.manage")).toBe(true);
    });

    it("refuses a permission the user's role does not carry", () => {
        expect(hasPermission(user({ permissions: ["users.manage"] }), "roles.manage")).toBe(false);
    });

    it("refuses everything for a user with no role", () => {
        expect(hasPermission(user({ permissions: [] }), "users.manage")).toBe(false);
    });

    it("grants everything to a super-admin, regardless of its (empty) permission list", () => {
        expect(hasPermission(user({ isSuperAdmin: true, permissions: [] }), "users.manage")).toBe(true);
        expect(hasPermission(user({ isSuperAdmin: true, permissions: [] }), "anything.at.all")).toBe(true);
    });

});
