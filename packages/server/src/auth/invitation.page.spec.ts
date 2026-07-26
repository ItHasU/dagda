import { describe, expect, it } from "vitest";
import { renderInvitationPage } from "./invitation.page";

describe("Invitation page", () => {

    it("renders a set-password form for a valid token", () => {
        const html = renderInvitationPage({ valid: true, login: "alice" });
        expect(html).toContain("alice");
        expect(html).toContain(`name="password"`);
        expect(html).toContain(`name="confirm"`);
        expect(html).toContain(`type="password"`);
        expect(html).toContain("<form");
    });

    it("shows no form for an invalid or expired token", () => {
        const html = renderInvitationPage({ valid: false });
        expect(html).not.toContain("<form");
        expect(html).toContain("Lien invalide");
        expect(html).toContain(`href="/login"`);
    });

    it("shows the error above the form", () => {
        const html = renderInvitationPage({ valid: true, login: "alice", error: "Les deux mots de passe ne correspondent pas." });
        expect(html).toContain("Les deux mots de passe ne correspondent pas.");
        expect(html).toContain(`role="alert"`);
    });

    it("escapes the login it displays", () => {
        const html = renderInvitationPage({ valid: true, login: `<script>alert(1)</script>` });
        expect(html).not.toContain("<script>alert(1)</script>");
        expect(html).toContain("&lt;script&gt;");
    });

});
