# Circuit Lab — interaction review (2026-09-22)

Driven by hand in Chrome against `circuit-lab/index.html`, series preset and RC
preset. Compared against EveryCircuit's interaction model.

## What is already good

- **The physics is right.** Series preset: 6 V, R₁ 10 Ω, R₂ 20 Ω → I = 200 mA,
  ΔV₁ = 2.00 V, ΔV₂ = 4.00 V. RC preset: R 100 Ω, C 10 mF → measured τ ≈ 0.95 s
  against RC = 1.0 s. The MNA solver and the transient integrator both check out.
- **The selected-component panel is genuinely good** — live ΔV and I for the
  selected part, an editable value, Flip and internal resistance for a battery.
  EveryCircuit makes you hunt for this.
- Transient controls (Play/Pause, t=0, time readout) appear only when there is a
  reactive component, which is the right call.

## Findings

### 1. Hit-testing is by midpoint, so long wires are mostly dead

`nearestBranch` measures distance to `clickPt(cp)` — a single point, the
component's midpoint — within ~20 px. Fine for a resistor. For a wire spanning
half the canvas it means the only clickable part is a 40 px blob at its centre.
Clicking anywhere else on a wire does nothing at all.

**Fix:** hit-test distance to the *segment*, not the midpoint.

This is the root cause of two other complaints, and should be fixed first.

### 2. Clicking empty canvas does not deselect

In `onDown`:

```js
if(tool==='wire'){ const d=this.nearestDot(x,y,22/sc); if(d){ this.drag={kind:'place', a:d, x, y}; return; } }
this.startPan(e); this.setState({sel:null});
```

The default tool is `wire`, and grid dots sit ~37 px apart, so a click within
22 px of a dot — i.e. most of the canvas — starts a wire placement and returns
before the deselect. Verified: select R₁, click empty grid, R₁ stays selected.

**Fix:** clear the selection on pointer-up when a `place` drag ended without
actually drawing a wire.

### 3. There is no Select tool, so a click's meaning is invisible

The toolbar is all *place* modes; selection is an implicit side effect of
clicking something. Which means what a click does depends on what happens to be
under it, with nothing on screen saying so. EveryCircuit has an explicit arrow
tool, and that is why its behaviour feels predictable.

**Fix:** add a Select (arrow) mode and make it the default. `tool:'select'`
already appears in the code, so the notion half-exists.

### 4. Erase is redundant — but only once #1 is fixed

Selecting a part already gives a Delete button in the panel, so Erase is a
second way to do the same thing, sitting in the row with Ammeter and Voltmeter
and mixing "add a thing" with "remove a thing".

It survives because of #1: with midpoint-only hit-testing, deleting a specific
wire is genuinely hard, and Erase is the workaround. **Remove Erase, but fix
hit-testing in the same change** or wires become undeletable.

### 5. Graphing is gated behind meters

To plot anything you must place a meter, then find and toggle its `graph` chip,
then run. EveryCircuit's headline interaction is the opposite: tap any component
and a trace appears immediately.

The machinery is all there — `recordSamples`, `drawGraph`, per-component
`samples[]`. It is the gating that is wrong, not the engine.

### 6. The graph is too small and clipped

Hard-coded 294×150 in the right column. The x-axis label `t (s)` is drawn at
`x1, H-1` and overlaps the final tick label. A waveform is the point of the
exercise and deserves the width.

### 7. Canvas labels collide

On the RC preset the capacitor's `Q=…` label is struck through by the plate
graphic and overlaps the V₁ meter readout. Component labels, meter labels and
values are placed independently with no collision avoidance.

### 8. No multi-select

Shift-click replaces the selection rather than extending it. `state.sel` is a
single id, and `deleteSel` filters on that one id.

**Recommendation:** worth having, but it is the largest change here — `sel`
has to become a set, and move/delete/panel all have to follow. Suggest doing it
*after* #1 and #3, since a Select tool with proper hit-testing is the thing that
makes rubber-band selection natural, and rubber-band is more useful than
shift-click for the "delete this whole branch" case students actually hit.

### 9. A closed switch is labelled as a resistor

Select a closed switch and the panel header reads e.g. "Switch R₁". `selSym`
reads `sol.symOf[id]`, and the solver models a closed switch as a resistive
branch, so it inherits an R symbol. Confusing in a course where R means
resistor. (Present in the baseline — not introduced by the variants.)

### 10. Moving a wire can destroy the part next to it — **present in the shipped sim**

Reported by Seth 2026-09-22: drag the right-hand wire of the series preset to
the left and R₁/R₂ end up stacked on top of each other.

Cause is in `onMove`, the `move` branch. A neighbouring part keeps the endpoint
it shares with the part being dragged, so moving one stretches or squeezes the
other — and nothing checks the result:

```js
for(const q of (this.drag.nbrsA||[])) q.o[q.w]={c:na.c,r:na.r};
```

Drag far enough and the neighbour's endpoint passes its own start. Reproduced
in the **untouched baseline**: the series preset's R₂ goes from `(8,2)→(12,2)`
to `(8,2)→(7,2)` — inverted, negative length, drawn back over R₁. The panel
still reports "DC solved" and 200 mA over the mangled netlist.

Not introduced by the variants; the variants only make wires easier to grab, so
it is easier to reach.

**Fix (in both variants):** before committing a move, check every affected
neighbour would stay legal — non-zero length, still axis-aligned, and not
flipped past its far end. If any would break, reject the step, so the drag
stops against the obstruction instead of destroying it. Verified: the same drag
now leaves R₂ at `(8,2)→(9,2)`, squeezed but correct, circuit still solving at
200 mA.

**Still unfixed in `circuit-lab/`, which is the one in the catalog.**

## Suggested order

1. Segment hit-testing (#1) — unblocks everything else
2. Deselect on empty click (#2)
3. Select tool as default (#3)
4. Drop Erase (#4)
5. Graphing: probe any component (#5) + a bigger plot (#6)
6. Label collisions (#7)
7. Multi-select, probably rubber-band (#8)


## Variants built

Two forks, both carrying findings #1, #2 and #4, differing only in how graphing
is offered. Neither is in the sim catalog — they are for comparison.

| | `circuit-lab-scope` | `circuit-lab-probe` |
|---|---|---|
| Plot location | full width under the circuit | right column, taller |
| Plot size | 560×210 | 295×221 |
| What gets plotted | meters, as before | **any part you click** |
| Closest to | a bench oscilloscope | EveryCircuit |

`circuit-lab-probe` adds `probe()`, `defMode()` and `setMode()`. `elemMeas`
already returned ΔV and I for every component type, so probing needed no new
physics — only recording. Default trace is current for a switch/wire/ammeter
and potential difference for everything else.

Both verified by hand: wire selectable along its length, empty-click deselects,
RC transient plots correctly (V across R steps to 6 V and decays as C charges).
