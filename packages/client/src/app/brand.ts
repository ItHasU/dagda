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
     * The rail rendering: a sigil, not a truncation.
     *
     * `specs/navigation.md` §3.2 asks for a second rendering rather than an
     * `overflow: hidden`, because a name clipped mid-word reads as a bug.
     * Defaults to the first two letters of the label, which is a reasonable
     * sigil for "Dagda" and a poor one for "MQTT Toolbox" — hence the field.
     */
    compact?: string;
    /** Phosphor class of the mark, e.g. `"ph-broadcast"` */
    icon?: string;
}

/** Registration name of the brand in the service registry */
export type BrandService = {
    "brand": BrandInfo;
};
