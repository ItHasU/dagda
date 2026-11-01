import express from "express";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { Server } from "node:http";
import { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pwaPublicPaths, pwaRouter, PWA_HEAD } from "./pwa";

describe("PWA files", () => {

    let root: string;
    let server: Server;
    let base: string;

    beforeAll(async () => {
        root = mkdtempSync(join(tmpdir(), "dagda-pwa-"));
        mkdirSync(join(root, "assets", "icons"), { recursive: true });
        writeFileSync(join(root, "assets", "manifest.json"), JSON.stringify({ name: "Test", icons: [{ src: "icons/192.png" }, { src: "/assets/512.png" }, { src: 42 }] }));
        writeFileSync(join(root, "assets", "icons", "192.png"), "png");
        writeFileSync(join(root, "assets", "512.png"), "png");
        writeFileSync(join(root, "assets", "icon.png"), "png");
        writeFileSync(join(root, "sw.js"), "// sw");
        writeFileSync(join(root, "main.js"), "// bundle");
        const app = express();
        app.use(pwaRouter(root));
        // Stands for the session gate: anything the router lets through is refused.
        app.use((_req, res) => { res.status(401).send("gate"); });
        await new Promise<void>((done) => { server = app.listen(0, () => done()); });
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
        await new Promise((done) => server.close(done));
        rmSync(root, { recursive: true, force: true });
    });

    it("lists the manifest, the worker, the Apple icon and the declared icons", () => {
        expect([...pwaPublicPaths(root)].sort()).toEqual(["/assets/512.png", "/assets/icon.png", "/assets/icons/192.png", "/assets/manifest.json", "/sw.js"]);
    });

    it("lists only the fixed files without a manifest", () => {
        expect(pwaPublicPaths(join(root, "absent")).size).toBe(3);
    });

    it("serves the manifest without a session, typed as a web app manifest", async () => {
        const response = await fetch(`${base}/assets/manifest.json`);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("application/manifest+json");
    });

    it("serves the worker uncached, and the icons", async () => {
        const worker = await fetch(`${base}/sw.js`);
        expect(worker.status).toBe(200);
        expect(worker.headers.get("cache-control")).toBe("no-cache");
        expect((await fetch(`${base}/assets/icons/192.png`)).status).toBe(200);
        expect((await fetch(`${base}/assets/icon.png`)).status).toBe(200);
    });

    it("leaves the bundle and anything else to the gate", async () => {
        expect((await fetch(`${base}/main.js`)).status).toBe(401);
        expect((await fetch(`${base}/assets/%2e%2e/main.js`)).status).toBe(401);
        expect((await fetch(`${base}/assets/other.png`)).status).toBe(401);
    });

    it("gives the server-rendered pages the manifest and the worker", () => {
        expect(PWA_HEAD).toContain(`rel="manifest"`);
        expect(PWA_HEAD).toContain(`serviceWorker.register("/sw.js")`);
    });

});
