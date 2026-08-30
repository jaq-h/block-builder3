# Interaction screenshots

Captured from the running app over the DevTools protocol, so every gesture below is real
browser input rather than a synthesised DOM event. Chrome at 1440x900 for the desktop shots
and 390x844 with touch emulation for the phone ones.

`01`-`04` were captured against `ad7a372`; `05` against `211d648`, which is the commit that
added the interaction it shows. Two earlier sets had to be thrown away - the first
recorded prices produced by the vertical-drag mapping this change replaced, and the second
predated three further behavioural commits. A screenshot that predates the code it claims to
show is not evidence, so provenance here is stated as a commit rather than as "the final
code".

**`01`-`04` are evidence of the interaction, not of the current chrome.** The gestures and the
outcomes below still hold, but the panel chrome around them has since been reworked: all
three panel titles now share one bar geometry, the selected order assembly type carries an
accent border and a tick rather than looking identical to the unselected one, the grid
cell's height floor is derived from the axis geometry instead of a flat 220px, the Active
Orders container no longer draws a scrollbar it can never move, and a market selector now
sits in its own row above the pattern selector. So the header
alignment, the pattern selector and the scrollbars visible in these shots are the state
those changes replaced. Re-shooting the set is the job of whoever next needs it to show
chrome. The pointer drag defect that used to block that - a drag left the block welded to
the cursor and placed nothing, whenever the panel was unmounted mid-gesture - is fixed, so
`02-mouse-desktop.png` can be re-shot against a working gesture again. This folder's own
rule still stands: a screenshot that records a known defect as the reference is no more
evidence than one that predates the code it claims to show.

**All five shots, `05` included, now predate the app's button treatment.** The bare
element defaults in `src/index.css` have since moved into `@layer base`, so every button
paints what its own utilities ask for instead of the Vite starter's grey skin. The
palette's block tiles are the visible difference in these shots: they were quiet grey
squares under a 1px neutral border and are now accent-tinted tiles under a 2px one, with
the saturated accent left to the states. `AGENTS.md` under "Layout and the CSS cascade"
is the authority on that change; the gestures and outcomes below are unaffected by it.

**`03` and `04` also predate the phone layout the app draws today.** Both were shot
while the assembly grid's three lanes were side by side at every width, which is why
`03` shows the Exit column clipped off the right of a 390px viewport with nothing
offering a way to it. Below `sm` the palette is now a band of tiles above the grid
rather than a lane beside it, and the Entry and Exit columns stay side by side inside a
one-column viewport that a two-button pager moves between them, with 20% of the off-page
column showing past the edge as a cue that there is more to view. So the arrangement in
these two shots is the state that change replaced. The gestures and outcomes below are
unaffected: tap to pick up and tap to place still reach every cell at every width, and
the price axis still draws and drags at 390. `AGENTS.md` under "Layout and the CSS
cascade" is the authority on the paged columns and on the price axis' height, and
`README.md` under "Interaction model" on what the pager does to a carry.

**They also predate the cell's clear control.** A cell that holds an order now carries a 24px
clear button in the cell's own top-right rail, ahead of the row-label badge and rendered at
all times rather than revealed on hover, so the filled cells in all five shots are missing an
affordance the app draws today. The block **tiles** in them are not: no control sits on a
tile, so what these shots show of a tile's own face is what the app draws. The gestures and
outcomes below are unaffected either way: removal is an operation beside them rather than a
change to any of them. `README.md` under "Interaction model" is the authority on it.

| Shot | What it shows |
|---|---|
| `01-keyboard-desktop.png` | Three legs assembled with the keyboard alone, and two of them priced with it: the Limit at -14.00% and the Stop Loss at -21.00%, both moved off the defaults their order types place them at (-25.00% and -15.00%). The focus ring sits on the Limit block. Pressing Enter on a placed block in this state is refused, because a placed block never changes cells by any input method (decision D9). |
| `02-mouse-desktop.png` | Three legs assembled by dragging with the mouse, with the Entry limit priced by dragging it along its vertical axis. |
| `03-touch-phone.png` | The same three legs on a 390px viewport, assembled with a finger: tap to pick up, tap a cell to place, and a drag along the price axis. |
| `04-touch-phone-entry.png` | The same session scrolled back to the Entry column, showing the touch-priced Limit. |
| `05-mouse-click-carry.png` | The mouse driving the command model rather than a drag: the Entry limit was assembled by clicking the palette entry and then clicking the cell, and a Take Profit is mid-carry - outlined in the palette, drawn on the cursor, over the Exit upper conditional cell that the next click will place it into. It postdates the panel-chrome rework `01`-`04` predate, but like them it predates the button repaint. |

The phone layout itself is a separate piece of work; these shots are about whether the
interaction responds at all, which before this change it did not.
