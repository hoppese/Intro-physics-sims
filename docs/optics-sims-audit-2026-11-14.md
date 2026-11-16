# Optics and wave sims: audit of 2026-11-14

Scope: every sim the schedule uses from Nov 18 to the end of the semester, plus the
two interference sims and thin-film that sit beside them.

| Sim | Used | Notes |
|---|---|---|
| `ray-optics` (Refraction, TIR & Dispersion) | Wed Nov 18 | Prep 28 embeds it |
| `lens-ray-tracer` | Fri Nov 20 | Prep 29 embeds it |
| `mirror-ray-tracer` | Mon Nov 30 | |
| `diffraction-pattern` | Wed Dec 2, Fri Dec 4 | single, double and grating modes |
| `polarization-malus` | Mon Dec 7 | |
| `two-source-interference`, `interference-explorer` | topic "Interference" | the schedule's Dec 2 note says the diffraction sim "extends the interference sim" |
| `thin-film-interference` | not on the schedule | still Beta |

How it was done: a scripted pass over each sim's script against `docs/CONVENTIONS.md`
(font floor, typed ⊗/⊙, e-notation, URL presets, menu order, Run/Pause, resize), then
hands-on in a browser: default state, every mode, extreme sliders, `?big=1`, and the
states a student reaches by accident (object at the focal point, image off the canvas,
equal indices, TIR, 21-slit grating at the minimum spacing).

Status tags: **DONE** means changed and committed in `5098370` (local, not yet pushed
when this was written); **PROPOSED** means not touched.

---

## What the semester's changes have in common

I read the ~530 commits since Aug 15 (keyword counts are approximate) and the
conventions doc. The same seven things keep coming back, and they are the lens for the
recommendations below.

1. **Labels and marks colliding or unreadable** (about 36 commits): overlaps under
   stress, text on top of rays, tiny glyphs. Each sim got fixed only after someone
   pushed a slider to an extreme.
2. **Canvas that stretches, clips, or lets something drift off the edge** (about 11):
   fixed text size, never-stretch buffers, "a bounded scene fills its canvas", the
   Faraday EMF that ran off the right side so it "looks like it's delayed".
3. **Direction and orientation made explicit** (about 19 toggles and switches): which
   pole faces the coil, the reflected-ray switch, CW/CCW arrows, the θ₂ arc on the wrong
   side of the normal. A sim that makes the student infer a sign usually gets a visible
   marker added later.
4. **Controls that fight the student** (about 11): typeable values, hold-to-repeat
   steppers, a stepper that could not cross zero, an angle stepper with no bound, a
   Pause label stuck on, controls that collapse under the canvas.
5. **Opening in the wrong state**: animated sims that auto-ran, defaults that hid the
   point (the Lorentz default E that made the selector balance unreachable). This
   produced the `?mode=` URL-preset convention so an embed opens on the question's
   scenario.
6. **The sim does not show what the lecture or the prep question says it will**: Prep 29's
   "cover half the lens", the dipole lines emphasised for the flux point, the missing
   mass control. Several fixes were triggered by writing the question first.
7. **Physics or bookkeeping slips found by checking one more case**: flux keyed to the
   wrong magnet edge, a count that disagreed with the picture, a hidden value printed on
   the canvas.

Two process facts also matter: fixes for one sim usually had to be repeated in its
siblings, and the repo has no shared kit for 2D optics the way `G3` serves the 3D sims.

---

## ray-optics (Refraction, TIR & Dispersion)

1. **Dispersion cannot be seen** (PROPOSED, the biggest item before Wed Nov 18). The
   dispersion mode is a single flat interface with n from 1.50 to 1.53, so at 30° the
   red and violet rays differ by 0.40° and draw as one purple line. The Nov 18 plan says
   "send white light through a prism", and the sim has no prism. Add a prism (apex angle
   slider, two refractions) or, at the least, an "exaggerate spread" switch that says it
   is exaggerated. The read-outs must stay truthful.
2. **URL presets** (DONE): `?mode=refract|dispersion&n1=&n2=&theta=&refl=1`, clamped to
   the controls' ranges, so Prep 28 can open on its own scenario.
3. **Show the critical angle on the canvas** (PROPOSED). The exercise is "drag the ray
   across the critical angle"; today θc appears only in a pill. A faint marker or arc at
   θc (when n₁ > n₂) would make the crossing visible, in line with the
   direction-made-explicit theme.
4. **No "Learn more" block** (PROPOSED): `topics.json` has no optics topics at all, so
   none of the six optics sims has the OpenStax and video links the other 26 sims have.
   See the cross-cutting list.
5. **Typesetting and conventions** (PROPOSED, small): θ_red and θ_violet set the words
   as italic math letters; the n₂ label reads "1.50-1.53" with a hyphen where the
   convention wants a range dash; n₁ is fixed at 1.00 in dispersion mode, so the glass
   cannot be changed (crown, flint, water would show why a diamond sparkles).

## lens-ray-tracer

1. **The ± steppers were stuck at s = f and s = 2f** (DONE). The snap tolerance (0.6 cm)
   was bigger than one step (0.5 cm), so stepping 8.5 snapped back to 8.0. A student who
   landed on the focal length could not leave it with the buttons. Steps no longer snap.
2. **s = f read "Real, inverted"** (DONE). It now reads "No image (rays parallel)", the
   image distance "none (at infinity)" and the magnification "—".
3. **An image off the canvas was silently missing** (DONE). With s = 9 and f = 8 the
   image is 72 cm away and nothing was drawn. A note at the edge now says "real image at
   s′ = 72.0 cm (off screen) →"; it withholds the number while a problem's values are
   hidden.
4. **URL presets** (DONE): `?type=converging|diverging&s=&f=&h=`, clamped.
5. **Only two of the three principal rays are drawn** (DONE 2026-11-16: violet focal ray, meets the other two at the image tip). The sim draws the ray
   parallel to the axis and the ray through the lens center; the Final asks students to
   "draw all three of the primary rays". Add the ray through the near focal point, with a
   per-ray show/hide so the sim can be used for predict-then-check. Cosmetic carry-over:
   the "virtual image" label overlaps a ray in diverging mode.

## mirror-ray-tracer

1. **Steppers stuck at s = f and s = C** (DONE), same bug and same fix as the lens.
2. **s = f read "Real, inverted"** (DONE), same fix.
3. **Image off the canvas** (DONE). At s = 9.5 and f = 9 the image is at 171 cm; the
   note now says so. A virtual image behind the mirror that falls off the right edge is
   handled by the same note.
4. **URL presets** (DONE): `?type=concave|convex&s=&f=&h=`.
5. **Third principal ray and a cluttered convex view** (third ray DONE 2026-11-16; convex clutter still PROPOSED). Only two rays are
   drawn (parallel to the axis, and to the vertex); the ray aimed at C, which reflects
   back on itself, is the third. Convex mirror with small s puts "object", "virtual" and
   three dashed rays within a few pixels; give those labels the dark backing plate the
   conventions ask for. Lens and mirror are about 90% the same code and every fix above
   had to be written twice: a shared 2D ray-tracing kit would stop that.

## diffraction-pattern

1. **The screen distance is hidden** (PROPOSED). "Fringe spacing 27.50 mm" only works if
   L = 1.00 m, and L appears nowhere. Show L as a control or at least in the read-out
   ("at L = 1.00 m"), and put a millimetre scale on the screen strip.
2. **Units change between modes** (PROPOSED). Single slit reports "central width
   137.50 mrad"; double and grating report millimetres. Pick one pair (angle and
   position) for all three. The "pattern: narrower slit → wider" pill is a sentence where
   every other result is a number.
3. **The grating mode stops short of Fri Dec 4** (PROPOSED). The lecture is "gratings and
   resolution": there is no grating-equation read-out for higher orders (lines per mm,
   largest order), no resolving power R = mN, and no second wavelength to resolve.
4. **URL presets** (DONE): `?slits=single|double|grating&lam=&d=&w=&N=`, clamped.
5. **Axis and legend** (PROPOSED). The intensity axis has no scale (add I/I₀ ticks), and
   the dashed single-slit envelope on the double-slit view is unexplained (a line-swatch
   legend entry, per the legend convention).

## polarization-malus

1. **URL presets** (DONE): `?count=2|3&a1=&a2=&a3=`, clamped to 0–180°.
2. **Open the three-polarizer view on the classic case** (PROPOSED). It opens at
   0° / 30° / 60° (28%). The surprising result is 0° / 45° / 90°, which passes 12.5% where
   two crossed filters pass nothing; give it a one-click preset and make it what
   `?count=3` shows by default.
3. **Dec 7 also covers EM-wave structure** (PROPOSED). The wave is drawn but there is no
   B field, and no case with an already-polarized input or reflection. The Radiation
   plane-wave sim's E and B switches are the model to copy.
4. **No "Learn more" block** (PROPOSED), as above.
5. **Canvas tags** (PROPOSED, small): "unpolarized" sits on the incoming ray fan and the
   axis tags use "@" ("2nd @ 30°"); a backing plate and "at" would match the label rules.

## two-source-interference

1. **Enlarged view squashes the screen strip** (PROPOSED). With `?big=1` the strip's
   buffer is 760 × 112 but it displays at 380 × 43, so it is drawn at the wrong aspect.
   The never-stretch rule asks for the buffer to follow the element's real width and
   height.
2. **No URL presets** (PROPOSED): it has `lam`, `d`, `L`, `px`, `py`, `phase` and `mode`
   in its state and none can be set from a link.
3. **A bridge from ripple tank to light** (PROPOSED). Wavelength is 5 cm. A "light"
   preset (550 nm, 0.20 mm, 1.0 m) would connect it to the double-slit numbers students
   meet on Dec 2.
4. **Not verified hands-on** (flagged, not a finding): redraw runs through
   `forceUpdate`, which the conventions already list as choppy in three siblings.
5. Info panel and "Learn more" are present and correct; keep it as the reference for
   adding them to the others.

## interference-explorer

1. **No URL presets** (PROPOSED): amplitude, wavelength and wave shape cannot be set from
   a link.
2. **Redraws every 0.12 s through `forceUpdate`** (known gap, PROPOSED): choppy next to
   the other sims; the conventions already flag it.
3. **No probe** (PROPOSED): a readout of y₁, y₂ and their sum at a chosen x, with a
   constructive/destructive label, would tie the plot to the vocabulary used on the
   quizzes.
4. **No presets for the named cases** (PROPOSED): equal and opposite waves (standing
   wave), and two close wavelengths (beats), as one-click buttons.
5. **Not verified hands-on:** extreme amplitude against the fixed axis, which the
   conventions flag as clipping in `oscillation-explorer`; check it here too.

## thin-film-interference

1. **Still carries a BETA badge** (PROPOSED). The badge was dropped from the sims that
   finished their rebuilds; either finish and remove it or add the amber warning box the
   conventions call for where the feature is incomplete.
2. **The "iridescent color" swatch is an odd clipped shape** (known gap, PROPOSED). Draw it
   as a plain rounded strip with the colour name beside it.
3. **Height and gray space** (PROPOSED). The card is taller than the others (about 900 px:
   the two-column area plus the wave picture); measure it before it is embedded anywhere.
4. **No URL presets and no Learn more** (PROPOSED).
5. **Not on the schedule** (flagged): if it is wanted for Dec 2 or Dec 4, add it to the
   schedule's sims list and to a topic; otherwise leave it.

---

## Cross-cutting recommendations

- **Optics topics for `data/topics.json`** (PROPOSED). Add `geometric-optics-refraction`,
  `thin-lenses`, `mirrors`, `diffraction`, `polarization` with `sim_readings` and the
  OpenStax links, then insert the Learn-more placeholder into each sim's Info panel and
  run `tools/apply-learn-more.py`. Only 26 of 64 sims have the block and none of the
  optics sims do. List only vetted videos (the schedule's optics videos are all still
  `unv`).
- **A shared 2D ray-tracing kit** (PROPOSED), the optics counterpart of `G3`: one source
  for the axis, focal marks, ray segments, off-screen note and no-image state. Lens and
  mirror are the first customers; `ray-optics` is the third.
- **A convention for off-canvas results and stepping** (DONE in `CONVENTIONS.md`): a
  result that lands outside the drawing is announced at the edge, and a stepper never
  snaps.
- **Every sim an instructor embeds gets URL presets** (partly DONE). The five that
  schedule Preps now have them; `two-source-interference`, `interference-explorer` and
  `thin-film-interference` do not.
- **How-to videos:** none of these sims has one (the tracker lists only a few). Record
  one for the lens tracer before Fri Nov 20 only if you want it; the sim's behaviour has
  changed in the small ways above.
