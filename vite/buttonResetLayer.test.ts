// @vitest-environment jsdom
/// <reference lib="dom" />
//
// `src/index.css` carries the Vite starter's bare `button { ... }` skin. For a
// long time it sat outside any cascade layer, and unlayered CSS beats layered
// CSS whatever the specificity - every Tailwind utility is layered, so that
// block won against any button it matched. The strategy pattern selector drew
// its selected and unselected buttons identically, with the same computed
// border width, border colour and background, and the app said nothing about
// which order assembly type was in use. Two lanes then worked around the same
// reset without knowing about each other, one with a `[data-unstyled]` opt-out
// and one with `!` modifiers.
//
// The block is inside `@layer base` now and both workarounds are gone, so this
// file guards the state that made them unnecessary rather than the workarounds.
// It asserts two halves of one fact:
//
//   1. Nothing outside a cascade layer targets a button. Let one rule back out
//      and every utility that button carries silently stops painting - silently,
//      because nothing throws and no rendering test can see it: jsdom applies no
//      author stylesheet, so a cascade is invisible to the rest of the suite.
//   2. The defaults are still in `@layer base`, skin and focus ring both, so
//      half one cannot be satisfied by deleting them.
//
// It asks by meaning rather than by spelling: it parses the stylesheet into
// rules, records whether each one is inside a layer, and hands their selectors
// to the browser's own selector engine against a fixture that mirrors the shell
// `src/App.tsx` renders - `#root`, the container inside it, the tab `nav` and
// `main`, and a button under each.
//
// THE REACH. Stated here once and in full, both conditions and both holes;
// everything below refers back to this paragraph rather than restating it.
// A rule is in the model when its selector meets both conditions
// `selectorsReachingButtons` applies: it reaches one of the fixture's buttons,
// AND it reaches none of the fixture's non-button elements.
//
// The second condition is what separates a button skin from a universal reset
// like `* { box-sizing }`, which is not what this file is about. It is also a
// hole, because a skin written through a selector that happens to land on
// something other than a button - `#root *`, `main div > *`, `:is(button, div)`
// - is dropped from the model before either assertion sees it. An unlayered
// `#root * { border: ...; padding: ...; background-color: ... }` would paint the
// pattern selector's buttons and every assertion here would still pass. The
// first condition has a hole of its own: the fixture's buttons carry no classes,
// so a class-scoped rule such as `.pattern-selector button` never reaches one.
//
// What is left in reach is the bare `button` type selector, and anything scoping
// it by the id, by an element ancestor the app renders, by an attribute a button
// carries, or by a state pseudo-class - written flat or nested, since rule
// bodies are walked. Reformatting the stylesheet changes nothing either way.
//
// This lives in `vite/` rather than beside the stylesheet for the same reason
// the two tests under `api/_lib/` do - it asserts a property of the repository
// rather than of a neighbouring module - and because it must read the file as
// text, which `src` cannot do: it is typechecked without node types, and Vitest
// stubs CSS imports so a `?raw` import there comes back empty.
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Resolved through `node:path` rather than `new URL(..., import.meta.url)`:
// under jsdom the global `URL` resolves against the document's own base, so the
// relative form comes back as `http://localhost:3000/src/index.css`.
const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../src/index.css"),
  "utf8",
);

/** One style rule: where it sits, what it is written under, what it declares. */
interface StyleRule {
  /** The `@layer` names it is nested inside, outermost first; empty if none. */
  layers: string[];
  selectors: string[];
  properties: string[];
}

/**
 * At-rules whose body holds ordinary style rules, so the walk descends into
 * them. `@layer` is descended into as well, and what it contributes is its own
 * name: a layered rule loses to every Tailwind utility, which is the state this
 * file exists to keep. `@theme` and `@keyframes` hold declarations and keyframe
 * selectors rather than rules, and jsdom's selector engine would reject
 * `0%, 100%` outright.
 */
const DESCENDED_AT_RULES = new Set(["media", "supports", "container", "scope"]);

/** Dynamic state a `matches()` call cannot reproduce, dropped before asking. */
const STATE_PSEUDO_CLASSES = new Set([
  "hover",
  "active",
  "focus",
  "focus-visible",
  "focus-within",
  "link",
  "visited",
  "target",
]);

/**
 * A pseudo-class, name and all, looked up by name rather than matched as an
 * alternation of names. Alternation is first-match-wins and `\b` is satisfied
 * by the hyphen, so `focus|focus-visible` cut `button:focus-visible` down to
 * `button-visible` - a type selector matching nothing, which was then dropped
 * before either assertion could ask about it.
 */
const PSEUDO_CLASS = /:(-?[_a-z][-_a-z0-9]*)/gi;

/** A pseudo-element styles a box the element owns, not the element. */
const PSEUDO_ELEMENTS = /::[-a-z]+(?:\([^)]*\))?/gi;

/** Properties that make a button visibly focusable rather than skin it. */
const FOCUS_RING_PROPERTIES = new Set([
  "outline",
  "outline-color",
  "outline-offset",
  "outline-style",
  "outline-width",
]);

/** The layer the element defaults have to be in to stay defaults. */
const BASE_LAYER = "base";

/** Splits on top-level commas, so `:is(a, b)` stays one selector. */
const splitSelectorList = (selectorList: string): string[] => {
  const selectors: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of selectorList) {
    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth -= 1;
    if (char === "," && depth === 0) {
      selectors.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  selectors.push(current);
  return selectors.map((selector) => selector.trim()).filter(Boolean);
};

/** The property names a declaration block sets, ignoring any nested block. */
const declaredProperties = (block: string): string[] => {
  let flat = block;
  let previous: string;
  do {
    previous = flat;
    flat = flat.replace(/\{[^{}]*\}/g, "");
  } while (flat !== previous);

  return flat
    .split(";")
    .map((declaration) => /^\s*([-a-z][-a-z0-9]*)\s*:/i.exec(declaration)?.[1])
    .filter((property): property is string => property !== undefined)
    .map((property) => property.toLowerCase());
};

/**
 * Every style rule the stylesheet writes, each tagged with the `@layer` names it
 * sits inside. Nested style rules are included: Tailwind v4 compiles native
 * nesting through Lightning CSS, so `#root { button { ... } }` is an app-wide
 * skin written in two lines, and it inherits its parent's layers. A nested rule
 * is recorded under its own selector with the parent's scope dropped, which
 * over-approximates what it reaches - the direction a guard should err in.
 * Anything the `@import "tailwindcss"` pulls in is layered by the framework and
 * so is not part of the model.
 */
const parseRules = (source: string): StyleRule[] => {
  const rules: StyleRule[] = [];

  const walk = (text: string, layers: string[]): void => {
    let prelude = "";
    let index = 0;

    while (index < text.length) {
      const char = text[index];

      if (char === ";") {
        prelude = "";
        index += 1;
        continue;
      }

      if (char !== "{") {
        prelude += char;
        index += 1;
        continue;
      }

      let depth = 0;
      let end = index;
      while (end < text.length) {
        if (text[end] === "{") depth += 1;
        else if (text[end] === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
        end += 1;
      }
      const block = text.slice(index + 1, end);
      const head = prelude.trim();

      if (head.startsWith("@")) {
        const name = head.slice(1).split(/[\s({]/, 1)[0].toLowerCase();
        if (name === "layer") {
          // `@layer a, b;` declares an order and has no block, so it never
          // reaches here. `@layer name { ... }` names one layer.
          const layerName = head.slice("@layer".length).trim();
          walk(block, [...layers, layerName]);
        } else if (DESCENDED_AT_RULES.has(name)) {
          walk(block, layers);
        }
      } else if (head) {
        rules.push({
          layers,
          selectors: splitSelectorList(head),
          properties: declaredProperties(block),
        });
        walk(block, layers);
      }

      prelude = "";
      index = end + 1;
    }
  };

  walk(source.replace(/\/\*[\s\S]*?\*\//g, ""), []);
  return rules;
};

/**
 * What a selector can ever apply to, with state it cannot be asked about. The
 * nesting selector goes too: `&` alone is not a selector jsdom can match, and
 * dropping the parent scope it stands for widens what the selector looks like
 * it reaches rather than narrowing it.
 */
const asMatchableSelector = (selector: string): string =>
  selector
    .replace(PSEUDO_ELEMENTS, "")
    .replace(PSEUDO_CLASS, (pseudoClass, name: string) =>
      STATE_PSEUDO_CLASSES.has(name.toLowerCase()) ? "" : pseudoClass,
    )
    .replace(/&/g, "")
    .trim();

interface ButtonSelector {
  selector: string;
  properties: string[];
}

let buttons: Element[];
let notButtons: Element[];

beforeEach(() => {
  // The shell `src/App.tsx` renders, with the elements a rule could plausibly
  // be scoped by: the app mounts into `#root` (see `src/main.tsx`), which holds
  // one container, and that holds the visually hidden `h1`, the tab `nav` and
  // `main`. The buttons sit where the app's own do, so a rule written under any
  // of those ancestors reaches these too.
  document.body.innerHTML = `
    <div id="root">
      <div>
        <h1>Block Builder</h1>
        <nav>
          <button type="button">a tab</button>
          <span>not a button</span>
        </nav>
        <main>
          <div>
            <button type="button">plain</button>
            <div>not a button</div>
          </div>
        </main>
      </div>
    </div>`;

  buttons = Array.from(document.querySelectorAll("button"));
  notButtons = Array.from(document.querySelectorAll("#root, #root *")).filter(
    (element) => element.tagName !== "BUTTON",
  );
});

/** The rules that reach a button and nothing else, by THE REACH above. */
const selectorsReachingButtons = (
  keep: (rule: StyleRule) => boolean,
): ButtonSelector[] =>
  parseRules(css)
    .filter(keep)
    .flatMap((rule) =>
      rule.selectors
        .map(asMatchableSelector)
        .filter(
          (selector) =>
            selector !== "" &&
            buttons.some((button) => button.matches(selector)) &&
            !notButtons.some((element) => element.matches(selector)),
        )
        .map((selector) => ({ selector, properties: rule.properties })),
    );

// A rule declaring nothing of its own paints nothing of its own: it is the
// outer half of a nested pair, and the nested rule is in the model separately.
const declaresSomething = ({ properties }: ButtonSelector): boolean =>
  properties.length > 0;

const isFocusRing = ({ properties }: ButtonSelector): boolean =>
  properties.length > 0 &&
  properties.every((property) => FOCUS_RING_PROPERTIES.has(property));

describe("the button defaults' cascade layer", () => {
  it("lets no rule outside a cascade layer paint a button", () => {
    // The whole point of the change that landed this: an element default has to
    // lose to the component's own utilities, and it only does if it is layered.
    // Named rather than counted - a failure here has to say which selector broke
    // back out, whatever it was written as.
    expect(
      selectorsReachingButtons((rule) => rule.layers.length === 0)
        .filter(declaresSomething)
        .map(({ selector }) => selector),
    ).toEqual([]);
  });

  it("keeps the skin itself in `@layer base`", () => {
    // Half one is satisfied by an empty stylesheet, so this is the other half:
    // the defaults are still here, and still where a utility outranks them.
    const base = selectorsReachingButtons((rule) =>
      rule.layers.includes(BASE_LAYER),
    );

    expect(
      base.filter((entry) => !isFocusRing(entry)).flatMap((e) => e.properties),
    ).toEqual(
      expect.arrayContaining(["border", "padding", "background-color"]),
    );
  });

  it("keeps the focus ring in `@layer base`, reaching every button", () => {
    // The one part of the block that is a real default rather than a skin. No
    // component overrides it, and a button must not lose it.
    const focusRing = selectorsReachingButtons((rule) =>
      rule.layers.includes(BASE_LAYER),
    ).filter(isFocusRing);

    expect(focusRing.length).toBeGreaterThan(0);
    for (const { selector } of focusRing) {
      for (const button of buttons) {
        expect(button.matches(selector)).toBe(true);
      }
    }
  });
});
