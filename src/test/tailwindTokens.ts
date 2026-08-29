// =============================================================================
// READING A TAILWIND CLASS LIST IN A LAYOUT GUARD
// =============================================================================
//
// Several layout invariants in this repository are guarded by asserting on the
// class list a style constant or a style function hands out, because jsdom
// applies no author stylesheet and lays nothing out, so no rendering test can
// watch the box those utilities describe get drawn. Each of those guards asks
// one of two questions, and they need the tokens read differently. Picking the
// wrong one does not weaken a guard, it INVERTS it, so the two live here rather
// than being re-derived beside each check.
//
// `utilitiesInAnyCondition` strips the variants, and is for a NEGATIVE
// assertion - "this utility must not appear under ANY condition". `sm:h-full`
// is `h-full` under a condition and has to be refused just the same, which is
// the whole reason the strip exists.
//
// `unconditionalUtilities` keeps only the tokens that carry no variant at all,
// and is for a POSITIVE assertion - "this declaration holds at EVERY width".
// `sm:flex-row` is precisely not `flex-row`: it is a row above `sm` and nothing
// below it. Judged on a stripped list, a positive check passes for exactly the
// responsive-variant edit a layout guard exists to catch.

/**
 * The colons that separate a Tailwind variant from its utility are the ones
 * outside every bracket and paren. That distinction is the whole point: the
 * colon in `[height:100%]` or `data-[state=open]` belongs to the utility, so a
 * greedy `/^.*:/` turns the arbitrary-property form of a declaration into
 * `100%]` and hands every matcher a token that can no longer match anything.
 */
const variantPrefixLength = (token: string) => {
  let depth = 0;
  let end = 0;

  for (let i = 0; i < token.length; i += 1) {
    const char = token[i];

    if (char === "[" || char === "(") {
      depth += 1;
    } else if (char === "]" || char === ")") {
      depth -= 1;
    } else if (char === ":" && depth === 0) {
      end = i + 1;
    }
  }

  return end;
};

const tokensOf = (className: string) =>
  className.split(/\s+/).filter((token) => token.length > 0);

/**
 * Every utility the class list asks for, with any leading `<variant>:` segments
 * removed - `sm:h-full`, `max-sm:flex-col` and stacked ones like
 * `sm:hover:h-full` all judged as the utility underneath. **For negative
 * assertions only**: it deliberately erases the condition, so a positive check
 * run against it would accept a declaration that holds at some widths and not
 * others.
 */
export const utilitiesInAnyCondition = (className: string) =>
  tokensOf(className).map((token) => token.slice(variantPrefixLength(token)));

/**
 * Only the utilities that carry no variant, so they apply at every width.
 * **For positive assertions**: a `toContain` against this list is the claim
 * that the declaration is unconditional, and a variant-prefixed token is absent
 * from it rather than silently counted.
 */
export const unconditionalUtilities = (className: string) =>
  tokensOf(className).filter((token) => variantPrefixLength(token) === 0);
