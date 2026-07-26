/**
 * Lazy-loaded Monaco (ROADMAP tranche 4) — a real dependency, unlike almost
 * everything else in the framework (`dagda-md` memory: minimal dependencies
 * by default, an exception granted for this one specifically), so it must
 * never land in the main bundle: `import()` here becomes its own chunk,
 * fetched only once something actually opens an editor.
 */

// Imported by deep path, not the bare package name: the package's own
// "exports" map only declares a "types" condition for the root import
// ("."), which pulls in monaco-editor's *entire* language surface (every
// language, every worker) — this path is exactly what the root re-exports
// (`esm/vs/editor/editor.api`) it, so the module itself is identical, only
// the type declaration resolves cleanly under this repo's "node" module
// resolution (no "exports"-aware TS setting, an ecosystem-wide change well
// beyond this one dependency).
let monacoPromise: Promise<typeof import("monaco-editor/editor/editor.api")> | null = null;

/** @returns the Monaco module, fetching it on the first call and reusing that same promise afterward */
export function loadMonaco(): Promise<typeof import("monaco-editor/editor/editor.api")> {
    monacoPromise ??= import("monaco-editor/editor/editor.api");
    return monacoPromise;
}
