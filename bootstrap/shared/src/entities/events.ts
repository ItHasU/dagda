import { NoteId, ProjectId } from "./types";

/**
 * Application events pushed from the server to the clients (FEATURES §6),
 * on top of the framework's own (`DagdaAppEvents`, see `../services.ts`).
 *
 * The only declaration of `AppEvents` in the boilerplate — it used to also
 * exist, unused and pointing at an unrelated EurekAI field, in
 * `services.ts`; that one is gone, this is the one `AppTypes["events"]`
 * actually resolves to.
 */
export type AppEvents = {
    /**
     * A note was added to one of your projects. Sent only to the project's
     * owner (FEATURES §6: recipient filtering, ROADMAP tranche 4) — see
     * `ServerApp._submit()`, which is also where `totalNotes` comes from
     * (the `notes` custom service, FEATURES §9).
     */
    noteAdded: {
        projectId: ProjectId;
        noteId: NoteId;
        text: string;
        totalNotes: number;
    };
}
