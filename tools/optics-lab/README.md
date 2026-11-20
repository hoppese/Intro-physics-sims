# Optics Lab sources

`optics-lab/index.html` is a generated bundle. Its page markup is
`markup.html` and its script is the files in `src/` joined in filename order.
**Edit the files here, never the bundle**, then run from the repo root:

    tools/optics-lab/build.sh        # tests, then write the markup and the script into the bundle
    tools/optics-lab/build.sh test   # tests only

If a test suite fails, nothing is rebuilt. Afterwards open
`optics-lab/?v=<new number>` in a browser: the tests do not see pixels, and
the browser caches the bundle hard.

`markup.py --create` made the bundle in the first place by copying Circuit
Lab's (same fonts, React, KaTeX and runtime) and swapping in this page.

## What lives where

| File | Classes | Job |
| --- | --- | --- |
| `10-math.js` | `V`, `Angle`, `Spectrum`, `Glass`, `Fmt` | Vectors, degrees, wavelength → colour, the index of a glass at a wavelength, number formatting (true minus). |
| `20-elements.js` | `Element` → `Source` (`Laser`, `Beam`, `Lamp`, `Figure`), `Lens`, `Mirror`, `Solid` (`Prism`, `Block`, `HalfDisc`), `Screen`; `ELEMENTS`, `ADD_MENU`, `BOARD` | Everything that can stand on the bench: its settings (with limits), its outline, and what it does to a ray. |
| `30-scene.js` | `Scene` | The elements plus the View switches and the Real / Chromatic switches; names ("Lens 2"); snapshot / restore; encode / decode for share links. |
| `40-tracer.js` | `Tracer`, `Imager` | Follows every ray to the edge of the bench; finds where bundles cross or seem to come from. |
| `45-presets.js` | `PRESETS` | The fourteen ready-made benches. |
| `50-view-history.js` | `History`, `View` | Undo / redo snapshots; the pan-zoom window. |
| `52-measure.js` | `Measure` | The tape measure and the angle tool: not part of the scene (not saved, undone or shared); picked lines are let go when the bench changes. |
| `55-renderer.js` | `Renderer` | Paints the bench; places every label where it crosses the least light and no other label. |
| `60-workbench.js` | `Workbench` | Every change to the bench (add, copy, move, turn, type, preset, undo) and the traced result. |
| `62-gestures.js` | `PointerTool` | What a press, drag, pinch and release mean. |
| `64-share.js` | `ShareLink` | `?lab=…`, `?preset=…`, `&hide=1`. |
| `70-panel.js` | `UI`, `Panel` | Everything the toolbar, side panel and overlays show. |
| `80-component.js` | `Component` | The page controller: DOM events in, Renderer and Panel out. Not covered by the node tests. |

Nothing in files 10–50 touches the canvas or the DOM, which is what lets
`test/` run them under plain node.

## The model

- Lengths are centimetres, angles degrees counter-clockwise from +x,
  wavelengths nanometres. The bench is `BOARD` (320 × 220 cm).
- **Two switches for the whole bench** (`Scene.OPTS.real`, `.chroma`; the
  Real and Chromatic checkboxes beside New; both off to start). An element
  reads them through `el.scene`, which `Scene.add` sets; an element on no
  bench is ideal.
- **Lens**: ideal, a thin lens: every ray obeys 1/s + 1/s′ = 1/f however far
  it is from the axis. With *Real*, a symmetric biconvex / biconcave piece of
  glass refracting by Snell's law at both faces; the radius is found by
  bisection on the thick-lens formulas so that paraxial rays focus exactly f
  from the lens's middle (so F means the same in both modes), and the
  height is kept unless the faces would meet (half-height ≤ 0.9 R); a strong,
  tall lens is thick, and light near its rim is totally internally reflected. With *Chromatic*, the glass
  disperses: an ideal lens uses f(λ) = f (n − 1)/(n(λ) − 1), a real one n(λ)
  in Snell's law; f is quoted at 589 nm. The lens's Index n shows only when
  Real or Chromatic is on, its Dispersion only with Chromatic.
- **Mirror**: flat, or curved. A curved mirror is *ideal* (obeys the mirror
  equation everywhere) or, with *Real*, a true circular arc with spherical
  aberration. Mirrors have no chromatic aberration. The back absorbs.
- **Object** (`Figure`): an arrow, tree or dog standing on its foot (the
  element's position). Light leaves its tip: the three principal rays for the
  nearest lens or curved mirror it faces, or a fan if there is none (or by
  choice). Three unseen *ghost* rays from the foot (`result.ghosts`, never drawn
  or counted) let the Imager find the foot's image too; the image is drawn as
  the same picture from foot′ to tip′, turned for an even number of reflections
  and mirrored for an odd number.
- **Glass** (`Prism`, `Block`, `HalfDisc`): Snell's law at every face, total
  internal reflection past the critical angle. The index is
  n(λ) = n + B (1/λ² − 1/0.589²) with λ in micrometres; `n` is the "Index n"
  setting (its value at 589 nm) and `B` the "Dispersion" setting. B = 0 gives
  a glass with no dispersion (used by the `snell` and `tir` presets so a hand
  calculation matches whatever the colour).
- **White light** is traced as a handful of wavelengths; the angles shown are
  for yellow (589 nm).
- **Partial reflections** (View menu) use the Fresnel equations for
  unpolarised light and are dropped below `Tracer.I_MIN`.
- **Images** (`Imager`): for each point source, parallel beam or object (tip and foot), after each
  element its rays meet, the bundle is tested for a common point. Rays that
  really cross there give a real image; rays that only seem to come from there
  give a virtual one. If the bundle has no common point (aberration, a prism)
  no image is reported. s, s′ and m are measured along the element's axis in
  Knight's sign convention, from the middle of a real lens; the object of a
  real lens is what the light came from before its first face.
- Limits: 24 elements (`Scene.MAX`), 80 surfaces per ray, 12 000 segments.

## Tests

| Suite | Covers |
| --- | --- |
| `t-tracer.js` | Snell's law, the critical angle, the thin-lens and mirror equations, dispersion order, prism minimum deviation, energy in partial reflections, image finding, real lenses (shape, paraxial focus, aberration), chromatic focal shift, objects (principal rays, foot images, parity). |
| `t-scene.js` | Settings and their limits, naming, snapshot / restore, encode / decode round trips, bad share links. |
| `t-presets.js` | Every preset loads, traces, and gives the numbers its note promises. |
| `t-bench.js` | Add, copy, move, turn, type, undo / redo, the pointer tool, the view, label geometry, the Real / Chromatic switches, the tape measure and the angle tool. |

Add a check to the matching suite before fixing a bug found by hand.

## What the page tells its host

`window.simState` and `window.simAPI` (`get`, `preset(key)`, `hideValues(on)`,
`share()`), plus a `sim-state` `postMessage` to a parent frame, as in the
other sims. `?big=1` enlarges the canvas.
