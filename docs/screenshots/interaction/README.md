# Interaction screenshots

Captured from the running app over the DevTools protocol, so every gesture below is real
browser input rather than a synthesised DOM event. Chrome at 1440x900 for the desktop shots
and 390x844 with touch emulation for the phone ones.

| Shot | What it shows |
|---|---|
| `01-keyboard-desktop.png` | A carry in progress, driven entirely from the keyboard. The Take Profit palette entry is outlined because it is the block being held; the Exit upper conditional cell is the current target. The Limit below it was placed the same way. |
| `02-mouse-desktop.png` | A three-leg strategy assembled by dragging with the mouse, with the Entry limit priced by dragging it along its vertical axis to -5.77%. |
| `03-touch-phone.png` | The same three legs on a 390px viewport, assembled with a finger: tap to pick up, tap a cell to place, and a drag along the price axis. |
| `04-touch-phone-entry.png` | The same session scrolled back to the Entry column, showing the touch-priced Limit at -9.68%. |

The phone layout itself is a separate piece of work; these shots are about whether the
interaction responds at all, which before this change it did not.
