import { Dagda } from "@dagda/shared/src/dagda";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ToastHost } from "../toast/toast.component";
import { DialogHost, openDialog } from "./dialog.component";

function text(content: string): Node {
    const node = document.createElement("p");
    node.textContent = content;
    return node;
}

describe("DialogHost", () => {

    let host: DialogHost;

    beforeEach(async () => {
        document.body.replaceChildren();
        Dagda.init({});
        host = new DialogHost();
        document.body.appendChild(host);
        await host.refresh();
        // The "throws" case surfaces its error as a toast; a host to catch it.
        const toastHost = new ToastHost();
        document.body.appendChild(toastHost);
        await toastHost.refresh();
    });

    afterEach(() => {
        document.body.replaceChildren();
    });

    it("starts hidden", () => {
        expect(host.querySelector(".dialog-backdrop")!.hasAttribute("hidden")).toBe(true);
    });

    it("shows the title, body and one button per action", () => {
        host.open({ title: "Nouveau rôle", body: text("le corps"), actions: [{ label: "Annuler" }, { label: "Créer", className: "btn-primary" }] });

        expect(host.querySelector(".dialog-title")!.textContent).toBe("Nouveau rôle");
        expect(host.querySelector(".dialog-body")!.textContent).toBe("le corps");
        const buttons = host.querySelectorAll(".dialog-actions button");
        expect(Array.from(buttons).map(b => b.textContent)).toEqual(["Annuler", "Créer"]);
        expect(buttons[1]!.className).toContain("btn-primary");
    });

    it("is reachable through openDialog() once mounted", () => {
        openDialog({ title: "Reached", body: text("x"), actions: [] });
        expect(host.querySelector(".dialog-title")!.textContent).toBe("Reached");
    });

    it("closes on a button with no onClick, calling nothing", () => {
        host.open({ title: "T", body: text("x"), actions: [{ label: "Annuler" }] });
        host.querySelector<HTMLButtonElement>(".dialog-actions button")!.click();
        expect(host.querySelector(".dialog-backdrop")!.hasAttribute("hidden")).toBe(true);
    });

    it("calls onClick and closes on success", async () => {
        let called = false;
        host.open({ title: "T", body: text("x"), actions: [{ label: "Go", onClick: () => { called = true; } }] });
        host.querySelector<HTMLButtonElement>(".dialog-actions button")!.click();
        await Promise.resolve();
        await Promise.resolve();

        expect(called).toBe(true);
        expect(host.querySelector(".dialog-backdrop")!.hasAttribute("hidden")).toBe(true);
    });

    it("stays open and shows a toast when onClick throws", async () => {
        host.open({
            title: "T", body: text("x"),
            actions: [{ label: "Go", onClick: () => { throw new Error("le nom est déjà pris"); } }]
        });
        host.querySelector<HTMLButtonElement>(".dialog-actions button")!.click();
        await Promise.resolve();
        await Promise.resolve();

        expect(host.querySelector(".dialog-backdrop")!.hasAttribute("hidden")).toBe(false);
        expect(document.querySelector(".dagda-toast")?.textContent).toContain("le nom est déjà pris");
    });

    it("clears the body on close, so a stale form is not still there next time", () => {
        host.open({ title: "T", body: text("stale content"), actions: [{ label: "Annuler" }] });
        host.close();
        expect(host.querySelector(".dialog-body")!.textContent).toBe("");
    });

    it("closes when the backdrop itself is clicked", () => {
        host.open({ title: "T", body: text("x"), actions: [] });
        host.querySelector<HTMLElement>(".dialog-backdrop")!.click();
        expect(host.querySelector(".dialog-backdrop")!.hasAttribute("hidden")).toBe(true);
    });

    it("does not close when the dialog content itself is clicked", () => {
        host.open({ title: "T", body: text("x"), actions: [] });
        host.querySelector<HTMLElement>(".dialog")!.click();
        expect(host.querySelector(".dialog-backdrop")!.hasAttribute("hidden")).toBe(false);
    });

    it("closes on Escape", () => {
        host.open({ title: "T", body: text("x"), actions: [] });
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        expect(host.querySelector(".dialog-backdrop")!.hasAttribute("hidden")).toBe(true);
    });

    it("ignores Escape when already closed", () => {
        expect(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))).not.toThrow();
    });

});
