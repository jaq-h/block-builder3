# Interaction screenshots

Captured from the running app over the DevTools protocol, so every gesture below is real
browser input rather than a synthesised DOM event. Chrome at 1440x900 for the desktop shots
and 390x844 with touch emulation for the phone ones.

All four were captured against `ad7a372`. Two earlier sets had to be thrown away - the first
recorded prices produced by the vertical-drag mapping this change replaced, and the second
predated three further behavioural commits. A screenshot that predates the code it claims to
show is not evidence, so provenance here is stated as a commit rather than as "the final
code".

**These are evidence of the interaction, not of the current chrome.** The gestures and the
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

| Shot | What it shows |
|---|---|
| `01-keyboard-desktop.png` | Three legs assembled with the keyboard alone, and two of them priced with it: the Limit at -14.00% and the Stop Loss at -21.00%, both moved off the defaults their order types place them at (-25.00% and -15.00%). The focus ring sits on the Limit block. Pressing Enter on a placed block in this state is refused, because a mouse cannot move one between cells either. |
| `02-mouse-desktop.png` | Three legs assembled by dragging with the mouse, with the Entry limit priced by dragging it along its vertical axis. |
| `03-touch-phone.png` | The same three legs on a 390px viewport, assembled with a finger: tap to pick up, tap a cell to place, and a drag along the price axis. |
| `04-touch-phone-entry.png` | The same session scrolled back to the Entry column, showing the touch-priced Limit. |

The phone layout itself is a separate piece of work; these shots are about whether the
interaction responds at all, which before this change it did not.
