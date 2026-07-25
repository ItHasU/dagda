import { readFile } from "node:fs/promises";
import { defineConfig } from "vitest/config";

/**
 * Loads `*.html` imports as plain strings.
 *
 * Components import their template with `import template from "./x.component.html"`.
 * In a bundle that import is served by webpack's html-loader; here it is served by
 * this plugin, so a component can be instantiated without building anything.
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

export default defineConfig({
    test: {
        projects: [
            {
                // Model, cache, transactions: pure logic, no DOM, no database.
                test: {
                    name: "shared",
                    root: "./packages/shared",
                    environment: "node",
                    include: ["src/**/*.spec.ts"]
                }
            },
            {
                // Components taken in isolation, against a simulated DOM.
                // Full journeys are covered by Playwright, not here.
                plugins: [htmlTemplates()],
                // Spelled out rather than read from packages/client/tsconfig.json,
                // which excludes the test files: the transform would then fall
                // back to defaults and choke on the first `@Ref()` decorator.
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
                    name: "client",
                    root: "./packages/client",
                    environment: "jsdom",
                    // An origin, because `about:blank` is opaque and web
                    // storage does not exist on an opaque origin.
                    environmentOptions: {
                        jsdom: { url: "http://localhost/" }
                    },
                    // And a storage on top of that, because an origin is not
                    // enough under Node 24 — see the file for what shadows what.
                    setupFiles: ["src/test/storage.setup.ts"],
                    include: ["src/**/*.spec.ts"]
                }
            },
            {
                // Server side, including the tests that need a real PostgreSQL.
                test: {
                    name: "server",
                    root: "./packages/server",
                    environment: "node",
                    include: ["src/**/*.spec.ts"],
                    // Decides once, before collection, whether a database is reachable.
                    globalSetup: ["src/test/pg.globalsetup.ts"]
                }
            }
        ]
    }
});
