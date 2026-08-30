import type { FC } from "react";
import CheckIcon from "../../../../assets/icons/check.svg?react";
import { COLUMN_HEADERS } from "../../../../data/orderTypes";
import {
  columnPagerRow,
  columnPagerButton,
  columnPagerMarker,
} from "../strategyAssembly.styles";

interface ColumnPagerProps {
  /** Which column the paged viewport is showing. */
  visibleColumn: number;
  /**
   * Whether a block is in the user's hand right now.
   *
   * It decides whether these buttons are reachable by focus at all; the rule
   * and the whole of why it is safe are below.
   */
  isCarrying: boolean;
  /** Show this column instead. */
  onShowColumn: (col: number) => void;
}

/**
 * COLUMN PAGER - the control that moves the user to the other grid column.
 *
 * Below `sm` the panel cannot draw both columns at once: two `min-w-[220px]`
 * columns and a gap need 446px against a 288px panel at 320. They stay side by
 * side anyway, and `columnsWrapper` becomes a one-column viewport over them;
 * this is what moves that viewport.
 *
 * **One button per column rather than a single "next".** With two columns the
 * two spellings reach the same cells, and this one is better for the users the
 * control matters most to: each button's name is stable, so a voice-control
 * user can say it, and the pair states where you *are* as well as where you can
 * go. Its selected state is drawn the way `PatternSelector` draws one - an
 * accent border, a tick in a slot reserved on both buttons so the label does
 * not shift, and `aria-pressed` - because no control here says which of two
 * things is chosen in colour alone.
 *
 * **It is not the only way across, and it is not a second mechanism.** While a
 * block is in hand the Left and Right arrow keys already move the carry's
 * target between columns, and this button dispatches that same `moveTarget`
 * rather than a move of its own - so the sentence the user hears, and the rule
 * about which cells a carry may reach, are the ones that were already there.
 * The viewport follows the carry's target; see `GridArea`.
 *
 * ─── WHILE A BLOCK IS IN HAND, THESE BUTTONS TAKE NO FOCUS ───────────
 *
 * `tabIndex={-1}` takes them out of the tab order, and the `pointerdown`
 * default is prevented so a press does not focus them either. Both only while
 * carrying. **Nothing in this app moves DOM focus in answer to paging, and
 * this is what makes that safe.**
 *
 * **The problem it removes.** The off-page column is `visibility: hidden`, and
 * every key that drives a carry - the arrows, Enter, Escape - is handled ON
 * the carried order's palette tile or ON a block; there is no document-level
 * handler. So focus resting on one of these buttons during a carry is a user
 * holding an order that no key can put down: Enter is the same press again,
 * Escape does nothing, the arrows do nothing. Four rounds of answering that
 * with a focus hand-off each found a further path the last one could not see,
 * and a hand-off is expensive in its own right - it moves focus where the user
 * did not ask, and a request that cannot land re-renders without settling.
 * **Stranding is removed here instead of remedied there: you cannot be
 * stranded on a control you cannot reach.**
 *
 * **This is NOT the "paging never moves focus" option that was rejected.**
 * That one left focus standing ON the button and called it acceptable. This
 * one takes away the reachability that put focus there.
 *
 * **A keyboard carrier never needs this control**, which is what makes taking
 * it out of their reach a removal rather than a loss. `validTargetsFor` walks
 * the whole grid with no column scoping, and `stepTarget` takes for a
 * horizontal move every target with `(cell.col - current.col) * dCol > 0` -
 * which from an Entry target is every legal Exit target. So the arrows cross
 * to the other column exactly when a legal cell exists there, and when none
 * exists there is nothing to cross to. Keyboard users cross with the arrows;
 * pointer users tap here and then tap a cell; focus does not move for either.
 *
 * **Not focusable is not not operable, and the three limits on it are not
 * optional.** The buttons stay fully clickable, keep their 24px WCAG 2.2 SC
 * 2.5.8 target and stay in the accessibility tree - `disabled` would stop the
 * paging pointer users depend on, and hiding them would remove the control.
 * Carrying NOTHING they are an ordinary tab stop, because a user who is not
 * carrying has no arrow keys to cross with and genuinely needs this. And what
 * a press says is unchanged either way: the same-column press is a silent
 * no-op and a refused move still announces the refusal.
 *
 * ─── TWO LIMITATIONS, ACCEPTED AND WRITTEN DOWN RATHER THAN HIDDEN ───
 *
 * **Focus already INSIDE the column a press hides is still lost.** A pointer
 * user taps a placed block - `usePointerGesture` focuses it - and then taps
 * the other column here; that column goes `visibility: hidden` under the
 * focused block and the browser drops focus to `<body>`. Nothing above
 * prevents that: this rule keeps focus off the BUTTON, and says nothing about
 * where focus already was.
 *
 * **It is accepted deliberately, and the trade is the point.** There is no
 * remedy that does not move focus - something has to be holding it, and the
 * thing holding it is exactly what is being hidden - and focus-moving is the
 * mechanism four consecutive rounds removed: it produced a desktop regression
 * (focus stolen at 1440 where nothing was hidden at all) and a re-render loop
 * that never settled when the request could not land, each round's point fix
 * exposing the next path. **This is not the defect that was ruled
 * unshippable**: that one left the user unable to place or cancel what they
 * were holding. Here the carry stays live, Tab leaves for the palette, and a
 * pointer user simply taps the cell. And the path needs a pointer user to
 * switch to the keyboard mid-carry, because both halves of it are pointer
 * presses - a keyboard-only user cannot reach it at all, since they cross
 * columns with the arrows, which never touch this control. The users most
 * harmed by lost focus are the ones who cannot hit it. **Do not answer this
 * with a focus hand-off.**
 *
 * **Assistive technology can put focus on a `tabindex="-1"` element
 * directly**, so an AT user can still land here mid-carry. They are not
 * stranded - Shift+Tab leaves, and the carry is still live when they get back -
 * but the control is not literally unreachable, and the rule above should not
 * be read as claiming it is.
 */
const ColumnPager: FC<ColumnPagerProps> = ({
  visibleColumn,
  isCarrying,
  onShowColumn,
}) => (
  <div className={columnPagerRow} role="group" aria-label="Grid column shown">
    {COLUMN_HEADERS.map((header, col) => {
      const isActive = col === visibleColumn;
      return (
        <button
          key={header}
          type="button"
          aria-pressed={isActive}
          tabIndex={isCarrying ? -1 : undefined}
          className={columnPagerButton({ isActive })}
          // The press that pages without moving focus. Preventing the
          // `pointerdown` default suppresses the implicit focus - the same
          // thing `usePointerGesture` does before placing focus by hand - and
          // leaves the `click` that follows it alone, so the button still
          // pages for every pointer. It is the pointer half of the rule above;
          // `tabIndex` is the keyboard half, and each is useless without the
          // other.
          onPointerDown={
            isCarrying ? (event) => event.preventDefault() : undefined
          }
          onClick={() => onShowColumn(col)}
        >
          {/* The cue that survives with no colour at all, in a slot both
              buttons carry so the label does not shift sideways as the tick
              appears - and mirrored on the trailing side so the label keeps the
              button's own centre line rather than riding half a slot to the
              right of it. `aria-hidden` on both: on the marker because
              `aria-pressed` above already carries the same fact and announcing
              it twice is worse than once, on the mirror because it is empty.
              Same treatment as `PatternSelector`, which is this app's worked
              example of a selected state that is not colour alone. */}
          <span className={columnPagerMarker} aria-hidden="true">
            {isActive && <CheckIcon width={11} height={11} />}
          </span>
          {header}
          <span className={columnPagerMarker} aria-hidden="true" />
        </button>
      );
    })}
  </div>
);

export default ColumnPager;
