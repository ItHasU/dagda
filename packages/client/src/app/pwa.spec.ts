import { describe, expect, it, vi } from "vitest";
import { registerServiceWorker, SERVICE_WORKER_URL } from "./pwa";

function env(isSecureContext: boolean, register?: (url: string) => Promise<unknown>): { navigator: Navigator, isSecureContext: boolean } {
    const navigator = (register == null ? {} : { serviceWorker: { register } }) as unknown as Navigator;
    return { navigator, isSecureContext };
}

describe("registerServiceWorker", () => {

    it("registers the worker at the root", async () => {
        const register = vi.fn(async () => ({}));
        expect(await registerServiceWorker(env(true, register))).toBe(true);
        expect(register).toHaveBeenCalledWith(SERVICE_WORKER_URL);
    });

    it("does nothing outside a secure context", async () => {
        const register = vi.fn(async () => ({}));
        expect(await registerServiceWorker(env(false, register))).toBe(false);
        expect(register).not.toHaveBeenCalled();
    });

    it("does nothing without the Service Worker API", async () => {
        expect(await registerServiceWorker(env(true))).toBe(false);
    });

    it("swallows a failed registration", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        expect(await registerServiceWorker(env(true, async () => { throw new Error("refused"); }))).toBe(false);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

});
