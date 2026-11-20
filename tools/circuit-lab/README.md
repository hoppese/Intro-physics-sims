# Circuit Lab sources

`circuit-lab/index.html` is a generated bundle. Its script is the files in
`src/` joined in filename order. **Edit the files here, never the bundle's
script**, then run:

    sh tools/circuit-lab/build.sh        # tests, then rebuild the bundle and the variants
    sh tools/circuit-lab/build.sh test   # tests only

If a test suite fails, nothing is rebuilt. The build replaces only the script. The page markup (toolbar, side panel,
Info and dialogs) lives in the bundle itself; change it there, following the
bundle-editing notes in `docs/CONVENTIONS.md`.

## What lives where

| File | Classes | Job |
| --- | --- | --- |
| `10-elements.js` | `P`, `Element` and one subclass per part (`Wire`, `Resistor`, `Capacitor`, `Inductor`, `Battery`, `AcSource`, `Switch`, `ThrowSwitch`, `Ground`, `Meter` → `Voltmeter`, `Ammeter`), `ELEMENTS`, `Trace` | A part owns its geometry, its move / rotate / flip, the branch it contributes to the solver, its live state and its share-link token. `Trace` is the run of samples a graph draws. |
| `20-circuit.js` | `Circuit` | The parts plus the wire network, and every edit: add, move, reshape, delete, wire routing, clean-up, encode / decode. |
| `30-solver.js` | `Solver`, `Solution` | Nodal analysis over a `Circuit`, and the answer it hands back (node voltages, branch currents). |
| `40-history-view.js` | `History`, `View`, `Fmt` | Undo / redo snapshots; pan-zoom window and coordinate conversions; number formatting. |
| `45-presets.js` | `PRESETS` | The preset circuits, as share-link strings. |
| `50-painters.js` | `Painter` and one subclass per part, `Draw`, `PAINTERS` | How each kind of part is drawn. |
| `55-renderer.js` | `Renderer`, `GraphPainter` | Lays out labels, paints the bench and the graph (docked under the circuit, or enlarged over it). |
| `60-workbench.js` | `Scope`, `Simulation`, `Workbench` | `Scope` records ΔV and I for every part, for the Probe variant (off in the main sim). The clock (backward-differentiation steps up to fourth order, restarted at first order after any jump: see *The clock* below) and what the user is doing to the circuit: selection, probe, notices, history, automatic view. |
| `62-gestures.js` | `Gesture` → `PanGesture`, `PinchGesture`, `WireGesture`, `MoveGesture`; `PointerTool` | Mouse and touch input. |
| `64-examples.js` | `WorkedExample`, `ShareLink` | Worked-example text built from the live circuit; share URLs. |
| `70-panel.js` | `Panel` | Everything the side panel and menus show. |
| `80-component.js` | `Component` | The page controller: wires DOM events to the classes above. |

Nothing in files 10–45 touches the canvas or the DOM, which is what lets
`test/` run them under plain node.

## The clock

`Simulation.advance()` moves time in steps of `DT` (2 ms), each cut into
`cuts` equal steps so that the fastest swing the circuit can make (its AC
sources, or `sqrt(nL nC / (Lmin Cmin))`) gets `FINE` (150) steps a period, up
to `FINEST` (32) cuts. Capacitors and inductors discretise a step through
`Element.stepFormula(env, values)`: backward differentiation of order
`env.order` (absent: 2), or order 1 when `env.first` is set.

- `Simulation.since` counts steps since the last jump (`jolt()`, `reset()`,
  a change of `cuts`). The first `RESTART` (2) are first order and are taken
  by `Simulation.start()` as `START` (16) short backward-Euler steps, after
  which each part is told the step it has behind it is a whole one
  (`stepFrom(live)`). Then the order climbs 2, 3, `ORDER` (4).
- Order 4 is only stable for swings the step resolves, so when `pace()` had
  to cap the cuts (`resolved` false) the order stays at 2.
- Why not plain second order: it runs slow by (ω dt)²/3. That is 1 part in
  10⁴ at 300 steps a period — and a 13 % error in the current of a tank
  driven 0.1 % off resonance. Why not the trapezoidal rule: it rings on a
  decay faster than the step.
- `Solver.instant()` solves the present instant without moving time on (three
  solves at dt, 2dt, 4dt followed back to dt = 0); `Solver.commit()` hands a
  solution's values to the parts. `jolt()` uses both when the circuit changes
  under the clock.
- What the user sees is `shown = t - origin`; `t` itself only runs forward (an AC source's phase hangs on it).
  `mark()` sets the origin. `timed` (a clocked part, or a graph on) says whether the clock face is up at all, and
  `face()` — called after every edit and every graph toggle — marks t = 0 when the face comes up where there was
  none. `refresh(edited)` also marks when an edit brings a dead circuit to life. `reset()` is the ↻ t=0 button.
- A `Trace` keeps one break `[t, NaN]` wherever there was nothing to read; `GraphPainter` lifts the pen there and the
  axis range skips it.

## Turning and re-laying leads

`Circuit.rotate(el, dir)` turns a part a quarter turn about its middle and re-lays its leads; where the
turned part cannot be wired it turns end for end instead (`{swapped, reversed}`) and `el.turnEndForEnd()`
carries the charge, current or meter sign round with it. `Circuit.reshape` then calls `unjog(el, was)`:
each lead is replaced by the path with the fewest corners among `routes()` (one shortest path per direction
out of the terminal), of the same length -- or shorter where `was` (from `directLeads(el)`, taken before the
move) says the lead ran straight to the part.

A quarter turn about the middle is not its own inverse on the wires, so `Workbench.rotate` keeps a memory of
the run of turns: `spin = { circuit, id, par, seen, now }`. `seen` maps `Workbench.lies(el)` (the ordered
terminals) to the wire edges and auto-edge set of the first time the part lay that way, with the parity
`par` of end-for-end turns then; `now` is `Workbench.drawn(c)`, so any other layout change starts a new run.
Landing on a remembered position puts that wiring back, and if the parity differs turns the part end for end
(reported as a reversal for a directional part). Tests: F106.

## Wires and what is said about them

`WireGesture.drag` lays an elbow between the two ends of a drag. `Circuit.inLine(p, next)` is 1 when a wire
going from `p` to `next` leaves the end of a part straight out; the elbow with the higher `inLine` total at
its two ends is tried first, and the pointer's first direction settles a tie. `Circuit.checkPath(pts)` is the
judge of legality and its `why` names what is in the way through `nameOf(el)` / `nameIn(el)` ("R₁", "the
ground"), `through(k)` (a part's body on a grid point) and `along(e)` (a part's body on an edge). Tests: F107,
F108.

## Sources across each other

`Solver.solve` gathers, in each connected group, the ideal sources (`ri` ≤ 1 µΩ) by the pair of nodes they
join. One of each set goes into the equations; afterwards the set shares its current equally (a member that
faces the other way would be a clash, so it never gets that far). A set whose voltages differ marks the
solution `clash` and the group has no answer. A group with no answer -- a clash, or a singular matrix -- has
NaN node potentials AND NaN branch currents (`dead()`), so `Solution.current()` is NaN and the card shows "—";
`Solution.flow()` is 0, so nothing drifts along its wires; the parts keep their state (charge, current) until
the circuit can be solved again. `Solution.dead` holds the ids of such groups and `Solution.stuck(p)` asks
whether the circuit at `p` is one of them; `Ammeter.reading` uses it to answer `{ err }` (drawn "—") rather
than the 0 that `flow()` would give it. Tests: S15, F109.

## An ammeter in a short wire

`Circuit.moveOnto` tries, in order: lifting a wired ammeter out (`liftOnto`), the plain move, a quarter turn
into the wire the part was dropped across (`turnOnto`), and last, for an ammeter only, `squeezeOnto`: the
meter at two squares long about the middle of where it was dropped, along the wire or turned into it, one
step either way along the wire tried too. It is taken only if `plan` says it is spliced INTO a wire, and the
result carries `squeezed` (the gesture says "Shortened to fit this stretch of wire"). An ammeter never grows
back; a new one from the menu is four squares. Tests: F110 (and the corner case in F87).

## Parts side by side

`Circuit.crowdedBy(el, geom, all)` names the part that `el`, put at `geom`, would lie right beside: the same
way round, on the very next row (or column), and overlapping along their length -- where the two symbols and
their labels run into each other. `move` (so a drag and an arrow-key nudge), `turnOnto`, `squeezeOnto` and
`liftOnto` all refuse on it ("C₁ would be right beside it (leave a clear row between them)"). A part that
already lies beside another may slide along it or move away (only a NEW neighbour refuses; pass `all` to count
every neighbour, as the preset check does). Turning a part and loading a link are not held to it. Tests: F111.

## The page markup

The toolbar, side panel, Info and dialogs are a template inside
`circuit-lab/index.html`, not in `src/`. Change it in the bundle (print the
slice first, replace an exact string once), then run `build.sh`: the variants
are copies of the main bundle and only pick up markup changes at build time.
A full build takes about two minutes (the fuzz suite).

## Variants

`variants/<name>.js` makes `circuit-lab-<name>/`: the main bundle with that
file read in between files 10–79 and the page controller. A variant should be
a switch on a class that already exists (`probe.js` is `Scope.on = true`), with
the behaviour itself in `src/` where the tests can reach it. The page markup is
shared, so anything a variant shows is a binding the main sim leaves empty.
See `docs/circuit-lab-variants.md`.

## Adding a kind of part

1. Subclass `Element` in `10-elements.js`: give it a `type`, a share-link
   `code` and an `info` block (name, label prefix, value range, menu entry),
   override `branch()` / `shorts()` for what it does electrically, and add the
   class to `ELEMENT_CLASSES`. The Add menu, the selected-part card and the
   share link pick it up from there.
2. Subclass `Painter` in `50-painters.js` and add it to `PAINTERS`.
3. Add a test to `test/t-circuit.js` (geometry, encode / decode round trip)
   and, if it has electrical behaviour, `test/t-solver.js`.

No other file should need a `type ===` check.

## Tests

`test/load.js` loads files 10–79 into one scope and exports the classes.
`t-circuit`, `t-solver`, `t-presets`, `t-bench` cover the model, the physics
(against closed-form RC / RL / RLC / AC answers), the presets and the
pointer tool. `t-fixes` holds one block per bug found by hand, so a fixed
bug stays fixed: add to it whenever a new one turns up.

`80-component.js` (the page controller: keyboard, mounting, the tab title) is not loaded by the tests. F127 in
`t-fixes` presses every handler the panel hands to the page on every preset, which catches a handler that names
something out of scope; anything else in that file has to be tried in a browser.
