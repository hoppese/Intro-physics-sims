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
  Settled in the 2026-11-11 catalog pass:
  - The button reads exactly **"▶ Run"** and **"❚❚ Pause"** (one space), in
    every sim including Circuit Lab. Not Play, Start, or Go. A button that
    performs one named action keeps its verb (Charge, Discharge, Release,
    "Bring in q₃").
  - Paused means a frozen frame of the same scene, not a blank or a
    different view. Reset returns to that paused frame.
  - Dragging an object and letting go may start the motion (a pendulum bob,
    a dipole): the student has asked for it.
  - Check it by script, not by eye: load, hash the canvas twice (must
    match), click Run (label flips, canvas changes), click Reset (label
    back, canvas still).
- **A hidden-values problem hides the answer everywhere.** When "Random
  problem" hides a result in the panel, the canvas must not print the same
  number in a read-out or label (`rail-flux-bar` did).
- **A zero reads "0 unit"** ("0 J"), never "0.00×10⁰ J" or "−0.0 mJ".
- **Number, space, unit** ("+10 A", "5.0 cm"); the degree sign is the only
  unit that touches its number.
- **No e-notation anywhere a student reads** ("5.2e-3"). Use ×10ⁿ, or an
  SI prefix (mJ, µT), or a scaled axis title ("U (×10⁻⁶ J)") for a column
  of ticks.
- **URL parameters are clamped** to the same range as the control they set,
  so a bad link cannot open a state the controls could never reach.
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
- **Canvas text has a size floor; see "Canvas text and symbol sizes" below.**
  Several of the collisions found above involved 8.5–9px text (3D axis
  ticks); small text has near-zero margin for error once anything else is
  nearby.

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

Added in the 2026-11-11 catalog pass:

- **Labels have a pecking order, and the lower one gives way.** Scene
  labels and the head read-out stay put; axis names and tick numbers are
  skipped (not nudged) wherever they would touch a scene label, a mark, a
  drawn boundary or the head read-out (`tickFree` in `ampere-loop`; the
  ring ticks in `gauss-applications`; the top y tick and the x-axis name in
  `electrostatics-explorer`). A missing tick number costs nothing; two
  numbers printed on top of each other cost both.
- **Draw a label after everything that could cover it.** Collect labels
  while drawing the scene and paint them last (`pairLabels` in
  `assembling-charges`, which used to be painted under the charges).
- **A label that belongs to a line clears its own line**, by half its box
  along the normal plus 3 px, on the side facing away from the rest of the
  group. When several are placed, test each candidate against the boxes of
  every object, every object name and every label already placed, and take
  the first that is free.
- **A label next to an object chooses its side.** Try below, above, right,
  left and score each by clearance from the boundary, the other objects and
  the labels already placed (`wireLabels` in `ampere-loop`). A fixed
  "always below" is how a label ends up straddling the Amperian loop.
- **Distances between collinear objects are dimension brackets**, stacked
  with the shortest span nearest the objects. Labels at the midpoints of
  overlapping spans cannot be told apart.
- **Subscripts are real subscripts.** On canvas use the Unicode subscript
  (q₁, I₂) or a smaller offset glyph; never a full-size digit ("q1") or an
  underscore.
- **The default state of every scene is drawn clean.** No conductor, mark
  or label sits on a boundary the student is about to count against
  (`ampere-loop` now has a default loop per scene for this reason).

## Canvas text and symbol sizes

Written 2026-11-11 after `faraday-flux-explorer`'s into-the-page marks and
its "B into page" label turned out too small and too heavy to read. Sizes
are CSS px at the catalog's base canvas (about 450 × 430). On an enlarged
canvas multiply by the sim's label scale (`LK`, the clamped square root of
`G3.fit`), so text grows with the canvas but more slowly than the scene.

| Role | Size | Weight / colour |
|---|---|---|
| Head read-out (the one number the canvas is about: "12 field lines through loop") | 13 px | bold, white at ≥ 0.9 alpha |
| Label that names something in the scene (a field, a vector, an object, with its value) | 13 px mono, or 14–15 px italic serif for a symbol letter | 600; the object's own colour, lightened until it reads on the dark canvas |
| Caption or hint ("drag edges to resize", "flux steady → no induced current") | 12 px | 500; ≥ 0.65 alpha |
| Axis tick and reference numbers | 11 px (10.5 at the least) | regular; ≥ 0.6 alpha |
| Anything smaller than 10.5 px | not used | |

- **Nothing a student is meant to read is dimmer than 0.65 alpha.** Dimming
  is for context (grid lines, marks outside the region of interest), never
  for words. The label that failed was 11 px at 0.75 alpha in a mid-tone
  colour: each choice was defensible, the product was not.
- **A caption that has to sit over a pattern** (a lattice of field marks, a
  grid, field lines) goes on a dark plate (`rgba(10,17,25,0.86)`, rounded)
  or gets the `G3.label` halo. Never bare text over marks.
- **Text anchored to opposite corners must not be able to meet.** Measure
  both; when the canvas is too narrow, shorten the less important one
  (drop the value in brackets) and never let them overlap.
- **A sign drawn inside a charge dot is a mark, not text**, and is sized to
  the dot (the `bold 9px` "+" / "−" in `gauss-applications`' small dots is
  the one size under 10.5 px left in the catalog, on purpose).
- **Ticks on a small inset graph** may use the 10.5 px floor; ticks on the
  main scene use 11 px.
- The whole catalog was brought to this table on 2026-11-11. A new grep hit
  under 10.5 px is a regression, not a leftover.

### Into / out of the page (⊗ and ⊙)

- **Draw them with `G3.pageMark(ctx, x, y, r, col, {out, alpha, lw})`; never
  type the ⊗ / ⊙ glyph into canvas text.** The font glyph is as tall as a
  lower-case letter (about 6 px in an 11 px font) with a cross the same
  weight as its ring, which is exactly the blob the user could not read.
- **Size by the ring radius. r ≥ 5.5 px** (11 px across) for any mark that
  is counted or read; 6–6.5 px for the single mark inside a text label.
- **Stroke = r / 4**, never more than r / 3.5. Making a mark bigger and its
  line heavier in the same step gets nowhere: what makes it legible is the
  open space between the ring and the cross. The cross arms stop short of
  the ring (0.48 r along each axis), and the ⊙ dot is 0.3 r.
- **The same shape for every mark of the same field.** Marks that matter
  (inside the loop) are bright; the rest are the same ⊗ at about 0.4 alpha
  and a slightly thinner line, not a different, smaller symbol. A bare
  small ring says "nothing here", not "the same field, outside".
- **Marks keep ≥ 2.2 r between centres** at the densest setting; if the
  densest setting cannot afford that, lower the density constant, not the
  mark size.
- **Exception: a wire drawn in cross-section.** The large disc that *is*
  the conductor (R ≈ 12 in `ampere-loop` and `magnetic-field-of-currents`)
  and the torque glyph in `dipole-field-and-torque` (R = 9) keep their own
  drawing, with the dot or cross inside at the same proportions. Small
  repeated marks (solenoid turns, field lattices) always use `G3.pageMark`.
- **Marks whose size encodes strength** (the B marks in
  `radiation-wiggling-charge`) never fade below 0.4 alpha.

### Field marks and a boundary: always clearly in or out

When marks are counted against a boundary (field lines through a loop,
charges inside a Gaussian surface):

- **No mark is ever drawn on the boundary.** Keep every mark's centre at
  least `r + stroke/2 + wire/2 + 2 px` from the wire's centre line.
- **Pick the lattice phase so the default state needs no adjustment**
  (`faraday-flux-explorer`: columns half a spacing either side of the
  loop's centre, rows through it, so a 10 × 8 cm loop at 60 mT has all four
  wires mid-gap).
- **For every other state, move the offending row or column, on the side it
  really is on, and let its neighbours follow** by 2/3 and 1/3 so the
  spacing stays close to even (`clearMap` in that sim). Move whole rows and
  columns, not single marks, so the lattice stays a lattice.
- **The count and the picture come from one function.** In that sim they
  were two loops with different origins, and the canvas said 16 over a
  picture of 15.
- Stress-check by brute force over every reachable setting, not by eye:
  the default looked fine for weeks because nobody tried 60 mT with a
  10 cm loop until it became the default.

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
  equivalent, a `_fs=min(W/W0, H/H0)` factor in the scene transform, as in
  `keplers-laws` — so the Bigger view actually gets bigger and a narrow
  phone canvas doesn't clip. Only genuinely unbounded scenes (2D field
  grids, the charge-placement planes) keep the older "wider canvas shows
  more scene" behaviour.
- **A canvas is never stretched.** The resize handle can give a
  `data-ob-responsive` canvas any shape, so its drawing buffer is sized from
  the canvas's real width *and* height (`getBoundingClientRect` /
  `clientWidth` + `clientHeight`), never from the width and a fixed aspect
  ratio, and the scene is scaled by one factor and centred in the room left
  over. A layout with a smallest drawable size does not clamp the buffer to
  that size (that squashes the picture when the canvas is smaller): it
  shrinks everything by one factor `k=min(1, w/minW, h/minH)` in the
  context transform, as in `rc-charging`. Check: after dragging the handle
  to a wide, short shape, `canvas.width/canvas.height` must equal the
  canvas's on-screen width/height — text is the first thing to look wrong.

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
- **A variant is the same sources plus one small file.**
  `tools/circuit-lab/variants/<name>.js` is read in just before the page
  controller and `build.sh` writes `circuit-lab-<name>/`. Never fork the
  bundle: a variant's markup is the main page's (bindings the main sim
  leaves empty). See `docs/circuit-lab-variants.md`.

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
  and records no undo step. A rotation is always a quarter turn about the
  part's middle, the way the button's arrow points: `r` or ↻ clockwise,
  Shift+`R` or ↺ counter-clockwise, and four of either come back to the
  start. The turn is shown (a 260 ms eased swing); a turn that cannot be
  made says why, and the part starts the way it was asked and falls back.
  No motion when the reader has asked for reduced motion.
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
- **Numbers**: a resistor runs from 0.5 Ω to 100 kΩ (new one: 1 kΩ) and
  is labelled in kΩ from 1000 Ω up. The DC and RC presets and their worked
  examples use kΩ and mA (`realistic-circuit-numbers` memory); RL, RLC and
  the internal-resistance examples keep a few ohms, which is what gives a
  watchable τ. Currents show to 3 figures in µA, mA or A, and the graph's
  current axis picks the same unit from its largest value. Worked examples
  quote τ to 3 figures; no preset or worked example may give a computed
  answer of exactly 1 (see `avoid-exactly-one` memory).
- **Graph**: the meter graph docks along the bottom of the canvas (the
  circuit refits above it), never in the side panel: the panel must not
  grow taller than the canvas, or a Moodle embed gets a scrollbar. Clicking
  the graph or its ⤢ button enlarges it over the canvas; click, ✕ or Escape
  brings it back. Enlarged, it carries a chip for each switch so a transient
  can be started without leaving it, and hovering reads off the traces.
- **Info overlay**: scrolls inside its own card. Its "Learn more" block is
  generated from `data/topics.json` (`tools/apply-learn-more.py`).
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

- **Patching a bundle: print the slice before anchoring on it.** A sim's
  script may hold a character as itself (`−`) or as an escape (`\u2212`),
  and the form can change after `sim-script.py` rewrites the bundle. An
  exact-string patch written from memory fails on the second run.
- **Screenshot checks need a cache-buster that no sim reads.** Use `_cb=`;
  `v=` is a real parameter in several sims.

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
- [ ] **Canvas text and symbol sizes** — grep the sim scripts for
  `font='` sizes under 10.5 px and for a typed `⊗` / `⊙` / `\u2297` /
  `\u2299` in canvas text (outside the kit's own comment); check any hit
  against **Canvas text and symbol sizes** above.
- [ ] **Run / Pause** — every sim with a Run button loads still, starts on
  "▶ Run", reads "❚❚ Pause" while running, and is still again after Reset
  (script it: hash the canvas before and after each click).
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

Rewritten after the 2026-11-11 catalog pass. Everything in the earlier
list was fixed in that pass except the entries repeated here.

Seen and left alone (small, or needs a decision from Seth):

- `faraday-induction` and `circuit-lab-probe` still **auto-run on load**.
  `faraday-induction` was held because Prep 27 (due 2026-11-13) tells
  students to "press Reset and let the magnet run"; change it after that
  prep closes. The Probe variant auto-runs by design; undecided.
- `rc-charging`: the Run / Pause button reads "❚❚ Pause" on load although
  nothing moves until Charge is pressed; its τ labels still crowd the axes.
- **No "Random problem"**: `circuit-lab`, `circuit-lab-probe`,
  `e-fields-conductors-and-insulators`, `magnetic-field-3d`,
  `radiation-wiggling-charge`. **No "Worked example"**: `magnetic-field-3d`.
- **Hyphen for a negative number** in several result pills ("-2.25 J",
  "-339 N·m²/C") where other sims use a true minus ("−"). No rule yet.
- `gauss-applications`: the "r = 10.0" label sits close to the E arrow tip.
- `gauss-flux`: the "+3 nC" label is touched by the surface arrowheads.
- `relative-velocity`: "current →" markers are still drawn when the river
  speed is 0.
- `thin-film-interference`: the "iridescent color" swatch is an odd blob.
- `electrostatics-explorer`: the q₁ value label sits on the x axis; the
  bottom tick "−40" is clipped by the canvas edge.
- `dipole-field-and-torque`: unit labels read "×0.1 T" / "×0.1 A·m²".
- `assembling-charges`: the frame is fixed for d = 12, so charges overlap
  at small d; the "▶ Bring in q₃" button wraps to two lines.
- `wave-explorer`, `oscillation-explorer`, `interference-explorer` redraw
  through `forceUpdate` every 0.12 s rather than every frame (choppier than
  the rest, and nearly invisible to a headless check).
- `circuit-builder` canvas is not device-pixel-ratio scaled; several sims'
  `applyUrlState` still accept unclamped values (only `rail-flux-bar` was
  clamped).
- `kinetic-theory-speeds`: upper canvas is blank in headless Chrome; not
  yet confirmed in a real browser.
- `electroscope` is the plainest sim in the catalog (its replacement is
  Charged Objects Explorer).
- Shell differences never audited: the mechanics sims' "↗ Share link" menu
  row and their `big`-mode "Tools & help" dark sidebar; card widths differ
  between families; `electrostatics-explorer` nests a card in a card; the
  Circuit Lab family has its own toolbar and extra menu rows.
- Hand-authored pages (`charged-objects-explorer`, `circuit-lab-scope`,
  `master-schedule`, `math-practice/*`) are not bundles and were not
  audited against this doc.
- `prep26.xml` embeds `rail-flux-bar` at height 560; the card is about
  490 px tall at an 800 px wrapper (gray band below). Prep already closed.

- `written-hw-1-solutions.pdf` / `written-hw-2-solutions.pdf` use `K`
  throughout (pre-existing, uploaded PDFs, no LaTeX source in the repo).
  Flag to Seth rather than silently rewriting — reconstructing a solution
  set from a flat PDF is a bigger job than a symbol swap.
