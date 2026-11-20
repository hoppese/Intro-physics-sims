# Forces Lab sources

`forces-lab/index.html` is a generated bundle. Its page markup is `markup.html` and its script is the files
in `src/` joined in filename order. **Edit the files here, never the bundle**, then from the repo root:

    sh tools/forces-lab/build.sh        # tests, then write the markup and the script into the bundle
    sh tools/forces-lab/build.sh test   # tests only

A failing suite stops the build. Then open `forces-lab/?v=<new number>` (the browser caches hard).
The frame (toolbar, panel, undo, share links, tape and angle tools) follows Optics Lab's.

| File | Classes | Job |
| --- | --- | --- |
| `10-math.js` | `V`, `Angle`, `Fmt` | Vectors, degrees, number formatting (N, m/s², true minus). |
| `20-elements.js` | `Element` → `Block`, `Surface`, `Pulley`, `Anchor`; `Link` → `Rope`, `Spring`, `Push` | What can be put on the bench, as set up; rope routing over pulleys (`Rope.route`). |
| `30-scene.js` | `Scene` | The set-up; names ("Ramp 1"); links dropped with what they join; snapshot / share link. |
| `40-engine.js` | `World` | The bench in motion: contacts, the constrained solve, time steps, read-outs. |
| `45-presets.js` | `PRESETS`, `Build` | Thirteen classic problems. |
| `50-view-history.js`, `52-measure.js`, `64-share.js` | `View`, `History`, `Measure`, `ShareLink` | As in Optics Lab, in metres. |
| `55-renderer.js` | `Renderer` | The bench, free-body arrows (Knight's symbols), labels placed clear of lines and blocks. |
| `60-workbench.js` | `Workbench`, `ADD_MENU` | Every change, the clock, joining things with ropes and springs, snapping blocks onto supports. |
| `62-gestures.js` | `PointerTool` | Drag, handles, joining clicks, tape. |
| `70-panel.js` | `UI`, `Panel` | Toolbar, clock, the selected element's card with its free-body table, block list, gravity. |
| `80-component.js` | `Component` | The page controller; runs the clock from the frame tick. Not covered by the node tests. |

## The model (`40-engine.js`)

- **Blocks** are particles with a size: forces act at the centre; no tipping or spinning. A block takes the
  tilt of whatever it rests on. **Surfaces** are one-sided straight faces (the side to the left of their
  direction pushes). **Pulleys** are ideal and fixed; **ropes** massless and unstretchable; **springs** obey
  Hooke's law both ways; an **applied force** is steady.
- At each instant `World.solve()` solves m a = ΣF for every block together, with the active constraints
  (contacts, sticking friction, taut ropes) as a linear system, then checks every rule (n ≥ 0, |f_s| ≤ μs n,
  T ≥ 0, a slack rope or open gap that would be violated) and fixes the worst until all hold. Static friction
  is never bigger than needed (`needless()`): where the equations allow any value (blocks side by side) it is
  zero. Answers match the closed forms to 1e-9.
- Time steps are velocity Verlet at 1/600 s (exact for steady forces; springs keep their energy). Landing and
  a rope snapping taut are perfectly inelastic. A block that reaches a pulley stops the clock.
- Not modelled: rolling, tipping, massive pulleys or ropes, speed-dependent friction, air resistance.

## Tests

| Suite | Covers |
| --- | --- |
| `t-engine.js` | Inclines (with and without friction), stopping, Atwood, table + hanging, incline + pulley, pushed pair (third law), stacked blocks sticking and slipping, block on a wall, springs (period, energy), hanging spring, projectile, landing, pendulum, slack rope, random benches. |
| `t-presets.js` | Every preset loads exactly, runs, shares, and gives the numbers its note promises. |
| `t-bench.js` | Building by hand (snap, rope by clicks, springs, applied force, delete/undo), the surface handle, and the panel and renderer in every state of every preset. |
