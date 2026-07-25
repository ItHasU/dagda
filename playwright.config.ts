import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: full journeys and real time, against a built application
 * and a real database. Components taken in isolation are covered by Vitest,
 * not here.
 *
 * The suite runs the bootstrap application on a port of its own, so it does not
 * collide with a development server started from .env.
 */
const PORT = Number(process.env["DAGDA_E2E_PORT"] ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: true,
    forbidOnly: !!process.env["CI"],
    retries: process.env["CI"] ? 2 : 0,
    reporter: process.env["CI"] ? "github" : "list",

    use: {
        baseURL: BASE_URL,
        trace: "on-first-retry"
    },

    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] }
        }
    ],

    webServer: {
        // The application is built by the `test:e2e` script, so this only starts it.
        // Called directly rather than through the `start` script, which loads
        // .env: the suite must not depend on the developer's local settings.
        command: "node dist/main.js",
        cwd: "bootstrap/server",
        // /login answers without a session, unlike every other route.
        url: `${BASE_URL}/login`,
        reuseExistingServer: !process.env["CI"],
        timeout: 60_000,
        env: {
            PORT: String(PORT),
            BASE_URL,
            DB_URL: process.env["DAGDA_TEST_DB_URL"] ?? "postgresql://dagda:dagda@localhost:5432/dagda",
            // Started with no authentication strategy on purpose: see e2e/boot.spec.ts.
            GOOGLE_CLIENT_ID: "",
            GOOGLE_CLIENT_SECRET: ""
        }
    }
});
