/**
 * Gives the tests a working `window.localStorage`.
 *
 * Not a convenience: without this there is none. Node 24 ships a `localStorage`
 * global of its own, which stays `undefined` unless the process is started with
 * `--localstorage-file`, and it shadows the one jsdom installs on the window.
 * The symptom is deceptive — `"localStorage" in window` is true, `sessionStorage`
 * works, and only the read comes back undefined.
 *
 * Patching the environment rather than the component on purpose: the shell
 * remembers the collapsed menu through the real browser API, and a component
 * written around a test runner's quirk would be a component written around the
 * wrong thing.
 */

class MemoryStorage implements Storage {

    private _entries = new Map<string, string>();

    public get length(): number {
        return this._entries.size;
    }

    public clear(): void {
        this._entries.clear();
    }

    public getItem(key: string): string | null {
        return this._entries.get(key) ?? null;
    }

    public key(index: number): string | null {
        return [...this._entries.keys()][index] ?? null;
    }

    public removeItem(key: string): void {
        this._entries.delete(key);
    }

    public setItem(key: string, value: string): void {
        this._entries.set(key, String(value));
    }

}

if (window.localStorage == null) {
    Object.defineProperty(window, "localStorage", {
        configurable: true,
        writable: true,
        value: new MemoryStorage()
    });
}
