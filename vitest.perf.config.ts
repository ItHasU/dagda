import { readFile } from "node:fs/promises";
import { defineConfig } from "vitest/config";

/**
 * Loads `*.html` imports as plain strings.
 *
 * Copied from `vitest.config.ts` rather than imported from it: that file only
 * exports a `defineConfig(...)` call, nothing importable, and duplicating
 * fifteen lines here beats reshaping the main config just to share them.
 */
function htmlTemplates() {
    return {
        name: "dagda:html-templates",
        enforce: "pre" as const,
        async load(id: string): Promise<string | null> {
            const path = id.split("?")[0];
            if (path == null || !path.endsWith(".html")) {
                return null;
            }
            return `export default ${JSON.stringify(await readFile(path, "utf8"))};`;
        }
    };
}

/**
 * Dedicated config for the boilerplate's rendering/cache measurements
 * (ROADMAP tranche 5, "listes longues et rendu dense (milliers d'éléments) :
 * mesurer sur `bootstrap/` avant la conversion").
 *
 * Deliberately **not** one of `vitest.config.ts`'s `projects` — a wall-clock
 * timing is not a correctness assertion, and folding it into `npm test` would
 * either make CI flaky on a slower machine or force loose thresholds that
 * catch nothing. `npm test` / `npx vitest run` never touch this file. To run
 * the measurements:
 *
 *   npx vitest run --config vitest.perf.config.ts
 */
export default defineConfig({
    plugins: [htmlTemplates()],
    // Spelled out rather than read from packages/client/tsconfig.json (same
    // reasoning as vitest.config.ts): decorators need to be turned on
    // explicitly or the transform chokes on the first `@Ref()`.
    oxc: {
        tsconfigRaw: {
            compilerOptions: {
                target: "es2024",
                experimentalDecorators: true,
                useDefineForClassFields: false
            }
        }
    },
    test: {
        name: "bootstrap-client-perf",
        root: "./bootstrap/client",
        environment: "jsdom",
        environmentOptions: {
            jsdom: { url: "http://localhost/" }
        },
        setupFiles: [
            "../../packages/client/src/test/storage.setup.ts",
            "../../packages/client/src/test/matchmedia.setup.ts"
        ],
        // ".perf.ts", not ".spec.ts": kept out of every project's
        // `src/**/*.spec.ts` include in vitest.config.ts on purpose.
        include: ["src/perf/**/*.perf.ts"],
        // Building thousands of real DOM nodes under jsdom is legitimately
        // slower than typical unit-test assertions.
        testTimeout: 60_000
    }
});
