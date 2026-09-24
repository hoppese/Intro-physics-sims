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

## Process conventions (how, not what)

- **Bundle editing**: sims are generated single-file bundles — extract,
  edit, re-splice, verify (JSON reparse, tag balance, `node --check`, zero
  literal `</`). See `sims-are-generated-bundles` memory.
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

Log what the audit found (even "nothing found") as a dated note in
`sim-conventions-doc` memory so the next audit knows the catalog's last
known-clean date.

## Known gaps (not yet fixed, don't re-discover these)

- `written-hw-1-solutions.pdf` / `written-hw-2-solutions.pdf` use `K`
  throughout (pre-existing, uploaded PDFs, no LaTeX source in the repo).
  Flag to Seth rather than silently rewriting — reconstructing a solution
  set from a flat PDF is a bigger job than a symbol swap.
