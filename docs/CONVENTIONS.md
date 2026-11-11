# Sim & Course Conventions

Living reference for notation and UI/UX rules that apply across the sim
catalog. When a rule conflicts with what an older sim actually does, the
older sim is wrong, not this doc — fix the sim (or note it below as a known
gap) rather than "discovering" a new convention from it.

Each rule below is a summary; where a fuller writeup exists it's linked.
Update this file whenever a new convention is set, and run the **monthly
audit checklist** at the bottom against the catalog.

## Notation

- **Coulomb's constant**: never write `k`. Always spell out `1/(4πε₀)`
  (LaTeX: `\dfrac{1}{4\pi\varepsilon_0}`, or plain-Unicode `1/(4πε₀)` in
  non-LaTeX prose/x-formula text). Numeric substitutions are unchanged
  (`1/(4πε₀) = 8.99×10⁹`). Applies to every sim Info panel, worked example,
  Kickoff/Prep Moodle question, lecture note, and HW solution. See
  `coulomb-constant-convention` memory for the full rule + rationale.
- **Vectors**: arrow over the letter (`\vec{F}`), never bold (`\textbf{F}`).
  See `vector-notation-convention` memory.
- **Dash vs. minus**: never put an em-dash directly next to a magnitude
  bar/number (e.g. `|F|—5 N`); use a colon or parentheses instead. See
  `dash-vs-minus-convention` memory.

## Sim shell / layout

Reference implementation: `field-superposition-explorer` ("Electric Field
Explorer"). Any sim rebuild should match this unless a specific override is
recorded here.

- Outer wrapper is a light card: `background:#fff`, `border:1px solid
  #dde1e5`, `border-radius:14px`, `overflow:hidden`. **Only** the header bar
  and the canvas area are dark — side panels (controls, source list, detail
  panels) are white/light (`#fff` / `#fbfcfd` backgrounds, `#dde1e5`/`#dfe6ec`
  borders, dark text). Do not give a sim a fully-dark side panel without the
  user asking for that specific sim by name.
- Header: sim name + small colored square icon, "Random problem" button
  (when applicable), hamburger (☰) menu on the right.
- Hamburger menu, in order: **All sims** (back arrow) → **Info** →
  **Worked example** → *(optional "Show on map" section: checkable toggle
  rows for what's drawn on the canvas)* → **Submit bug**.
- Canvas overlays: a "Snap: on/off" pill sits directly on the canvas
  (top-left), not buried in the menu. Zoom +/− buttons top-right. A
  probe/readout box (live values) floats bottom-right; a legend (if any)
  floats bottom-left. Both dark, semi-transparent.

## Interactive controls

- **Add-object pattern** (charges, sources, etc.): a scrollable card list
  in the side panel, "+ Add [object]" button (capped at a sane max, e.g. 6),
  a delete (×) per card, click a card to select and expand its detail panel.
- **Sign-carrying magnitude stepper**: one bidirectional stepper (▲/▼) that
  can cross zero to flip sign — never two separate +/− object types or a
  separate sign toggle.
- **Show/hide vector toggles**: chip-style toggle buttons next to the
  relevant readout (e.g. a charge's position vector, separation vector).
- **Line-type legend**: indicate solid vs. dashed with a small line-swatch
  icon next to the label, not the word "(dashed)".
- **Numeric formatting**: route every live physics readout through the
  sim's scientific-notation helper (commonly named `fmtE`) so magnitudes
  switch to `×10ⁿ` form outside a normal range, and always show units next
  to the number — never a bare unitless value for a physical quantity.
- **Beta / incomplete features**: mark with a small amber warning box
  (`⚠`, `background:#fff8e1`, `border:#f2c94c`, `color:#8a6d1d`) directly in
  the controls for that mode, not just in a commit message or memory file.
- **Animated sims load paused.** Any sim with a running particle/animation
  (Lorentz-force, moving-charge sims, etc.) must start paused on load/reset,
  with a "▶ Run" button the student clicks to start it — never auto-play.
  (Fixed 2026-10-28 in `lorentz-force`: `reset()` was setting `running=true`.)
- **Per-embed mode/preset via URL query param.** A sim used in more than one
  context (e.g. a multi-mode sim embedded in different Preps) should read its
  initial mode/preset from the query string (`?mode=circle`) via a
  `componentDidMount(){ this.applyUrlState(); }` + `applyUrlState()` pair —
  the convention already used by the 3D sims (`discrete-current-builder-3d`,
  `magnetic-field-3d`, etc.) — so a given embed can open directly into the
  scenario it's actually testing instead of always showing the sim's generic
  default.

## Canvas label placement & readability

Set 2026-11-08 after a hands-on pass through ~10 sims (pendulum,
universal-gravitation, drop-and-toss, oscillation-explorer,
discrete-charge-builder-3d, field-superposition-explorer,
two-source-interference, magnetic-field-3d, ray-optics, circuit-lab,
equipotential-explorer) specifically stress-testing each with extreme
slider values, dragged-together objects, and multiple added
charges/sources — the states a student is most likely to land in by
accident. Found and fixed concrete label collisions in 5 sims (see the
commit "Label readability pass" around this date for the before/after).
Apply these rules to every sim going forward, and when revisiting an old
one, check it against this list.

- **A label anchored to a draggable/sizable object must float free of that
  object, not just its nominal center.** Don't position a label at a fixed
  offset from an object's *center* (`cy - 6`) when the object's on-screen
  radius varies with a slider (mass, charge count, zoom). Offset from the
  object's actual rendered edge (`cy - radius - 6`), and recompute every
  frame — this is what let `universal-gravitation`'s `M₁`/`M₂` labels drift
  into each other as the spheres' radii grew.
- **When two objects can be dragged or sliders can push them together,
  their labels need an explicit minimum on-screen gap, enforced
  independent of the objects' own positions.** Compute the pair's
  midpoint and clamp each label to at least `~17px` either side of it
  (`universal-gravitation`'s `M₁`/`M₂` fix) rather than placing each label
  purely relative to its own object — at small separation that naturally
  collapses the gap to zero.
- **A value readout or vector-tip label (arrow tip, probe dot, force
  arrow) must get a dark translucent backing rectangle, not bare fill
  text,** whenever it can land on top of a drawn curve, gridline, or
  another label — which is most of the time, since these labels move with
  live state. `rgba(15,23,34,0.72–0.78)` behind the text, sized to
  `ctx.measureText` + ~4–8px padding, is the pattern used in this pass
  (`field-superposition-explorer`'s `P` label, `magnetic-field-3d`'s
  `B = … µT` probe readout). This is cheap, has no layout side effects,
  and fixes the "text blends into the gridline number behind it" failure
  mode outright rather than trying to dodge it.
- **A label drawn directly against a background that's itself animated or
  textured (wave ripples, field-line fields) needs a stroke halo, not just
  a backing box** — `ctx.lineWidth=3; ctx.strokeStyle='rgba(15,23,34,0.8)';
  ctx.strokeText(...)` drawn immediately before the matching `fillText`
  (`two-source-interference`'s `S₁`/`S₂`). A solid backing rect reads as
  a UI chrome element; a halo reads as "the label itself," which is right
  for a label that sits inside the physics scene rather than overlaid on
  it.
- **3D axis tick labels need more clearance than a flat 2D sim's, because
  three independent axes can project into similar on-screen directions
  depending on orbit angle.** The existing per-axis tick offset (9px
  perpendicular to that axis) is too tight once a tick's own number is
  wider than the gap, and it gets worse when the labeled axis coincides
  with a drawn object (a line/ring charge distribution lying along an
  axis). Bumped to ~15px plus a stroke halo in `discrete-charge-builder-3d`
  — meaningfully better, but **does not fully solve** the harder case of
  two different axes' tick labels landing on each other near the origin at
  certain orbit angles. That needs real pairwise bounding-box collision
  checking across all three axes' ticks each frame (skip or nudge the
  loser) — not yet implemented anywhere; worth building once as a shared
  pattern rather than re-solving per 3D sim.
- **Don't let a plotted trace silently clip against the canvas edge when a
  slider's range exceeds the axis's fixed range.** Not a text-label bug,
  but the same "readability" failure in spirit: cranking `oscillation-explorer`'s
  amplitude to its slider max clips the sine curve flat against the top/bottom
  of the canvas instead of the axis rescaling, and the phasor-mode circle
  gets clipped off the left edge entirely. Either the axis range should
  scale to the live value, or the control's range should be clamped to what
  the fixed axis can actually show. Flagged, not yet fixed anywhere.
- **A minimum readable font size for canvas labels is ~10–11px** at this
  catalog's typical canvas size (~450×430 for a 2-panel sim). Several of
  the collisions found above involved 8.5–9px text (3D axis ticks); small
  text has near-zero margin for error once anything else is nearby.
  Prefer 10.5–11px for tick/reference labels and reserve anything smaller
  for truly secondary annotations.

- **Overlay buttons (zoom −/+/1:1) are part of the collision problem.**
  They are HTML positioned over the canvas, so the canvas code can't see
  them. Keep canvas captions out of the corner they sit in (bottom
  captions are left-aligned for this reason), put the buttons in the top
  corner when the bottom edge carries axis numbers (`center-of-mass`), and
  give the canvas column `align-self:flex-start` so a taller side panel
  can't stretch it and leave the buttons floating below the canvas
  (`lorentz-force`, `radiation-wiggling-charge`). Added 2026-11-10.
- **Read-outs anchored to a canvas edge use the live size** (`this._W-12`),
  never a literal from the design size (`354`), or they drift into the
  middle of the enlarged canvas.

## Visual polish (lighting/shading)

Set 2026-11-08, piloted on one sim from each of three different categories
(wave-explorer, mirror-ray-tracer, rail-flux-bar) before rolling out
catalog-wide, specifically so independent passes don't each invent their
own look. Use these exact patterns — don't freelance a different gradient
recipe per sim; the point is a consistent house style, not individually
"nice" one-offs that don't match each other.

- **Canvas background: a subtle radial vignette, not a flat fill.** Replace
  `ctx.fillStyle='#0f1722'; ctx.fillRect(0,0,W,H);` with:
  ```js
  const bgGrad=ctx.createRadialGradient(W/2,H*0.45,0,W/2,H*0.45,Math.max(W,H)*0.75);
  bgGrad.addColorStop(0,'#141f2c'); bgGrad.addColorStop(1,'#0a1119');
  ctx.fillStyle=bgGrad; ctx.fillRect(0,0,W,H);
  ```
  This is the single highest-value, lowest-risk change — it applies to
  almost every sim's canvas fill line regardless of what's drawn on top,
  costs one gradient object per frame, and has zero layout/collision side
  effects. Do this everywhere first, before anything else in this section.
- **The sim's one "hero" curve/trace gets a soft glow; everything else
  stays crisp.** For a wave/graph sim, the primary signal line (not axes,
  not secondary/ghost curves, not ray-tracing lines — see below):
  ```js
  ctx.save();
  ctx.strokeStyle=curveColor; ctx.shadowColor=curveColor; ctx.shadowBlur=9;
  // ...draw the path...
  ctx.stroke();
  ctx.restore();  // don't let the shadow leak into grid/label drawing after
  ```
  Judgment call: only the one curve that's "the point" of the sim gets
  this. A sim with multiple comparable curves (e.g. several basis
  functions overlaid) should leave all of them crisp rather than glow one
  arbitrarily.
- **Ray-tracing lines (`ray-optics`, `lens-ray-tracer`, `mirror-ray-tracer`)
  stay crisp — no glow.** Exact geometry and intersection points matter
  pedagogically; a glow blurs the thing the student is meant to read
  precisely. This is a deliberate exception to the rule above, not an
  oversight.
- **Elongated metal objects (a sliding bar, a rail, a rod)**: a linear
  gradient *across* the object's width (perpendicular to its length), not
  a flat fill, to read as a cylindrical metal cross-section:
  ```js
  const barGrad=ctx.createLinearGradient(cx-halfW,0,cx+halfW,0); // across the short axis
  barGrad.addColorStop(0,darkEdge); barGrad.addColorStop(0.4,brightHighlight);
  barGrad.addColorStop(0.55,baseColor); barGrad.addColorStop(1,darkEdge2);
  ctx.strokeStyle=barGrad; // or fillStyle for a filled shape
  ```
  (`rail-flux-bar`'s sliding bar: edge `#5a4aa8`/`#4a3c8c`, highlight
  `#cdbcff`, base `#9d8be6`.)
- **Curved reflective surfaces (mirrors) and lens bodies**: a linear
  gradient *along* the surface with a bright band at the midpoint, to read
  as a specular highlight running down a curved glass/metal surface:
  ```js
  const surfGrad=ctx.createLinearGradient(x0,y0,x1,y1); // along the surface's own extent
  surfGrad.addColorStop(0,lightTint); surfGrad.addColorStop(0.35,baseColor);
  surfGrad.addColorStop(0.5,brightHighlight); surfGrad.addColorStop(0.65,baseColor);
  surfGrad.addColorStop(1,darkTint);
  ```
  (`mirror-ray-tracer`'s arc: `#9db8f5`/`#5a7fd6`/`#d6e2ff`/`#5a7fd6`/`#42599e`.)
- **Round physical objects** (balls, planets, probe markers, pivots):
  already-established pattern from the earlier graphics-upgrade pass —
  multi-stop radial gradient + a small specular-highlight ellipse + a dark
  rim stroke. See `pendulum`/`universal-gravitation`/`drop-and-toss` for
  the reference implementation; this doesn't change, just keep applying it
  to remaining round objects as they're reached.
- **Two things this section explicitly does NOT touch**, per established
  convention: schematic circuit symbols (resistor zigzags, battery plates,
  wire lines — `circuit-lab` and its siblings stay flat, that's the
  correct convention for a circuit diagram, not an oversight) and abstract
  point-charge/particle glyphs (a light gradient + tiny highlight is fine,
  per the earlier electrostatics-family pass, but don't turn them into
  heavy glossy spheres — they're meant to read as symbols, not objects).

## 3D scenes (the G3 kit)

Set 2026-11-10. Every sim with a 3D-projected canvas draws through one
shared helper block, `G3`, inlined ahead of `class Component` between
`/* G3-KIT-BEGIN … G3-KIT-END */`. The source of truth is
`tools/g3-kit.js`; **never edit an inlined copy** — edit the kit, then run
`python3 tools/sim-script.py rekit` (and `check` to confirm every sim is in
sync). Sims on the kit: `discrete-charge-builder-3d`,
`discrete-current-builder-3d`, `magnetic-field-3d`, `moving-charge-field`,
`field-line-density-3d`, `faraday-induction`, `faraday-flux-explorer`,
`gauss-flux`, `gauss-applications`, `current-loop-motor`,
`polarization-malus`, and the 3D mode of `electrostatics-explorer` (+ its
two forks) and `field-superposition-explorer`.

Everything in the kit takes a projector `P(world{x,y,z}) → {x,y,d,s}`
(screen px, depth with larger = nearer the viewer, px per world unit), so
it works with each sim's own camera — perspective or orthographic.

- **Depth has to be readable without rotating.** Far things are dimmer and
  thinner than near things (`G3.tubeD`, `G3.seg`, `G3.near`), and anything
  that can pass behind something else is painter-sorted by `d` rather than
  drawn in a fixed order. A ring or coil seen edge-on must overlap itself
  correctly.
- **Reference frame = `G3.grid` + `G3.axes`, not hand-drawn axis lines.**
  The grid is a faint floor that fades with distance; the axes fade from
  the negative end to a bright positive end with a cone tip, and put tick
  numbers on round values only, dropping any that would collide or bunch
  up. Pass `box:{w,h}` so the tips stay inside the canvas, and
  `avoid:[{x,y,w,h},…]` (screen-space centre + size) for scene labels the
  tick numbers must keep clear of.
- **Vectors are `G3.arrow3`** (world → world): the cone head foreshortens,
  and an arrow pointing away from the viewer shows the cone's dark base, so
  toward/away is visible. Glow (`glow:`) only on the hero vector, as in
  the 2D rule above.
- **Solid objects are lit from the upper left**: `G3.sphere` for balls and
  charges, `G3.tube` for wires/rods, `G3.surface` for translucent discs,
  plates and Gaussian caps. Point charges stay light glyphs (small sphere +
  sign), not heavy glossy balls.
- **Every label on a 3D canvas goes through `G3.label`** (dark halo), since
  in 3D a label can end up over any line at some camera angle.
- **A bounded scene fills its canvas.** A scene with a natural size (one
  loop, one magnet, a ring of charges, an orbit) is authored for its
  design-size canvas and scaled by `G3.fit(w,h,w0,h0)` — or the 2D
  equivalent, a `_fs=W/W0` factor in the scene transform, as in
  `keplers-laws` — so the Bigger view actually gets bigger and a narrow
  phone canvas doesn't clip. Only genuinely unbounded scenes (2D field
  grids, the charge-placement planes) keep the older "wider canvas shows
  more scene" behaviour.

## Circuit Lab grid rules

- **Every component endpoint lands exactly on a grid point.** No node may
  sit at a fractional/off-grid position — this is what makes the generic
  collision, snapping, and connectivity logic (shared across every
  component type) actually sound.
- **No diagonal wires.** Every wire, resistor, battery, capacitor, etc.
  runs strictly horizontal or vertical between two grid points. The one
  explicit exception is the 2-position switch's own lever: its real body
  is a pole → pivot (horizontal) → lever (genuinely diagonal, still
  grid-point-to-grid-point) → contact (horizontal) path, so it alone is
  allowed to carry one real diagonal segment. Nothing else gets this
  exception — every other component stays axis-aligned end to end.

### Circuit Lab code

- **Source of truth is `tools/circuit-lab/src/`**, one class per concern
  (see the README there). Edit those files and run
  `sh tools/circuit-lab/build.sh`; never edit the bundle's script directly.
- **A kind of part is a class.** Everything that differs from part to part
  (shape, rotate/flip, electrical behaviour, value range, menu entry,
  share-link letter) lives in its `Element` subclass and its `Painter`. No
  `if (type === ...)` chains anywhere else.
- **A bug found by hand gets a test** in `tools/circuit-lab/test/t-fixes.js`
  before it is fixed.

### Circuit Lab behaviour (settled 2026-11-10; change deliberately)

- **Pointer**: click a part's body = select only. Click a terminal or a
  wire = voltage probe. A switch toggles only on its lever or contact
  rings. Drag from a grid dot or terminal = lay wire; drag a part = move it
  (its wires follow). A refused action says why on the canvas and a
  refused drop snaps back. Escape cancels a drag and closes any dialog.
- **Touch**: one finger does what the mouse does, with bigger hit targets
  and a 9 px tap tolerance. Two fingers pinch-zoom and pan; a second
  finger landing mid-drag cancels the drag.
- **Wheel**: zooms the canvas only when the sim is the whole page. Inside
  a frame (Moodle embed) the wheel scrolls the page; pinch or Ctrl/⌘+wheel
  zooms. Never trap page scroll.
- **View**: follows the circuit automatically (re-fits when a part leaves
  the canvas or lands under the zoom control) until the user zooms or
  pans; the fit button turns that back on. The board can't be dragged off
  the canvas. Fit never exceeds 100 % on the normal canvas.
- **Wires**: an auto-routed wire takes the elbow that fits, else goes
  round the part in the way, else is refused. It may end on the wire
  already leading to the point aimed at. Dropping an ammeter on a wire
  puts it in-line; deleting it closes the wire again. "Clean up circuit"
  straightens parts and includes the wire clean-up.
- **Rotate vs. Flip**: rotate changes layout only; Flip changes polarity /
  which way a part faces. Flip on a symmetric part (resistor) does nothing
  and records no undo step.
- **Undo** covers every layout edit including presets / New / Clear;
  arrow-key nudges of one part within 1.5 s are one step. What a part is
  doing right now (charge, switch position, meter trace) is not layout and
  is left alone by undo.
- **Time**: throwing a switch restarts the clock at t = 0 while the meter
  graph stays continuous (earlier time shows as negative t). Meters record
  all the time, so a graph opened mid-run shows the run from its start.
- **Labels**: never on a wire, never on the far side of another part,
  slide along the part before giving up; grid dots hide behind them. A new
  part is placed with a clear grid row/column around it.
- **Numbers**: currents in mA below 1 A (graph axis switches to A at
  1 A); worked examples quote currents in mA and τ to 3 figures; no preset
  or worked example may give a computed answer of exactly 1 (see
  `avoid-exactly-one` memory).
- **Hide-solution mode**: readings show "?", a hidden meter's graph trace
  and a capacitor's polarity marks are hidden too. The share dialog's
  "start hidden" box starts at the current mode and the link follows the
  box.

## Process conventions (how, not what)

- **Bundle editing**: sims are generated single-file bundles — extract,
  edit, re-splice, verify (JSON reparse, tag balance, `node --check`, zero
  literal `</`). See `sims-are-generated-bundles` memory. For script-only
  changes `tools/sim-script.py extract <slug>` / `apply <slug> <file.js>`
  does the extract, kit re-inline, syntax check, escaping and round-trip
  verification in one step. It cannot see pixels: always open the sim
  afterwards, with a fresh `?v=N` so the browser doesn't serve the old
  bundle. `circuit-lab` is the exception: its script is built from
  `tools/circuit-lab/src/` (see **Circuit Lab code** above).
- **Content audits**: Info-panel formulas + worked examples get hand
  fact-checked in passes; status tracked in `content-audit-status` memory,
  writeups in `docs/*.html`.
- **Pre-class vetting**: schedule-vs-course-map-vs-Moodle check on a
  Sun/Tue/Thu cadence; see `phys-prep-vetting-check` memory. Report-only —
  never edit `data/schedule.json` or write to Moodle without being asked.

## Monthly audit checklist

Run this against the sim catalog roughly once a month (or after a batch of
sim rebuilds). For each item, a repo-wide grep is usually enough to triage;
only open a sim to confirm before fixing.

- [ ] **`k` for Coulomb's constant** — grep every `<sim>/index.html` for a
  bare `k` used as a constant near `q`/`r` (e.g. `k·q`, `= k`, `kq`, `k*Q`).
  Distinguish from unrelated uses (e.g. spring constant `k`, loop index `k`,
  Boltzmann `k` if ever introduced — those are fine).
- [ ] **Vector notation** — grep for `\textbf{` or bold-styled vector
  letters in formula strings; should be `\vec{}` instead.
- [ ] **Dash vs. minus** — grep for an em-dash (`—`) immediately adjacent to
  `|...|` or a digit in question/prose text.
- [ ] **Light-panel/dark-header layout** — spot check 2–3 recently-touched
  sims visually; side panels should be light, only header+canvas dark.
- [ ] **Hamburger menu order** — confirm All sims → Info → Worked example →
  (Show on map) → Submit bug, in that order, on any sim touched since the
  last audit.
- [ ] **Units on live readouts** — spot check that every displayed physics
  quantity shows units, not a bare number.
- [ ] **Beta warnings** — confirm any explicitly-flagged incomplete feature
  still shows its warning (didn't get silently dropped in a later edit).
- [ ] **Label collisions under stress** — on 2–3 recently-touched sims, drag
  objects together / add the max number of charges-sources / crank a
  slider to its extreme, and check for labels landing on each other, on a
  drawn curve, or against a busy background per the **Canvas label
  placement & readability** rules above. Don't just eyeball the default
  state — the collisions found 2026-11-08 only showed up under deliberate
  stress (small separation, many sources, extreme amplitude).

Log what the audit found (even "nothing found") as a dated note in
`sim-conventions-doc` memory so the next audit knows the catalog's last
known-clean date.

## Known gaps (not yet fixed, don't re-discover these)

- Seen in the 2026-11-10 graphics pass and left alone (small, or needs a
  decision): `mirror-ray-tracer` "C" and "object" labels run together when
  the object sits near C; `magnetic-field-of-currents` edge tick "16" is
  clipped; `thin-film-interference` legend overlaps the plot curve;
  `rail-flux-bar` "B_ind ⊗ in" label sits on the top rail; `rc-charging`
  τ labels crowd the axes; `relative-velocity` vector labels still crowd
  when the vectors are nearly parallel; `lorentz-force` energy read-out
  box touches the first E-field arrow; `electroscope` is the plainest sim
  in the catalog (its replacement is Charged Objects Explorer);
  `pe-vs-separation` formula hints still write `k q₁q₂ / r` (see the
  Coulomb's-constant rule under Notation).

- `written-hw-1-solutions.pdf` / `written-hw-2-solutions.pdf` use `K`
  throughout (pre-existing, uploaded PDFs, no LaTeX source in the repo).
  Flag to Seth rather than silently rewriting — reconstructing a solution
  set from a flat PDF is a bigger job than a symbol swap.
