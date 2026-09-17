import { EntitiesHandler } from "@dagda/shared/src/entities/handler";
import { TestContext, TestContextAdapter, TestPersistanceAdapter } from "@dagda/shared/src/entities/impl/test.adapters";
import { asNamed } from "@dagda/shared/src/entities/tools/named";
import { AppEntityTypes, UserId } from "@dagda-app/shared/src/entities/types";
import { describe, expect, it } from "vitest";
import { AppTransaction, APP_MODEL_FUNCTIONS } from "./model";
import { APP_MODEL as APP_ENTITIES_MODEL } from "@dagda-app/shared/src/entities/model";

/**
 * The client-side half of ROADMAP tranche 5's EurekAI risk #2 — the server
 * side is `bootstrap/server/src/app.spec.ts`. Same mechanism
 * (`_updateForeignKeys`), same framework test fixtures the handler's own
 * spec uses (`handler.spec.ts`, "inserts a related item and refetch"), no
 * real network: a `TestPersistanceAdapter` stands in for the server and
 * still runs the real id-remapping logic.
 */
describe("APP_MODEL_FUNCTIONS.createProject", () => {

    it("reuses the project's temporary id for the note's projectId, then both are remapped to their real ids", async () => {
        const handler = new EntitiesHandler<AppEntityTypes, TestContext<keyof AppEntityTypes>>(
            APP_ENTITIES_MODEL,
            new TestContextAdapter(),
            new TestPersistanceAdapter<AppEntityTypes>(APP_ENTITIES_MODEL)
        );
        const userId = asNamed<"USER_ID", number>(1) as UserId;

        let project!: AppEntityTypes["projects"];
        let note!: AppEntityTypes["notes"];
        await handler.withTransaction((tr) => {
            // Cast: the framework's in-memory fixture parameterizes the
            // transaction on its own `TestContext`, not on `AppContexts`.
            // Harmless here — `createProject` only inserts rows, it never
            // reads a context — and it keeps the production typing strict.
            const created = APP_MODEL_FUNCTIONS.createProject.fn(tr as unknown as AppTransaction, userId, "Trip", "Bring sunscreen") as {
                project: AppEntityTypes["projects"], note: AppEntityTypes["notes"]
            };
            project = created.project;
            note = created.note;
        });

        // Before the server has answered: the note points at the project's
        // temporary (negative) id, read directly off the object insert()
        // handed back — nothing here hardcodes it.
        expect(project.id, "insert() should have allocated a temporary id").toBeLessThan(0);
        expect(note.projectId, "the note should reuse the project's temporary id").toBe(project.id);

        await handler.waitForSubmit();

        // After the round trip: `_updateForeignKeys` mutated the very
        // objects returned above, in place — same proof handler.spec.ts
        // already gives for the framework's own generic fixtures.
        expect(project.id, "the project's id should have been remapped to a real one").toBeGreaterThan(0);
        expect(note.projectId, "the note should still point at the project, now by its real id").toBe(project.id);
        expect(note.text).toBe("Bring sunscreen");
    });

});
