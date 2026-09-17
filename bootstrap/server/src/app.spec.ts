import { RequestOptionsFromClient } from "@dagda/server/src/api";
import { RoleStore } from "@dagda/server/src/auth/roles";
import { UserStore } from "@dagda/server/src/auth/users";
import { createTestDatabase, TEST_DB_URL, TestDatabase } from "@dagda/server/src/test/pg.fixture";
import { UserInfo } from "@dagda/shared/src/auth/types";
import { asNamed } from "@dagda/shared/src/entities/tools/named";
import { OperationType, SQLOperation, SQLTransactionData, SQLTransactionResult } from "@dagda/shared/src/sql/transaction";
import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";
import { APP_CONTEXT_ADAPTER, AppContexts } from "@dagda-app/shared/src/entities/contexts";
import { APP_MODEL, PROJECT_STATUS } from "@dagda-app/shared/src/entities/model";
import { AppEntityTypes, NoteEntity, ProjectEntity } from "@dagda-app/shared/src/entities/types";
import { APP_PERMISSIONS } from "@dagda-app/shared/src/permissions";
import { ServerApp, isOwnAccount } from "./app";

const available = inject("databaseAvailable");
const NOTES = APP_MODEL.getTableSqlName("notes");

/**
 * Covers everything Lot 2a adds to the boilerplate that a "small, exemplary"
 * app.ts shouldn't itself carry the proof for: the EurekAI risk #2 scenario
 * (ROADMAP), the `notes.manage` permission actually gating a write, the
 * `noteAdded` notification's recipient filter, and the `notes`/`project`
 * fetch pairing. A real `ServerApp` is built against the isolated test
 * schema, migrated, but never `listen()`s — the same posture MQTTToolbox2's
 * `dashboards.spec.ts` uses for the equivalent framework-level checks.
 */
describe.runIf(available)("bootstrap ServerApp", () => {

    let db: TestDatabase;
    let app: ServerApp;
    let owner: UserInfo;
    let stranger: UserInfo;

    beforeEach(async () => {
        db = await createTestDatabase("bootstrap");

        const url = new URL(TEST_DB_URL);
        url.searchParams.set("options", `-c search_path=${db.schema}`);
        process.env["APP_PORT"] = "0";
        process.env["APP_BASE_URL"] = "http://localhost";
        process.env["APP_DATABASE_URL"] = url.toString();

        app = new ServerApp({ staticFolder: "." }, APP_MODEL, APP_CONTEXT_ADAPTER, undefined, undefined, APP_PERMISSIONS);
        await (app as unknown as { migrate: () => Promise<void> }).migrate();

        const roles: RoleStore = (app as unknown as { _roles: RoleStore })._roles;
        const users: UserStore = (app as unknown as { _users: UserStore })._users;
        const editorRole = await roles.create({ name: "Editor", permissions: ["notes.manage"] });

        const createdOwner = await users.create({ login: "alice", password: "hunter2" });
        await users.setRole(createdOwner.id, editorRole.id);
        owner = (await users.getById(createdOwner.id))!;

        // No role: exercises both "no notes.manage" and "not their own account".
        const createdStranger = await users.create({ login: "bob", password: "hunter2" });
        stranger = (await users.getById(createdStranger.id))!;
    });

    afterEach(async () => {
        await db?.dispose();
    });

    /** Calls the real `_submit()`, as the `/submit` route would */
    function submitAs(user: UserInfo, operations: SQLOperation<AppEntityTypes, keyof AppEntityTypes>[]): Promise<SQLTransactionResult> {
        const options: RequestOptionsFromClient = {
            type: "client",
            request: {} as RequestOptionsFromClient["request"],
            response: {} as RequestOptionsFromClient["response"],
            user
        };
        const transactionData: SQLTransactionData<AppEntityTypes, AppContexts> = { operations, contexts: [] };
        return (app as unknown as {
            _submit: (t: SQLTransactionData<AppEntityTypes, AppContexts>, r: RequestOptionsFromClient) => Promise<SQLTransactionResult>
        })._submit(transactionData, options);
    }

    /** Calls the real `_fetch()`, as the `/fetch` route would */
    function fetchAs(user: UserInfo, context: AppContexts): Promise<{ projects?: ProjectEntity[], notes?: NoteEntity[] }> {
        const options: RequestOptionsFromClient = {
            type: "client",
            request: {} as RequestOptionsFromClient["request"],
            response: {} as RequestOptionsFromClient["response"],
            user
        };
        return (app as unknown as {
            _fetch: (c: AppContexts, r: RequestOptionsFromClient) => Promise<{ projects?: ProjectEntity[], notes?: NoteEntity[] }>
        })._fetch(context, options);
    }

    async function createProject(user: UserInfo, name: string): Promise<number> {
        const result = await submitAs(user, [{
            type: OperationType.INSERT,
            options: { table: "projects", item: { id: -1, name, description: "", userId: user.id, status: PROJECT_STATUS.values.ACTIVE } as never }
        }]);
        return result.updatedIds[-1]!;
    }

    describe("EurekAI risk #2 — temporary id reused within the same transaction", () => {

        it("inserts a project and a note referencing it by temporary id, in one transaction, and remaps it to the real id server-side", async () => {
            // The note references the project by the *temporary* id the
            // insert above returns to the caller — before the server has
            // assigned the real one, both operations submitted together.
            const result = await submitAs(owner, [
                { type: OperationType.INSERT, options: { table: "projects", item: { id: -1, name: "Trip", description: "", userId: owner.id, status: PROJECT_STATUS.values.ACTIVE } as never } },
                { type: OperationType.INSERT, options: { table: "notes", item: { id: -2, projectId: -1, text: "Bring sunscreen" } as never } }
            ]);

            const projectId = result.updatedIds[-1];
            const noteId = result.updatedIds[-2];
            expect(projectId, "the project's temporary id must have been replaced").toBeGreaterThan(0);
            expect(noteId, "the note's temporary id must have been replaced").toBeGreaterThan(0);

            // Not the client-computed value: the row actually written to
            // Postgres, read back independently of anything the transaction
            // machinery itself might report.
            const row = await (app as unknown as { _db: { get: (q: string, ...p: unknown[]) => Promise<{ projectId: number, text: string } | null> } })
                ._db.get(`SELECT "projectId", "text" FROM ${NOTES} WHERE "id" = $1`, noteId);
            expect(row?.projectId, "the note must point at the project's real id, not -1").toBe(projectId);
            expect(row?.text).toBe("Bring sunscreen");
        });

        it("also works updating a note to point at a project inserted earlier in the same transaction", async () => {
            const existingProjectId = await createProject(owner, "Placeholder");
            const noteResult = await submitAs(owner, [{
                type: OperationType.INSERT,
                options: { table: "notes", item: { id: -1, projectId: existingProjectId, text: "temp" } as never }
            }]);
            const noteId = noteResult.updatedIds[-1]!;

            const result = await submitAs(owner, [
                { type: OperationType.INSERT, options: { table: "projects", item: { id: -1, name: "Real one", description: "", userId: owner.id, status: PROJECT_STATUS.values.ACTIVE } as never } },
                { type: OperationType.UPDATE, options: { table: "notes", id: asNamed(noteId), values: { projectId: -1 } } }
            ]);
            const newProjectId = result.updatedIds[-1];

            const row = await (app as unknown as { _db: { get: (q: string, ...p: unknown[]) => Promise<{ projectId: number } | null> } })
                ._db.get(`SELECT "projectId" FROM ${NOTES} WHERE "id" = $1`, noteId);
            expect(row?.projectId).toBe(newProjectId);
        });

    });

    describe("notes.manage — declared and actually checked", () => {

        it("rejects inserting a note without notes.manage", async () => {
            const projectId = await createProject(owner, "Alice's project");
            await expect(submitAs(stranger, [{
                type: OperationType.INSERT,
                options: { table: "notes", item: { id: -1, projectId, text: "sneaky" } as never }
            }])).rejects.toThrow(/Missing permission/);
        });

        it("allows inserting a note with notes.manage", async () => {
            const projectId = await createProject(owner, "Alice's project");
            await expect(submitAs(owner, [{
                type: OperationType.INSERT,
                options: { table: "notes", item: { id: -1, projectId, text: "fine" } as never }
            }])).resolves.toBeDefined();
        });

    });

    describe("_fetch(\"project\") — notes travel with their project", () => {

        it("includes a project's notes in the same fetch", async () => {
            const projectId = await createProject(owner, "With notes");
            await submitAs(owner, [{
                type: OperationType.INSERT,
                options: { table: "notes", item: { id: -1, projectId, text: "one" } as never }
            }]);

            const view = await fetchAs(owner, { type: "project", options: { projectId: asNamed(projectId) } });
            expect(view.notes?.map((n) => n.text)).toEqual(["one"]);
        });

    });

    describe("noteAdded — a real notification, filtered to the project's owner", () => {

        it("broadcasts noteAdded only to the project's owner, with the running total from the notes service", async () => {
            const projectId = await createProject(owner, "Notified");
            const broadcast = vi.spyOn(app, "broadcast");

            await submitAs(owner, [{
                type: OperationType.INSERT,
                options: { table: "notes", item: { id: -1, projectId, text: "first" } as never }
            }]);

            const call = broadcast.mock.calls.find(([kind]) => kind === "noteAdded");
            expect(call, "noteAdded should have been broadcast").toBeDefined();
            const [, data, recipients] = call!;
            expect(data).toMatchObject({ projectId, text: "first", totalNotes: 1 });
            expect(recipients?.(owner)).toBe(true);
            expect(recipients?.(stranger)).toBe(false);

            // A second note on the same project: the custom `notes` service
            // (FEATURES §9) is a real DB-backed count, not a constant.
            await submitAs(owner, [{
                type: OperationType.INSERT,
                options: { table: "notes", item: { id: -1, projectId, text: "second" } as never }
            }]);
            const secondCall = broadcast.mock.calls.filter(([kind]) => kind === "noteAdded")[1];
            expect(secondCall?.[1]).toMatchObject({ totalNotes: 2 });
        });

    });

    describe("countProjects — parameterized permission (FEATURES §5)", () => {

        it("counts only the given account's own projects", async () => {
            await createProject(owner, "One");
            await createProject(owner, "Two");
            await createProject(stranger, "Not counted");

            const count = await (app as unknown as { _countProjects: (id: UserInfo["id"]) => Promise<number> })._countProjects(owner.id);
            expect(count).toBe(2);
        });

        it("isOwnAccount allows a caller asking about themselves, refuses anyone else", () => {
            expect(isOwnAccount(owner, { userId: asNamed(owner.id) })).toBe(true);
            expect(isOwnAccount(owner, { userId: asNamed(stranger.id) })).toBe(false);
        });

    });

});
