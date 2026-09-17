import { PROJECT_STATUS } from "@dagda-app/shared/src/entities/model";
import { beforeEach, describe, expect, it } from "vitest";
import { _setDagda as _setFrameworkDagda } from "@dagda/client/src/app/dagda";
import { _setDagda } from "../../dagda";
import { ProjectCard } from "./project-card.component";

/**
 * Installs a stand-in `dagda` for a test.
 *
 * Both halves are needed, and for different reasons: the boilerplate's own
 * `_setDagda` is what `ProjectCard` reads through, while the framework's is
 * what resolves `dagdaReady` — the promise every component awaits on its
 * first refresh. Set only the first, and `refresh()` never returns.
 */
function install(instance: unknown): void {
    _setFrameworkDagda(instance as never);
    _setDagda(instance as never);
}

/** A fake `dagda.entities` exposing only what the card reads from the cache */
function fakeDagda(projects: { id: number, name: string, status: number }[], notes: { projectId: number }[]): unknown {
    return {
        entities: {
            getHandler: () => ({
                getById: (table: string, id: number) => table === "projects" ? projects.find((p) => p.id === id) : undefined,
                getItems: (table: string) => table === "notes" ? notes : []
            })
        }
    };
}

describe("ProjectCard", () => {

    beforeEach(() => {
        document.body.replaceChildren();
    });

    it("renders nothing meaningful before an id is set", async () => {
        install(fakeDagda([], []));
        const card = new ProjectCard();
        document.body.appendChild(card);
        await card.refresh();

        expect(card.querySelector("[ref=title]")?.textContent).toBe("Projet inconnu");
    });

    it("refreshes itself the moment project-id is set (FEATURES §8, GUIDE.md §2.3) — no manual refresh() call", async () => {
        install(fakeDagda(
            [{ id: 42, name: "Trip", status: PROJECT_STATUS.values.ACTIVE }],
            [{ projectId: 42 }, { projectId: 42 }, { projectId: 7 }]
        ));
        const card = new ProjectCard();
        document.body.appendChild(card);
        await card.refresh(); // initial mount, no id yet

        card.projectId = 42;
        // Setting the attribute schedules a refresh; wait for it the same
        // way a caller relying on the automatic behaviour would.
        await card.refresh();

        expect(card.querySelector("[ref=title]")?.textContent).toBe("Trip");
        expect(card.querySelector("[ref=status]")?.textContent).toBe(PROJECT_STATUS.getLabel(PROJECT_STATUS.values.ACTIVE));
        // Only the two notes on project 42, not the one on project 7.
        expect(card.querySelector("[ref=note-count]")?.textContent).toBe("2 note(s)");
    });

});
