// @vitest-environment jsdom
/// <reference lib="dom" />
//
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
// is the interim way out for one control at a time, and it only works while every
// unlayered button rule keeps excluding it. Let one back in and the pattern
// selector silently goes back to drawing nothing - silently, because nothing
// throws and no rendering test can see it: jsdom applies no author stylesheet, so
// a cascade is invisible to the rest of the suite.
//
// So this file asks the question by meaning rather than by spelling: it parses
// the stylesheet into rules and hands the selectors to the browser's own selector
// engine. A rule that skins buttons under any other unlayered selector fails it,
// and reformatting the stylesheet does not.
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

/** One style rule: the selectors it is written under and what it declares. */
interface StyleRule {
  selectors: string[];
  properties: string[];
}

/**
 * At-rules whose body holds ordinary style rules, so the walk descends into
 * them. `@layer` is deliberately absent: a layered rule loses to every Tailwind
 * utility, so it cannot be the defect this file guards against. `@theme` and
 * `@keyframes` hold declarations and keyframe selectors rather than rules, and
 * jsdom's selector engine would reject `0%, 100%` outright.
 */
const DESCENDED_AT_RULES = new Set(["media", "supports", "container", "scope"]);

/** Dynamic state a `matches()` call cannot reproduce, dropped before asking. */
const STATE_PSEUDO_CLASSES =
  /:(?:hover|active|focus|focus-visible|focus-within|link|visited|target)\b/g;

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
 * Every style rule the stylesheet places outside a cascade layer. Anything the
 * `@import "tailwindcss"` pulls in is layered by the framework and so is not
 * part of the model.
 */
const parseUnlayeredRules = (source: string): StyleRule[] => {
  const rules: StyleRule[] = [];

  const walk = (text: string): void => {
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
        if (DESCENDED_AT_RULES.has(name)) walk(block);
      } else if (head) {
        rules.push({
          selectors: splitSelectorList(head),
          properties: declaredProperties(block),
        });
      }

      prelude = "";
      index = end + 1;
    }
  };

  walk(source.replace(/\/\*[\s\S]*?\*\//g, ""));
  return rules;
};

/** What a selector can ever apply to, with state it cannot be asked about. */
const asMatchableSelector = (selector: string): string =>
  selector.replace(PSEUDO_ELEMENTS, "").replace(STATE_PSEUDO_CLASSES, "").trim();

interface ButtonSelector {
  selector: string;
  properties: string[];
}

let plainButton: Element;
let optedOutButton: Element;
let notAButton: Element;

/**
 * Selectors that single buttons out - they reach a button and cannot reach a
 * non-button, so they are the app's button skin rather than a universal reset
 * like `* { box-sizing }`, which every button keeps whatever it opts out of.
 */
let buttonSelectors: ButtonSelector[];

beforeEach(() => {
  // The app mounts into `#root` (see `src/main.tsx`), so a rule written as a
  // descendant of it reaches the real buttons and has to reach these.
  document.body.innerHTML = `
    <div id="root">
      <button type="button">plain</button>
      <button type="button" data-unstyled>brings its own skin</button>
      <div>not a button</div>
    </div>`;

  plainButton = document.querySelector("button:not([data-unstyled])")!;
  optedOutButton = document.querySelector("button[data-unstyled]")!;
  notAButton = document.querySelector("#root > div")!;

  buttonSelectors = parseUnlayeredRules(css).flatMap((rule) =>
    rule.selectors
      .map(asMatchableSelector)
      .filter(
        (selector) =>
          selector !== "" &&
          plainButton.matches(selector) &&
          !notAButton.matches(selector),
      )
      .map((selector) => ({ selector, properties: rule.properties })),
  );
});

const isFocusRing = ({ properties }: ButtonSelector): boolean =>
  properties.length > 0 &&
  properties.every((property) => FOCUS_RING_PROPERTIES.has(property));

const skinSelectors = (): ButtonSelector[] =>
  buttonSelectors.filter((entry) => !isFocusRing(entry));

const skinPropertiesReaching = (element: Element): string[] => [
  ...new Set(
    skinSelectors()
      .filter(({ selector }) => element.matches(selector))
      .flatMap(({ properties }) => properties),
  ),
];

describe("the button reset's opt-out", () => {
  it("skins a plain button, so opting out is worth something", () => {
    // If this ever fails the reset has been neutered app-wide - or moved into a
    // cascade layer, in which case the design change has landed and this guard
    // comes off along with every `data-unstyled`.
    expect(skinPropertiesReaching(plainButton)).toEqual(
      expect.arrayContaining(["border", "padding", "background-color"]),
    );
  });

  it("lets no unlayered skin rule reach a `data-unstyled` button", () => {
    // Named rather than counted: a failure here has to say which selector let
    // the skin back in, whatever it was written as.
    expect(
      skinSelectors()
        .filter(({ selector }) => optedOutButton.matches(selector))
        .map(({ selector }) => selector),
    ).toEqual([]);
  });

  it("keeps the focus ring reaching every button", () => {
    const focusRing = buttonSelectors.filter(isFocusRing);

    expect(focusRing.length).toBeGreaterThan(0);
    for (const { selector } of focusRing) {
      expect(optedOutButton.matches(selector)).toBe(true);
    }
  });
});
