# Interaction screenshots

Captured from the running app over the DevTools protocol, so every gesture below is real
browser input rather than a synthesised DOM event. Chrome at 1440x900 for the desktop shots
and 390x844 with touch emulation for the phone ones.

All four were recaptured against the final code. Earlier versions of these shots recorded
prices produced by the vertical-drag mapping this change replaced, which would have made
them look like corroboration of numbers that are no longer produced.

| Shot | What it shows |
|---|---|
| `01-keyboard-desktop.png` | Three legs assembled with the keyboard alone, and two of them priced with it: the Limit at -14.00% and the Stop Loss at -21.00%, both moved off the defaults their order types place them at (-25.00% and -15.00%). The focus ring sits on the Limit block. |
| `02-mouse-desktop.png` | Three legs assembled by dragging with the mouse, with the Entry limit priced by dragging it along its vertical axis. |
| `03-touch-phone.png` | The same three legs on a 390px viewport, assembled with a finger: tap to pick up, tap a cell to place, and a drag along the price axis. |
| `04-touch-phone-entry.png` | The same session scrolled back to the Entry column, showing the touch-priced Limit. |

The phone layout itself is a separate piece of work; these shots are about whether the
interaction responds at all, which before this change it did not.
