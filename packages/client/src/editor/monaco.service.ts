import { loadMonaco } from "./monaco.loader";

/** One `.d.ts` source to feed the TypeScript/JavaScript language service */
export interface ExtraLib {
    /** The `.d.ts` source itself */
    content: string;
    /** A virtual file path — only matters if two libs declare the same module and need to stay distinct */
    filePath?: string;
}

/**
 * The part of `monaco.languages.typescript.*Defaults` this module actually
 * uses. Declared by hand: `editor/editor.api`'s own type for
 * `languages.typescript` is a stale `{ deprecated: true }` stub (the
 * runtime value importing the contribution module mutates it into is
 * correct, the shipped `.d.ts` just wasn't updated to match), so this casts
 * past that rather than trusting it.
 */
interface LanguageServiceDefaults {
    addExtraLib(content: string, filePath?: string): { dispose(): void };
}

/**
 * Real autocompletion on an application's own API (ROADMAP tranche 4:
 * "Embarquer comme ressource les `.d.ts` déjà émis... c'est ce qui donne
 * l'autocomplétion sur l'API réelle"). A plain function, not a registered
 * Dagda service: there is no state to hold between calls, and an app that
 * never opens an editor has no reason to carry one.
 *
 * Feeds the TypeScript/JavaScript language service specifically —
 * `.d.ts`-based extra libs have no effect on Monaco's HTML mode, which is
 * all a dashboard's editor uses (embedded `<script>` blocks get syntax
 * highlighting, not a real language service). The genuine consumers are the
 * script editor (tranche 5 bis) and the automation editor (tranche 6), both
 * real JavaScript/TypeScript models — this is the plumbing they will share,
 * built here because the dashboard editor is what first pulled Monaco into
 * the framework at all.
 */
export async function loadExtraLibs(libs: ExtraLib[]): Promise<void> {
    // Side-effect only: populates the real monaco.languages.typescript
    // implementation. Must resolve before it's read below.
    await import("monaco-editor/language/typescript/monaco.contribution");
    const monaco = await loadMonaco();
    const typescript = monaco.languages.typescript as unknown as {
        typescriptDefaults: LanguageServiceDefaults;
        javascriptDefaults: LanguageServiceDefaults;
    };
    for (const lib of libs) {
        typescript.typescriptDefaults.addExtraLib(lib.content, lib.filePath);
        typescript.javascriptDefaults.addExtraLib(lib.content, lib.filePath);
    }
}
