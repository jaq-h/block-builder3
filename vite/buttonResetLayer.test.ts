// @vitest-environment jsdom
/// <reference lib="dom" />
//
// `src/index.css` carries the Vite starter's bare `button { ... }` skin, and the
// `a`, `body` and `h1` rules beside it. For a long time they sat outside any
// cascade layer, and unlayered CSS beats layered CSS whatever the specificity -
// every Tailwind utility is layered, so that block won against any element it
// matched. The strategy pattern selector drew its selected and unselected
// buttons identically, with the same computed border width, border colour and
// background, and the app said nothing about which order assembly type was in
// use. Two lanes then worked around the same reset without knowing about each
// other, one with a `[data-unstyled]` opt-out and one with `!` modifiers.
//
// The block is inside `@layer base` now and both workarounds are gone, so this
// file guards the state that made them unnecessary rather than the workarounds.
// It asserts two halves of one fact, for every element the block gives defaults
// to:
//
//   1. Nothing outside a cascade layer targets that element. Let one rule back
//      out and every utility the element carries silently stops painting -
//      silently, because nothing throws and no rendering test can see it: jsdom
//      applies no author stylesheet, so a cascade is invisible to the rest of
//      the suite.
//   2. The defaults are still in `@layer base`, so half one cannot be satisfied
//      by deleting them. For a button that is the skin and the focus ring both.
//
// It asks by meaning rather than by spelling: it parses the stylesheet into
// rules, records whether each one is inside a layer, and hands their selectors
// to the browser's own selector engine against a fixture that mirrors the shell
// `src/App.tsx` renders - `#root`, the container inside it, and the tab `nav`
// and `main`, with a button and a link under each of those two, where the app's
// own sit, and the visually hidden `h1` inside `main`.
//
// THE REACH. Stated here once and in full, every condition and every hole;
// everything below refers back to this paragraph rather than restating it.
// The model is built per element type. A rule is in that type's model when its
// selector meets both conditions `selectorsReaching` applies: it reaches one of
// the fixture's elements of that type, AND it reaches none of the fixture's
// elements of any other type.
//
// The second condition is what separates an element default from a universal
// reset like `* { box-sizing }`, which is not what this file is about. Because
// it excludes every other type rather than only the one being asked about, a
// rule reaching two of them - `:is(button, a) { ... }` - is out of all four
// models, which is the same hole in a new shape. It is a hole in general: a skin
// written through a selector that happens to land on something else - `#root *`,
// `main div > *` - is dropped before either assertion sees it, so an unlayered
// `#root * { border: ...; padding: ...; background-color: ... }` would paint the
// pattern selector's buttons and every assertion here would still pass. The
// first condition has a hole of its own: the fixture carries no classes and one
// id, so a rule scoped by a class or by any other id never reaches anything.
//
// That last hole is why `#tv-attr-logo` is absent from the model rather than
// excluded from it. It is a link, it is deliberately unlayered, and it is not a
// counterexample: it overrides a stylesheet the chart library injects at
// runtime, into markup this app does not render, so it is outside the fixture
// for the same reason it is outside the app's own tree. What this file models is
// the defaults the app writes for its own markup.
//
// What is left in reach is the bare type selector, and anything scoping it by
// the id, by an element ancestor the app renders, by an attribute the element
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

/**
 * The elements `src/index.css` writes defaults for, and a property each set has
 * to keep declaring. Every one of them is asked both halves of the fact above,
 * so the rule stated in `AGENTS.md` - never a bare `button`, `a`, `body` or
 * `h1` rule outside `@layer base` - is the rule this file enforces, rather than
 * a superset of it.
 */
const ELEMENT_DEFAULTS = [
  { tagName: "button", declares: ["border", "padding", "background-color"] },
  { tagName: "a", declares: ["color"] },
  { tagName: "body", declares: ["background-color", "margin"] },
  { tagName: "h1", declares: ["font-size"] },
];

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

interface ReachingSelector {
  selector: string;
  properties: string[];
}

let fixture: Element[];

beforeEach(() => {
  // The shell `src/App.tsx` renders, with the elements a rule could plausibly
  // be scoped by: the app mounts into `#root` (see `src/main.tsx`), which holds
  // one container, and that holds the tab `nav` and `main`. The visually hidden
  // `h1` is `main`'s first child because that is where the app renders it, so
  // a rule scoped `main h1 {}` reaches this one exactly as it reaches the
  // app's; do not move it back out. The buttons and the links sit where the
  // app's own do - the tab bar's buttons in the nav (see `src/App.tsx`),
  // `ExecuteTradePanel`'s inside `main` - so a rule written under any of those
  // ancestors reaches these too. The nav carries no `<a>` today; it stays in
  // the fixture because a bare `a {}` rule written under it would still reach
  // one.
  document.body.innerHTML = `
    <div id="root">
      <div>
        <nav>
          <button type="button">a tab</button>
          <a href="/active">a tab link</a>
          <span>not a button</span>
        </nav>
        <main>
          <h1>Block Builder</h1>
          <div>
            <button type="button">plain</button>
            <a href="/active">plain link</a>
            <div>not a button</div>
          </div>
        </main>
      </div>
    </div>`;

  fixture = [
    document.body,
    ...Array.from(document.querySelectorAll("#root, #root *")),
  ];
});

/** The rules that reach one element type and nothing else, by THE REACH above. */
const selectorsReaching = (
  tagName: string,
  keep: (rule: StyleRule) => boolean,
): ReachingSelector[] => {
  const targets = fixture.filter((element) => element.localName === tagName);
  const others = fixture.filter((element) => element.localName !== tagName);

  return parseRules(css)
    .filter(keep)
    .flatMap((rule) =>
      rule.selectors
        .map(asMatchableSelector)
        .filter(
          (selector) =>
            selector !== "" &&
            targets.some((target) => target.matches(selector)) &&
            !others.some((element) => element.matches(selector)),
        )
        .map((selector) => ({ selector, properties: rule.properties })),
    );
};

// A rule declaring nothing of its own paints nothing of its own: it is the
// outer half of a nested pair, and the nested rule is in the model separately.
const declaresSomething = ({ properties }: ReachingSelector): boolean =>
  properties.length > 0;

const isFocusRing = ({ properties }: ReachingSelector): boolean =>
  properties.length > 0 &&
  properties.every((property) => FOCUS_RING_PROPERTIES.has(property));

describe("the element defaults' cascade layer", () => {
  for (const { tagName, declares } of ELEMENT_DEFAULTS) {
    it(`lets no rule outside a cascade layer paint \`${tagName}\``, () => {
      // The whole point of the change that landed this: an element default has
      // to lose to the component's own utilities, and it only does if it is
      // layered. Named rather than counted - a failure here has to say which
      // selector broke back out, whatever it was written as.
      expect(
        selectorsReaching(tagName, (rule) => rule.layers.length === 0)
          .filter(declaresSomething)
          .map(({ selector }) => selector),
      ).toEqual([]);
    });

    it(`keeps the \`${tagName}\` defaults in \`@layer base\``, () => {
      // Half one is satisfied by an empty stylesheet, so this is the other
      // half: the defaults are still here, and still where a utility outranks
      // them.
      const base = selectorsReaching(tagName, (rule) =>
        rule.layers.includes(BASE_LAYER),
      );

      expect(
        base.filter((entry) => !isFocusRing(entry)).flatMap((e) => e.properties),
      ).toEqual(expect.arrayContaining(declares));
    });
  }

  it("keeps the focus ring in `@layer base`, reaching every button", () => {
    // The one part of the block that is a real default rather than a skin, and
    // the only element here that has one. No component overrides it, and a
    // button must not lose it.
    const focusRing = selectorsReaching("button", (rule) =>
      rule.layers.includes(BASE_LAYER),
    ).filter(isFocusRing);

    expect(focusRing.length).toBeGreaterThan(0);
    for (const { selector } of focusRing) {
      for (const button of Array.from(
        document.querySelectorAll("button"),
      )) {
        expect(button.matches(selector)).toBe(true);
      }
    }
  });
});
