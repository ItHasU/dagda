/**
 * Builds the URL of one piece of content registered server-side via
 * `contentRegister` (ROADMAP tranche 5, `@dagda/server/src/content`).
 *
 * Deliberately just a URL, unlike `apiCall`: a content route is a plain
 * `GET`, meant to be handed to an `<img>`/`<video>` `src` (or fetched by
 * hand) so the browser's own HTTP cache and conditional requests do the
 * work — wrapping it in a `fetch()`/JSON round trip here would throw that
 * away for no benefit.
 */
export function contentUrl(name: string, id: string | number): string {
    return `/content/${name}/${id}`;
}
