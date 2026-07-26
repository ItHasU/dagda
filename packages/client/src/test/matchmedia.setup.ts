/**
 * Gives the tests a working `window.matchMedia`.
 *
 * jsdom does not implement it at all — real browsers do, unconditionally, so
 * this is a test-environment gap, not a feature to guard against in the
 * component (`PageContainer`'s own layout switch, ROADMAP tranche 4). A
 * minimal implementation: `matches` is evaluated once, at call time, against
 * `window.innerWidth`; `addEventListener`/`removeEventListener` are kept as a
 * registry so a test can simulate a resize by changing `innerWidth` and
 * firing the listeners itself — nothing here polls or observes on its own.
 */
class FakeMediaQueryList extends EventTarget implements Partial<MediaQueryList> {

    public readonly media: string;

    constructor(media: string, private readonly _matches: () => boolean) {
        super();
        this.media = media;
    }

    public get matches(): boolean {
        return this._matches();
    }

    // Deprecated pair, kept only because the DOM type requires them.
    public addListener(): void { /* superseded by addEventListener */ }
    public removeListener(): void { /* superseded by removeEventListener */ }

}

if (typeof window.matchMedia !== "function") {
    // Cached by query string: a real browser's MediaQueryList is backed by
    // the actual viewport, so every caller asking for the same query hears
    // about a change together. Two independent fakes wouldn't — dispatching
    // "change" on the one a test holds would never reach a component's own,
    // separately-constructed one for the identical query.
    const cache = new Map<string, MediaQueryList>();
    window.matchMedia = (query: string): MediaQueryList => {
        let list = cache.get(query);
        if (list == null) {
            const widthMatch = /\(max-width:\s*(\d+)px\)/.exec(query);
            const maxWidth = widthMatch != null ? Number(widthMatch[1]) : null;
            list = new FakeMediaQueryList(query, () => maxWidth != null && window.innerWidth <= maxWidth) as unknown as MediaQueryList;
            cache.set(query, list);
        }
        return list;
    };
}
