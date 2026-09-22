# Circuit Lab variants — what to look at

Two forks of `circuit-lab`, for comparison. Neither is in the catalog.

- **`circuit-lab-scope/`** — plot as a full-width strip under the circuit,
  560×210. Reads like a bench scope: the circuit on top, the trace beneath it.
  Graphing still comes from meters, as in the original.

- **`circuit-lab-probe/`** — EveryCircuit's model. Click *any* part — resistor,
  capacitor, battery, wire — and it immediately becomes a trace. No meter
  required. Plot stays in the right column but grows to 295×221.

Both also fix, from `circuit-lab-ui-review.md`:

1. **Wires are clickable along their whole length** (#1). Previously hit-testing
   measured distance to a component's *midpoint*, so a long wire had a ~40 px
   clickable blob at its centre and was dead everywhere else.
2. **Clicking empty canvas deselects** (#2). Previously a click within 22 px of
   any grid dot started a wire placement and returned before the deselect —
   i.e. almost everywhere.
3. **Erase button removed** (#4). It was redundant with the panel's Delete, and
   only existed because deleting a wire was hard — which #1 fixes. Removing it
   without #1 would have made wires undeletable.

## Open questions for you

- **Which graph placement?** Scope wins on size and on not fighting the panel;
  probe wins on staying next to the readouts.
- **Should probing be automatic on select** (as in `circuit-lab-probe`) or an
  explicit "Plot this" button? Automatic is fewer clicks but clutters the plot
  fast on a big circuit — there is currently no way to un-probe except
  `clearProbes()`, which has no button yet.
- **Shift-click multi-select** — deliberately *not* built. See review #8: it
  needs `state.sel` to become a set, and I think rubber-band selection with a
  proper Select tool is the better answer for the "delete this branch" case.
  Say the word and I will do it.
