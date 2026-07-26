/**
 * How an application names itself in the shell.
 *
 * Passed to `DagdaClient.start()`, next to the pages and the model — the
 * decision recorded in `specs/navigation.md` §6.1. The two other candidates
 * (attributes on `<dagda-app>`, named slots) both put content back into the
 * `index.html` that the same section exists to empty.
 */
export interface BrandInfo {
    /** The name in full, at the head of the deployed column */
    label: string;
    /**
     * Phosphor class of the mark, e.g. `"ph-broadcast"`.
     *
     * In the collapsed rail the label is hidden — same convention as every
     * other entry (`specs/navigation.md` §3.2) — so this icon is what is left
     * to identify the application. Without one, the rail shows nothing here.
     */
    icon?: string;
}

/** Registration name of the brand in the service registry */
export type BrandService = {
    "brand": BrandInfo;
};
