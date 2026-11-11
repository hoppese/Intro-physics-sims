# Circuit Lab variants

Two experiments in how graphing is offered were built in September 2026 as
separate forks of `circuit-lab`. Since the class-based rewrite (November 2026)
neither is a fork any more. Neither is in the catalog.

## `circuit-lab-scope/`: folded into Circuit Lab

The scope variant's one idea was to draw the meter graph as a strip under the
circuit instead of in the side panel. That is now how Circuit Lab itself works:
the graph docks along the bottom of the canvas, the circuit refits above it,
and clicking the graph (or its ⤢ button) enlarges it over the canvas. So
`circuit-lab-scope/index.html` is only a page that forwards to
`../circuit-lab/`, keeping any share link in the address. The old bundle is in
the git history.

## `circuit-lab-probe/`: any part can go on the graph

EveryCircuit's model: no meter needed. It is Circuit Lab's own sources plus one
line (`tools/circuit-lab/variants/probe.js` sets `Scope.on = true`), built by
`tools/circuit-lab/build.sh` alongside the main sim, so every fix to the main
sim reaches it. The behaviour lives in the `Scope` class
(`tools/circuit-lab/src/60-workbench.js`) and is tested in `test/t-bench.js`.

What it does:

- The graph is always showing and the clock always runs. The potential
  difference across and the current through every part (wires, resistors,
  capacitors, inductors, sources, switches) are recorded all the time, so a
  part's trace has its past the moment it is clicked.
- The graph shows the **selected** part. In its card, the two readings
  ("Voltage across", "Current through") are the choice of which one is
  plotted: the outlined, tinted one is on the graph, and clicking the other
  swaps. A wire offers its current only. Wires and switches start on current,
  everything else on potential difference.
- **Keep** leaves a part's trace on the graph after the selection moves on, so
  two or three parts can be compared. Click it again ("✓ Kept") to take the
  trace off. Kept traces are not saved in share links.
- Meters keep their own graph buttons and plot beside the part traces.
- With the solution hidden the part traces are hidden too.

Sign of a part's trace: each run counts as positive in the direction it first
went. A battery reads +6 V whichever way round it was drawn, and a capacitor's
current reads positive while it charges and negative once it discharges. (A
meter's trace is signed by its + lead, as always.)

## The old open questions

- **Which graph placement?** Under the circuit, with click to enlarge. Done in
  the main sim.
- **Probe automatically on select, or with an explicit button?** Both: the
  selected part is plotted automatically, and Keep is the explicit button for
  anything that should stay. That also answers "there is no way to un-probe".
- **Should Probe become the main sim?** Still open. It is a different way to
  teach (no meters to wire in), so it stays a variant until Seth has tried it.
- **Shift-click multi-select** is still not built in either. See
  `circuit-lab-ui-review.md` #8.
