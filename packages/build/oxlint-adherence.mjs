/**
 * Design-system adherence rules, as an oxlint JS plugin.
 *
 * The Claude Design bundle ships these three checks as `no-restricted-syntax`
 * selectors in `_adherence.oxlintrc.json`. oxlint does not implement that rule
 * (it needs an esquery engine), so the selectors are reimplemented here, with
 * the bundle's own regular expressions and messages left word for word.
 *
 * One deliberate addition: the bundle only looks at `Literal` nodes, which
 * misses template strings — and a component that builds its markup with
 * backticks is exactly where a hard-coded colour would appear. Template
 * literal chunks are therefore checked too.
 *
 * What this cannot see: `.css` and `.html` files, which oxlint does not parse.
 * The stylesheets are guarded by review instead — `dagda-ui.css` is meant to
 * hold no literal value at all, and the token sheet is the one place where
 * literals belong.
 */

/** Raw hex colour, e.g. "#161826". */
const HEX = /#[0-9a-fA-F]{3,8}\b/;
/** Raw pixel length, e.g. "12px". */
const PX = /\b\d+px\b/;
/** A `font-family:` whose value is not one the design system provides. */
const FONT = /font-family\s*:\s*(?!['"]?(?:Inter))/i;

const CHECKS = [
    { test: HEX, message: "Raw hex color — use a design-system color token via var()." },
    { test: PX, message: "Raw px value — use a design-system spacing token via var()." },
    { test: FONT, message: "Font not provided by the design system. Available: Inter." }
];

/** Reports the first check a string trips, on the node that carries it. */
function check(context, node, text) {
    if (typeof text !== "string") {
        return;
    }
    for (const { test, message } of CHECKS) {
        if (test.test(text)) {
            context.report({ node, message });
            return;
        }
    }
}

const rule = {
    create(context) {
        return {
            Literal(node) {
                check(context, node, node.value);
            },
            TemplateElement(node) {
                check(context, node, node.value?.cooked ?? node.value?.raw);
            }
        };
    }
};

export default {
    meta: { name: "adherence" },
    rules: { "design-system": rule }
};
