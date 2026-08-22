import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// `src/index.css` carries the Vite starter's bare `button { ... }` skin outside
// any cascade layer. Unlayered CSS beats layered CSS whatever the specificity
// and every Tailwind utility is layered, so that block wins against any button
// it matches - which is why the strategy pattern selector drew its selected and
// unselected buttons identically, with the same computed border width, border
// colour and background, and the app said nothing about which order assembly
// type was in use.
//
// Moving the block into `@layer base` is the real fix and repaints every button
// in the app, so it is being taken as its own deliberate change. `[data-unstyled]`
// is the interim way out for one control at a time, and it only works while the
// selector keeps the `:not(...)`. Drop that and the pattern selector silently
// goes back to drawing nothing - silently, because nothing throws and no
// rendering test can see it: jsdom applies no author stylesheet, so a cascade is
// invisible to the rest of the suite.
//
// This lives in `vite/` rather than beside the stylesheet for the same reason
// the two tests under `api/_lib/` do - it asserts a property of the repository
// rather than of a neighbouring module - and because it must read the file as
// text, which `src` cannot do: it is typechecked without node types, and Vitest
// stubs CSS imports so a `?raw` import there comes back empty.

const css = readFileSync(
  fileURLToPath(new URL("../src/index.css", import.meta.url)),
  "utf8",
);

/** The declarations that make up the skin a control may need to opt out of. */
const SKIN_RULES = ["button", "button:hover"];

/** Rules that are real defaults rather than skin, and stay unconditional. */
const UNSCOPED_RULES = ["button:focus", "button:focus-visible"];

/** A rule opening with exactly this selector, at the start of a line. */
const ruleFor = (selector: string) =>
  new RegExp(`(^|[\\n}])\\s*${selector.replace(/:/g, "\\:")}\\s*[,{]`, "m");

describe("the button reset's opt-out", () => {
  it.each(SKIN_RULES)("scopes `%s` with :not([data-unstyled])", (rule) => {
    // The unscoped form must be gone: it would match every button again.
    expect(css).not.toMatch(ruleFor(rule));
    expect(css).toMatch(ruleFor(`${rule.replace(/^button/, "button:not\\(\\[data-unstyled\\]\\)")}`));
  });

  it.each(UNSCOPED_RULES)("leaves `%s` matching every button", (rule) => {
    expect(css).toMatch(ruleFor(rule));
  });

  it("keeps the skin itself intact, so opting out is the only way past it", () => {
    // If these ever disappear the reset has been neutered app-wide, which is the
    // deliberate change this file exists to keep from happening by accident.
    expect(css).toMatch(/padding:\s*0\.6em 1\.2em/);
    expect(css).toMatch(/border:\s*1px solid var\(--border-color-neutral\)/);
  });
});
