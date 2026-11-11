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
| `60-workbench.js` | `Scope`, `Simulation`, `Workbench` | `Scope` records ΔV and I for every part, for the Probe variant (off in the main sim). The clock (BDF2 steps, restarted with backward Euler after any jump) and what the user is doing to the circuit: selection, probe, notices, history, automatic view. |
| `62-gestures.js` | `Gesture` → `PanGesture`, `PinchGesture`, `WireGesture`, `MoveGesture`; `PointerTool` | Mouse and touch input. |
| `64-examples.js` | `WorkedExample`, `ShareLink` | Worked-example text built from the live circuit; share URLs. |
| `70-panel.js` | `Panel` | Everything the side panel and menus show. |
| `80-component.js` | `Component` | The page controller: wires DOM events to the classes above. |

Nothing in files 10–45 touches the canvas or the DOM, which is what lets
`test/` run them under plain node.

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
