/**
 * The menu tree — one source for the four renderings of `specs/navigation.md`.
 *
 * Landscape/portrait × deployed/collapsed are four ways of drawing this tree,
 * never four declarations (`specs/navigation.md` §5). Building it is pure: no
 * DOM, no service, no current page. The only thing a renderer adds is which
 * entry is active.
 */

/**
 * Which of the two lists an entry belongs to.
 *
 * They are never merged into one sub-menu, in any layout
 * (`specs/navigation.md` §2) — hence a declared group rather than a convention
 * about position. The secondary one holds Settings and the account; slice 1
 * registers nothing in it, and that is why it is a parameter and not a
 * hard-coded second render path.
 */
export type MenuGroup = "primary" | "secondary";

/** How a section is declared by the application, next to its pages */
export interface SectionInfo {
    /** What the deployed column spells out */
    label: string;
    /**
     * Phosphor class of the badge, e.g. `"ph-broadcast"`.
     *
     * A name rather than markup: the collapsed rail is nothing but badges, so
     * a section with no icon would be invisible there — and a name cannot
     * carry markup into the menu.
     */
    icon?: string;
    /** Position among the sections, ascending */
    order?: number;
    /** Permission needed to see the section at all (FEATURES §7.1) */
    permission?: string;
    /** Which list the section joins. Defaults to the application's own menu. */
    group?: MenuGroup;
}

/** Where a page sits in the menu. Absent from `PageInfo` = not in the menu. */
export interface MenuPlacement {
    /** Section this page belongs to; absent means the page stands on its own */
    section?: string;
    /** Position inside the section, ascending */
    order?: number;
    /** Which list the entry joins. Defaults to the application's own menu. */
    group?: MenuGroup;
}

/** What the menu needs to know about a page, once registered */
export interface MenuPageSource {
    uid: string;
    title: string;
    icon?: string;
    menu?: MenuPlacement;
    permission?: string;
}

/** A page as it appears under a section */
export interface MenuPageNode {
    uid: string;
    title: string;
    icon?: string;
}

/**
 * One badge in the rail, one row (plus its pages) in the deployed column.
 *
 * A page registered without a section becomes a node of its own with no
 * children. That is not a special case to render: the rail then holds badges
 * only, whatever the depth behind them.
 */
export interface MenuNode {
    /** Section uid, or the page uid for a standalone page */
    uid: string;
    label: string;
    icon?: string;
    /**
     * Where a click on the badge goes.
     *
     * In the collapsed rail a section navigates straight to its first page —
     * the decision recorded in `specs/navigation.md`. Computing it here rather
     * than in the renderer is what keeps that decision in one place.
     */
    target: string;
    /** Empty for a standalone page */
    pages: MenuPageNode[];
}

/** Answers whether the current account may see something (FEATURES §7.1) */
export type PermissionPredicate = (permission: string | undefined) => boolean;

/** Everything is visible — the tranche 1 stand-in, until roles exist */
export const ALLOW_ALL: PermissionPredicate = () => true;

/** Something waiting to be sorted, carrying the order it was declared with */
interface Sortable<T> { order: number | undefined, label: string, uid: string, value: T }

/** Compare on order, then label, then uid, so the menu never wobbles */
function compare(a: Sortable<unknown>, b: Sortable<unknown>): number {
    return (a.order ?? 0) - (b.order ?? 0)
        || a.label.localeCompare(b.label)
        || a.uid.localeCompare(b.uid);
}

/** Sort in place and hand back the values alone */
function sorted<T>(items: Sortable<T>[]): T[] {
    return items.sort(compare).map(item => item.value);
}

/**
 * Assemble the menu tree from the registered pages and the declared sections.
 *
 * Filtering happens here, once, rather than in each renderer: a section the
 * account may not open must not reach the rail, where a bare icon would
 * announce its existence just as surely as a label would
 * (`specs/navigation.md` §5).
 */
export function buildMenu(
    pages: MenuPageSource[],
    sections: Record<string, SectionInfo>,
    canAccess: PermissionPredicate = ALLOW_ALL,
    group: MenuGroup = "primary"
): MenuNode[] {
    // Sections first: a page can then tell a forbidden section from an
    // undeclared one, which are not the same mistake.
    const allowedSections = new Map<string, SectionInfo>();
    for (const [uid, info] of Object.entries(sections)) {
        if ((info.group ?? "primary") === group && canAccess(info.permission)) {
            allowedSections.set(uid, info);
        }
    }

    const sectionPages = new Map<string, Sortable<MenuPageNode>[]>();
    const standalone: Sortable<MenuNode>[] = [];

    for (const page of pages) {
        // A page with no `menu` is reachable through the navigation service but
        // never listed — registration in the menu is optional (FEATURES §8).
        if (page.menu == null || !canAccess(page.permission)) {
            continue;
        }
        const sectionUid = page.menu.section;

        if (sectionUid == null) {
            if ((page.menu.group ?? "primary") !== group) {
                continue;
            }
            const node: MenuNode = {
                uid: page.uid, label: page.title, icon: page.icon,
                target: page.uid, pages: []
            };
            standalone.push({ order: page.menu.order, label: page.title, uid: page.uid, value: node });
            continue;
        }

        // An undeclared section is a wiring mistake, and staying silent about
        // it would surface only as a page quietly missing from the menu.
        if (sections[sectionUid] == null) {
            console.error(`Page "${page.uid}" belongs to section "${sectionUid}", which is not declared`);
            continue;
        }
        // Otherwise the section is real and simply not in this group, or it is
        // forbidden — in which case it takes its pages with it, silently. Note
        // that a page in a section takes the section's group: declaring the
        // group on both is two places to disagree.
        if (!allowedSections.has(sectionUid)) {
            continue;
        }

        const entry: MenuPageNode = { uid: page.uid, title: page.title, icon: page.icon };
        const list = sectionPages.get(sectionUid) ?? [];
        list.push({ order: page.menu.order, label: page.title, uid: page.uid, value: entry });
        sectionPages.set(sectionUid, list);
    }

    const nodes: Sortable<MenuNode>[] = [...standalone];
    for (const [uid, info] of allowedSections) {
        const children = sectionPages.get(uid);
        // A section left with nothing to show is dropped whole: a rail badge
        // would otherwise lead nowhere, and still name the section by existing.
        if (children == null || children.length === 0) {
            continue;
        }
        const pages = sorted(children);
        const node: MenuNode = {
            uid, label: info.label, icon: info.icon,
            // The collapsed rail navigates straight to the first page
            // (`specs/navigation.md`). Resolved here so that decision lives in
            // one place instead of in every renderer.
            target: pages[0]!.uid,
            pages
        };
        nodes.push({ order: info.order, label: info.label, uid, value: node });
    }

    return sorted(nodes);
}

/** @returns true when the node itself or one of its pages is the current page */
export function isActive(node: MenuNode, currentPageUID: string | null): boolean {
    if (currentPageUID == null) {
        return false;
    }
    return node.uid === currentPageUID || node.pages.some(page => page.uid === currentPageUID);
}
