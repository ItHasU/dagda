/**
 * Side-effect-only module: importing it populates the real
 * `monaco.languages.typescript` implementation (`editor/editor.api`'s own
 * declaration for that field is a stale `{ deprecated: true }` stub — the
 * runtime value it's mutated into is correct, the shipped `.d.ts` just
 * wasn't updated to match). Ships with no type declarations of its own,
 * which is what this file is for — an ambient declaration just to let a
 * side-effect `import()` of it compile.
 */
declare module "monaco-editor/language/typescript/monaco.contribution";
