import { describe, expect, it } from "vitest";
import { renderLoginPage } from "./login.page";

describe("Login page", () => {

    it("renders a form posting to /login", async () => {
        const html = renderLoginPage({});
        expect(html).toContain(`<form method="post" action="/login">`);
        expect(html).toContain(`name="login"`);
        expect(html).toContain(`name="password"`);
        expect(html).toContain(`type="password"`);
    });

    it("shows no error and no notice when there is none", () => {
        const html = renderLoginPage({});
        expect(html).not.toContain("class=\"message");
    });

    it("keeps the login after a failed attempt", () => {
        expect(renderLoginPage({ login: "alice" })).toContain(`value="alice"`);
    });

    it("shows the error above the form", () => {
        const html = renderLoginPage({ error: "Identifiant ou mot de passe incorrect." });
        expect(html).toContain("Identifiant ou mot de passe incorrect.");
        expect(html).toContain(`role="alert"`);
    });

    describe("Escaping", () => {

        it("escapes the login it echoes back", () => {
            // The login is attacker-controlled text landing in the page after a
            // failed attempt: the textbook injection point.
            const html = renderLoginPage({ login: `"><script>alert(1)</script>` });
            expect(html).not.toContain("<script>alert(1)</script>");
            expect(html).toContain("&quot;&gt;&lt;script&gt;");
        });

        it("escapes an attribute break-out attempt", () => {
            const html = renderLoginPage({ login: `" onfocus="alert(1)` });
            // The quote is escaped, so the value never closes early and the
            // handler stays inside it.
            expect(html).toContain(`value="&quot; onfocus=&quot;alert(1)"`);
        });

        it("escapes the error and the notice too", () => {
            const html = renderLoginPage({ error: "<b>x</b>", notice: "<i>y</i>" });
            expect(html).not.toContain("<b>x</b>");
            expect(html).not.toContain("<i>y</i>");
            expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
        });

        it("escapes the title", () => {
            expect(renderLoginPage({ title: "</title><script>" }))
                .not.toContain("</title><script>");
        });

        it("escapes the ampersand first, so nothing is double-decoded", () => {
            // &lt; must come out as &amp;lt;, not as a literal <.
            expect(renderLoginPage({ login: "&lt;script&gt;" })).toContain("&amp;lt;script&amp;gt;");
        });

    });

});
