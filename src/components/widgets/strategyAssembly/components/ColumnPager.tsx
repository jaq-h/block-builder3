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
 */
const ColumnPager: FC<ColumnPagerProps> = ({ visibleColumn, onShowColumn }) => (
  <div className={columnPagerRow} role="group" aria-label="Grid column shown">
    {COLUMN_HEADERS.map((header, col) => {
      const isActive = col === visibleColumn;
      return (
        <button
          key={header}
          type="button"
          aria-pressed={isActive}
          className={columnPagerButton({ isActive })}
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
