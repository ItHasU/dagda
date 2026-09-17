import { EntitiesCache } from "@dagda/shared/src/entities/tools/cache";
import { asNamed } from "@dagda/shared/src/entities/tools/named";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { _setDagda as _setFrameworkDagda } from "@dagda/client/src/app/dagda";
import { PROJECT_STATUS } from "@dagda-app/shared/src/entities/model";
import { NoteEntity, ProjectEntity } from "@dagda-app/shared/src/entities/types";
import { _setDagda } from "../dagda";
import { ProjectCard } from "../components/project-card/project-card.component";

/**
 * Measures the two things ROADMAP tranche 5 asks about — "listes longues et
 * rendu dense (milliers d'éléments)" — instead of guessing at them: the cost
 * of reading the entities cache (`EntitiesCache.getItems`/`getById`, and the
 * `.filter(...)` `ProjectCard`/`ProjectDetailPage` do over it) and the cost of
 * building the DOM for a list of `<project-card>` components, at 100 / 1 000
 * / 5 000 elements.
 *
 * ## What this measures, and what it does not
 *
 * This runs under jsdom (`environment: "jsdom"` in vitest.perf.config.ts), not
 * a real browser: `document.createElement`, `innerHTML`, `appendChild` all
 * happen against jsdom's pure-JS DOM implementation. jsdom is not a
 * reflow/paint/layout engine and has no GPU compositing, so these numbers say
 * nothing about paint time, layout thrashing or scroll jank — only about the
 * cost of the JavaScript this framework runs (object allocation, `Map`
 * iteration, template cloning, custom element construction, attribute
 * marshalling). A real-browser number, taken under Chromium via Playwright,
 * would differ — probably faster for pure DOM node creation (native code) and
 * would additionally capture layout/paint, which this cannot. Read absolute
 * numbers as an approximation of the framework's own overhead, and the *shape*
 * of the curve across sizes (linear vs. superlinear) as the more reliable
 * signal.
 *
 * Node/jsdom timing also carries JIT warm-up and GC noise, worse at small N.
 * Numbers at N=100 are noisier and less meaningful than the trend from
 * N=1 000 to N=5 000. This was not a theoretical worry: an early version of
 * this file, without the `warmUp()` below, measured Table C (which does
 * strictly more work than Table B) as *faster* than Table B at every size —
 * an artifact of Vitest running every test in this file in one V8 isolate,
 * sequentially, so whichever table happened to run first paid the JIT
 * warm-up cost and every later table looked artificially cheap. `warmUp()`
 * narrows that gap but does not erase it at N=100 — read the small-N rows
 * with that in mind, and prefer the N=1 000 → N=5 000 trend.
 *
 * ## What is deliberately isolated
 *
 * - Table A measures `EntitiesCache` alone, no DOM at all: `getItems()`, and
 *   the exact `.filter((note) => note.projectId === id)` pattern
 *   `ProjectCard._refresh()` and `ProjectDetailPage._refresh()` both run
 *   against the *entire* `notes` cache (not scoped to a context) — repeated
 *   once per rendered card, which is what turns a linear list into a
 *   quadratic one.
 * - Table B measures DOM construction (`new ProjectCard()`, attribute set,
 *   `@Ref()` resolution inside `_refresh()`) with the `notes` cache **empty**,
 *   so the filter above costs nothing and cannot pollute the number. Built
 *   with `new ProjectCard()` rather than
 *   `document.createElement("project-card")` — the way `ProjectsPage`
 *   actually does it — because jsdom throws (`NotSupportedError: Unexpected
 *   child nodes`) when a custom element's constructor sets `innerHTML`
 *   during `createElement`'s construction path; `project-card.component.spec.ts`
 *   hits the same limitation and works around it the same way. The
 *   constructor and `_refresh()` logic measured are identical either way —
 *   only the registry lookup `document.createElement` would add is skipped,
 *   and that lookup is not where any cost worth measuring lives.
 * - Table C repeats Table B with a `notes` cache the same size as the
 *   `projects` list — the realistic "visited many project pages, the cache
 *   accumulated notes" case — so the delta against Table B isolates what the
 *   filter alone adds on top of DOM construction.
 * - Table D repeats the Table C build a second time on the same container,
 *   the way `ProjectsPage._refresh()` actually behaves: it calls
 *   `replaceChildren()` and rebuilds every card from scratch on *every*
 *   refresh, not just the first — there is no reuse/diffing of existing
 *   cards. This checks whether a "refresh" is cheaper than a first render (it
 *   is not expected to be, by construction) and separately times the
 *   `replaceChildren()` teardown.
 * - Table E is the project-detail page's own list: no components, a plain
 *   `<li>` per note, against a `notes` cache made entirely of one project's
 *   notes (the worst case for that one page).
 *
 * ## Why this lives outside `npm test`
 *
 * A wall-clock number is not a correctness assertion. Coupled into
 * `vitest.config.ts` it would either be flaky on a slower machine or need
 * thresholds so loose they catch nothing. It is its own config
 * (`vitest.perf.config.ts`) with its own `include`, so `npm test` / `npx
 * vitest run` never collect it. The very loose `expect(...).toBeLessThan(...)`
 * calls below exist only to fail loudly if something regresses by an order of
 * magnitude — not to enforce a performance budget.
 *
 * Run with:
 *
 *   npx vitest run --config vitest.perf.config.ts
 */

const SIZES = [100, 1_000, 5_000];

/** One row of the results table, printed once at the end. */
interface ResultRow {
    table: string;
    scenario: string;
    n: number;
    ms: number;
}
const results: ResultRow[] = [];

function record(table: string, scenario: string, n: number, ms: number): void {
    results.push({ table, scenario, n, ms: Math.round(ms * 100) / 100 });
}

function buildProjects(n: number): ProjectEntity[] {
    const projects: ProjectEntity[] = [];
    for (let i = 1; i <= n; i++) {
        projects.push({
            id: asNamed(i),
            name: asNamed(`Project ${i}`),
            description: asNamed(""),
            userId: asNamed(1),
            status: asNamed(PROJECT_STATUS.values.ACTIVE)
        });
    }
    return projects;
}

/** `notesCount` notes total, spread round-robin over `projectsCount` distinct projects. */
function buildNotes(notesCount: number, projectsCount: number): NoteEntity[] {
    const notes: NoteEntity[] = [];
    for (let i = 1; i <= notesCount; i++) {
        notes.push({
            id: asNamed(i),
            projectId: asNamed(((i - 1) % Math.max(projectsCount, 1)) + 1),
            text: asNamed(`Note ${i}`)
        });
    }
    return notes;
}

/** Mirrors `EntitiesHandler.getById`/`getItems` (packages/shared/src/entities/handler.ts): a straight pass-through to `EntitiesCache`. */
function fakeDagda(projectsCache: EntitiesCache<ProjectEntity>, notesCache: EntitiesCache<NoteEntity>): unknown {
    return {
        entities: {
            getHandler: () => ({
                getById: (table: string, id: number) => table === "projects" ? projectsCache.getById(id) : notesCache.getById(id),
                getItems: (table: string) => table === "projects" ? projectsCache.getItems() : notesCache.getItems()
            })
        }
    };
}

function install(instance: unknown): void {
    _setFrameworkDagda(instance as never);
    _setDagda(instance as never);
}

function now(): number {
    return performance.now();
}

/**
 * Builds and discards a handful of cards, uncounted, before a measured run.
 *
 * All 18 tests in this file share one Node process and one V8 isolate
 * (Vitest runs a file's tests sequentially in one worker); without this, a
 * table that happens to run later (e.g. Table C, after Table B has already
 * exercised `ProjectCard`'s constructor and `_refresh()` thousands of times)
 * measures a JIT-optimized code path while an earlier table measures a cold
 * one — a confound in *table order*, not in what the tables claim to
 * isolate. This was caught empirically: Table C's build for a 5 000-element
 * *superset* of Table B's work initially came out faster than Table B alone.
 * Warming each measured run to the same degree makes the tables comparable
 * to each other, independent of the order they happen to run in.
 */
async function warmUp(dagda: unknown, sampleSize: number): Promise<void> {
    install(dagda);
    const scratch = document.createElement("div");
    const pending: Promise<void>[] = [];
    for (let i = 1; i <= sampleSize; i++) {
        const card = new ProjectCard();
        card.projectId = i;
        scratch.appendChild(card);
        pending.push(card.refresh());
    }
    await Promise.all(pending);
}

afterAll(() => {
    // eslint-disable-next-line no-console -- the whole point of this file is to be read by a human afterwards.
    console.table(results);
});

describe("Table A — EntitiesCache reads alone, no DOM", () => {

    for (const n of SIZES) {

        it(`getItems() over ${n} cached items`, () => {
            const cache = new EntitiesCache<ProjectEntity>();
            for (const project of buildProjects(n)) {
                cache.insert(project);
            }
            // Averaged over several calls: a single call at n=100 is too
            // fast (sub-microsecond range) to read off one sample reliably.
            const REPEATS = 20;
            const start = now();
            for (let i = 0; i < REPEATS; i++) {
                cache.getItems();
            }
            const totalMs = now() - start;
            record("A", "getItems() (avg/call)", n, totalMs / REPEATS);
            expect(cache.getItems()).toHaveLength(n);
        });

        it(`${n} cards each filtering a ${n}-note cache (ProjectCard's own .filter pattern, worst case)`, () => {
            const notesCache = new EntitiesCache<NoteEntity>();
            for (const note of buildNotes(n, n)) {
                notesCache.insert(note);
            }
            // This loop is exactly what happens once per rendered
            // <project-card>: ProjectCard._refresh() calls
            // dagda.entities.getHandler().getItems("notes").filter(note =>
            // note.projectId === id) — the *whole* notes cache, every time.
            const start = now();
            let total = 0;
            for (let projectId = 1; projectId <= n; projectId++) {
                total += notesCache.getItems().filter((note) => note.projectId === projectId).length;
            }
            const ms = now() - start;
            record("A", `${n}× filter over ${n} notes (O(n²) pattern)`, n, ms);
            expect(total).toBe(n); // one note per project, by construction
            // Loose smoke bound: catches a catastrophic regression (e.g. an
            // accidental O(n^3)), not a performance budget.
            expect(ms).toBeLessThan(30_000);
        });
    }

});

describe("Table B — DOM construction alone (empty notes cache)", () => {

    let container: HTMLDivElement;

    beforeEach(() => {
        document.body.replaceChildren();
        container = document.createElement("div");
        document.body.appendChild(container);
    });

    for (const n of SIZES) {

        it(`build + render ${n} <project-card> elements, no notes`, async () => {
            const projectsCache = new EntitiesCache<ProjectEntity>();
            for (const project of buildProjects(n)) {
                projectsCache.insert(project);
            }
            const dagda = fakeDagda(projectsCache, new EntitiesCache<NoteEntity>());
            await warmUp(dagda, Math.min(50, n));

            const pending: Promise<void>[] = [];
            const buildStart = now();
            for (let i = 1; i <= n; i++) {
                const card = new ProjectCard();
                card.projectId = i;
                container.appendChild(card);
                pending.push(card.refresh());
            }
            const buildMs = now() - buildStart;
            await Promise.all(pending);
            const totalMs = now() - buildStart;

            record("B", "synchronous build (create+append+set attribute)", n, buildMs);
            record("B", "total render (incl. async refresh completion)", n, totalMs);

            expect(container.children).toHaveLength(n);
            expect(container.lastElementChild?.querySelector("[ref=title]")?.textContent).toBe(`Project ${n}`);
            expect(totalMs).toBeLessThan(60_000);
        });
    }

});

describe("Table C — DOM construction with a populated notes cache (dense case)", () => {

    let container: HTMLDivElement;

    beforeEach(() => {
        document.body.replaceChildren();
        container = document.createElement("div");
        document.body.appendChild(container);
    });

    for (const n of SIZES) {

        it(`build + render ${n} <project-card> elements, ${n} notes cached (1 per project)`, async () => {
            const projectsCache = new EntitiesCache<ProjectEntity>();
            for (const project of buildProjects(n)) {
                projectsCache.insert(project);
            }
            const notesCache = new EntitiesCache<NoteEntity>();
            for (const note of buildNotes(n, n)) {
                notesCache.insert(note);
            }
            const dagda = fakeDagda(projectsCache, notesCache);
            await warmUp(dagda, Math.min(50, n));

            const pending: Promise<void>[] = [];
            const buildStart = now();
            for (let i = 1; i <= n; i++) {
                const card = new ProjectCard();
                card.projectId = i;
                container.appendChild(card);
                pending.push(card.refresh());
            }
            const buildMs = now() - buildStart;
            await Promise.all(pending);
            const totalMs = now() - buildStart;

            record("C", "synchronous build (create+append+set attribute)", n, buildMs);
            record("C", "total render (incl. filter + async completion)", n, totalMs);

            expect(container.children).toHaveLength(n);
            expect(container.lastElementChild?.querySelector("[ref=note-count]")?.textContent).toBe("1 note(s)");
            expect(totalMs).toBeLessThan(60_000);
        });
    }

});

describe("Table D — refresh cost: ProjectsPage rebuilds every card on every refresh", () => {

    let container: HTMLDivElement;

    beforeEach(() => {
        document.body.replaceChildren();
        container = document.createElement("div");
        document.body.appendChild(container);
    });

    for (const n of SIZES) {

        it(`two successive full rebuilds of ${n} cards (dense case)`, async () => {
            const projectsCache = new EntitiesCache<ProjectEntity>();
            for (const project of buildProjects(n)) {
                projectsCache.insert(project);
            }
            const notesCache = new EntitiesCache<NoteEntity>();
            for (const note of buildNotes(n, n)) {
                notesCache.insert(note);
            }
            const dagda = fakeDagda(projectsCache, notesCache);
            await warmUp(dagda, Math.min(50, n));

            async function buildOnce(): Promise<number> {
                const pending: Promise<void>[] = [];
                const start = now();
                for (let i = 1; i <= n; i++) {
                    const card = new ProjectCard();
                    card.projectId = i;
                    container.appendChild(card);
                    pending.push(card.refresh());
                }
                await Promise.all(pending);
                return now() - start;
            }

            // First render, exactly like ProjectsPage._refresh() on first visit.
            const firstMs = await buildOnce();

            // A "refresh" (e.g. navigating back to the list): ProjectsPage
            // does `this._cards.replaceChildren()` then rebuilds every card
            // from scratch — nothing here reuses the cards just built above.
            const clearStart = now();
            container.replaceChildren();
            const clearMs = now() - clearStart;

            const secondMs = await buildOnce();

            record("D", "first render", n, firstMs);
            record("D", "replaceChildren() teardown", n, clearMs);
            record("D", "second render (\"refresh\", full rebuild)", n, secondMs);

            expect(container.children).toHaveLength(n);
        });
    }

});

describe("Table E — project-detail page's own list (plain <li>, no components)", () => {

    for (const n of SIZES) {

        it(`filter + build ${n} <li> notes for one project`, () => {
            const notesCache = new EntitiesCache<NoteEntity>();
            for (const note of buildNotes(n, 1)) {
                notesCache.insert(note); // all n notes belong to project 1
            }

            // Exactly ProjectDetailPage._refresh()'s
            // getItems("notes").filter((note) => note.projectId === id).
            const filterStart = now();
            const notes = notesCache.getItems().filter((note) => note.projectId === 1);
            const filterMs = now() - filterStart;

            const list = document.createElement("ul");
            const buildStart = now();
            for (const note of notes) {
                const item = document.createElement("li");
                item.textContent = note.text;
                list.appendChild(item);
            }
            const buildMs = now() - buildStart;

            record("E", "getItems(\"notes\").filter(...)", n, filterMs);
            record("E", "build <li> per note", n, buildMs);

            expect(list.children).toHaveLength(n);
        });
    }

});
