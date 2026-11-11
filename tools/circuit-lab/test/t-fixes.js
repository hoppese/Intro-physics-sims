// Regression tests for the second round of fixes (integration accuracy,
// instant effects, snap-back, tidy clearance, flip, limits, fit, hit areas).
const L = require('./load.js');
const { P, Workbench, PointerTool, View, Circuit, Solver, Simulation, PRESETS, PAINTERS, Renderer, Fmt, Resistor, Battery, Capacitor, Inductor, Switch, ThrowSwitch, Voltmeter, Ammeter, Meter, WorkedExample } = L;
let n = 0, bad = 0; const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
const near = (x, y, tol, m) => ok(Math.abs(x - y) <= tol, m + ': got ' + x + ', want ' + y);
const at = (b, p, dx, dy) => { const w = View.xy(p), x = w.x + (dx || 0), y = w.y + (dy || 0), s = b.view.toCanvas(x, y); return { x, y, sx: s.x, sy: s.y }; };
const drag = (b, tool, from, to) => { tool.down(at(b, from)); const steps = 8; for (let i = 1; i <= steps; i++) tool.move(at(b, { c: from.c + (to.c - from.c) * i / steps, r: from.r + (to.r - from.r) * i / steps })); tool.up(at(b, to)); };
const clean = (b, m) => ok(b.circuit.problems().length === 0, m + ': ' + b.circuit.problems().join('; '));
const bench = (name) => { const b = new Workbench(); b.view.resize(560, 400); b.loadPreset(name); return b; };
const run = (sim, seconds) => { for (let i = 0, k = Math.round(seconds * 500); i < k; i++) sim.advance(Simulation.DT); };
const load = (net) => { const b = new Workbench(); b.view.resize(560, 400); b.replace(Circuit.decode(net.replace(/ /g, '_'), Workbench.NC, Workbench.NR)); return b; };

// ---- F12: second-order integration ----
// RC charging against the exact curve (the RC preset: 6 V, 220 ohm, 10 mF, tau = 2.2 s)
{ const b = bench('rc'), cap = b.circuit.ofType(Capacitor)[0]; let worst = 0;
  for (let k = 1; k <= 10; k++) { run(b.sim, 0.5); worst = Math.max(worst, Math.abs(Math.abs(cap.vc) - 6 * (1 - Math.exp(-b.sim.t / 2.2)))); }
  ok(worst < 2e-4, 'RC charging tracks the exact curve to 0.2 mV: ' + worst.toExponential(2)); near(b.sim.t, 5, 1e-6, 'five seconds'); }
// a lossless LC loop keeps its energy (backward Euler lost ~10% a second here)
{ const b = load('c12.8-12.12@10 l20.8-20.12@1 w12.8-20.8 w12.12-20.12'), cap = b.circuit.ofType(Capacitor)[0], ind = b.circuit.ofType(Inductor)[0];
  cap.vc = 6; cap.vc1 = null; b.sim.jolt(); const E = () => 0.5 * cap.farads * cap.vc * cap.vc + 0.5 * ind.value * ind.il * ind.il, E0 = E();
  near(E0, 0.18, 1e-6, 'LC starting energy'); run(b.sim, 10); ok(Math.abs(E() / E0 - 1) < 0.01, 'LC energy after 10 s (16 cycles) within 1%: ' + (E() / E0).toFixed(5));
  let peak = 0; for (let i = 0; i < 400; i++) { b.sim.advance(Simulation.DT); peak = Math.max(peak, Math.abs(ind.il)); } near(peak, 0.6, 0.004, 'LC peak current = V sqrt(C/L)'); }
// a series RLC ring-down against the exact underdamped solution
{ const b = load('c12.8-12.12@10 r12.8-16.8@3 w16.8-20.8 l20.8-20.12@1 w12.12-20.12'), cap = b.circuit.ofType(Capacitor)[0];
  cap.vc = 6; cap.vc1 = null; b.sim.jolt(); const a = 1.5, wd = Math.sqrt(100 - a * a), exact = (t) => 6 * Math.exp(-a * t) * (Math.cos(wd * t) + a / wd * Math.sin(wd * t)); let worst = 0;
  for (let k = 0; k < 40; k++) { run(b.sim, 0.05); worst = Math.max(worst, Math.abs(Math.abs(cap.vc) - Math.abs(exact(b.sim.t)))); }
  ok(worst < 0.01, 'RLC ring-down within 10 mV of exact over 2 s: ' + worst.toExponential(2)); }

// ---- F6: what is shown at an instant is that instant ----
{ const b = bench('rc'), c = b.circuit, vm = c.ofType(Voltmeter)[0], am = c.ofType(Ammeter)[0];
  near(Math.abs(vm.number(b.sol)), 0, 1e-4, 'RC at t = 0: capacitor voltage is zero'); near(Math.abs(am.number(b.sol)), 6 / 220, 1e-5, 'RC at t = 0: I = emf / R'); }

// ---- F4: an open switch carries exactly no current ----
{ const b = bench('rl'), sw = b.circuit.ofType(Switch)[0]; ok(!sw.closed, 'RL preset starts open'); ok(b.sol.current(sw) === 0, 'open switch current is 0, not NaN: ' + b.sol.current(sw)); ok(Fmt.A(b.sol.current(sw)) === '0 mA', 'and prints as 0 mA'); }

// ---- instant effects of a change ----
// opening the switch on a live inductor: the current stops at once, with a notice, and nothing blows up
{ const b = bench('rl'), c = b.circuit, sw = c.ofType(Switch)[0], ind = c.ofType(Inductor)[0], vm = c.ofType(Voltmeter)[0];
  b.toggle(sw); ok(sw.closed, 'closed'); run(b.sim, 3); near(Math.abs(ind.il), 0.6 * (1 - Math.exp(-3 / 1.5)), 2e-4, 'RL ramp matches the exact curve');
  b.toggle(sw); ok(!sw.closed, 'opened'); ok(Math.abs(ind.il) < 1e-3, 'inductor current cut: ' + ind.il); ok(b.notice && /spark/.test(b.notice.text) && !b.notice.bad, 'spark notice');
  const v = vm.number(b.sol); ok(isFinite(v) && Math.abs(v) < 7, 'voltmeter stays sane with the switch open: ' + v); run(b.sim, 0.5); const v2 = vm.number(b.sol); ok(isFinite(v2) && Math.abs(v2) < 7, 'and half a second later: ' + v2); }
// two capacitors joined by bare wire share their charge at once
{ const b = load('c12.8-12.12@10 w12.8-14.8 s14.8-18.8@0 w18.8-20.8 c20.8-20.12@30 w12.12-20.12'), caps = b.circuit.ofType(Capacitor), sw = b.circuit.ofType(Switch)[0];
  caps[0].vc = 8; caps[0].vc1 = null; b.sim.jolt(); near(Math.abs(caps[0].vc), 8, 1e-6, 'holds its charge while the switch is open');
  b.toggle(sw); near(Math.abs(caps[0].vc), 2, 1e-3, 'shared: C1 V / (C1 + C2)'); near(Math.abs(caps[1].vc), 2, 1e-3, 'second capacitor at the same voltage'); }

// ---- F10: graphs start with a point ----
{ const b = bench('rc'), vm = b.circuit.ofType(Voltmeter)[0]; b.toggleGraph(vm); ok(vm.samples.length === 1, 'turning a graph on records the present reading');
  b.sim.sample(); b.sim.sample(); ok(vm.samples.length === 1, 'the same instant is not recorded twice'); run(b.sim, 0.1); ok(vm.samples.length > 1, 'then it grows'); b.sim.reset(); ok(vm.samples.length === 1 && vm.samples[0][0] === 0, 'reset: one sample at t = 0'); }

// ---- F18: a part dropped where it cannot go returns to where the drag began ----
{ const b = bench('series'), tool = new PointerTool(b), rs = b.circuit.ofType(Resistor), r1 = rs[0], r2 = rs[1], before = b.circuit.encode(), undoWas = b.history.canUndo;
  b.history.clear(); drag(b, tool, r1.center(), r2.center());
  ok(b.circuit.encode() === before, 'dropped on another part: layout exactly as it was'); ok(b.notice && b.notice.bad && /Put back/.test(b.notice.text), 'and says so: ' + (b.notice && b.notice.text)); ok(!b.history.canUndo, 'nothing to undo'); clean(b, 'after refused drop');
  // a good drop still takes, and clears the complaint
  const c0 = r1.center(); drag(b, tool, c0, { c: c0.c, r: c0.r - 2 }); ok(b.circuit.encode() !== before, 'a legal drag moves it'); ok(!b.notice || !b.notice.bad, 'complaint cleared by the next success'); ok(b.history.canUndo, 'one undo step'); b.undo(); ok(b.circuit.encode() === before, 'undo restores'); clean(b, 'after legal drag + undo'); }

// ---- nudges made in a run are one undo step ----
{ const b = bench('series'), r1 = b.circuit.ofType(Resistor)[0], before = b.circuit.encode(); b.history.clear(); b.select(r1);
  b.nudge(0, -1); b.nudge(0, -1); b.nudge(0, -1); ok(b.circuit.encode() !== before, 'nudged'); b.undo(); ok(b.circuit.encode() === before, 'three nudges undo as one'); ok(!b.history.canUndo, 'and that was the only step'); b.redo(); ok(b.circuit.encode() !== before, 'redo brings all three back'); clean(b, 'nudge run'); }

// ---- F25: a typed value outside the allowed range says what the range is ----
{ const b = bench('series'), r1 = b.circuit.ofType(Resistor)[0], bat = b.circuit.ofType(Battery)[0]; b.select(r1);
  b.type('value', 5000); ok(r1.value === 1000, 'clamped to the maximum'); ok(b.notice && /between 0.5 and 1000 Ω/.test(b.notice.text) && !b.notice.bad, 'range notice: ' + (b.notice && b.notice.text));
  b.type('value', 500); ok(r1.value === 500 && !b.notice, 'an allowed value clears it'); b.endTyping();
  b.select(bat); b.type('ri', 80); ok(bat.ri === 50 && b.notice && /Internal resistance is kept between 0 and 50 Ω/.test(b.notice.text), 'internal resistance range: ' + (b.notice && b.notice.text)); b.endTyping(); }

// ---- F22: the 2-position switch flips ----
{ const b = bench('rc'), sw = b.circuit.ofType(ThrowSwitch)[0], before = b.circuit.encode(); b.select(sw); const r = b.flip();
  // with all three terminals wired there is no way to mirror it without crossing wires: it must say so and leave everything alone
  if (r.ok) ok(b.circuit.encode() !== before, 'geometry changed'); else { ok(b.circuit.encode() === before, 'refused flip leaves the circuit alone'); ok(b.notice && b.notice.bad && /flip/.test(b.notice.text), 'and says why: ' + (b.notice && b.notice.text)); } clean(b, 'throw switch flip');
  for (const name of ['rc']) { const b2 = bench(name), s2 = b2.circuit.ofType(ThrowSwitch)[0]; for (let i = 0; i < 4; i++) { b2.select(b2.circuit.ofType(ThrowSwitch)[0]); b2.rotate(1); clean(b2, 'rotate ' + i); b2.select(b2.circuit.ofType(ThrowSwitch)[0]); b2.flip(); clean(b2, 'flip after rotate ' + i); } } }
// a lone throw switch: flip mirrors it on the spot, twice is the identity
{ const b = bench('blank'), sw = b.add('swdt'), g0 = b.circuit.encode(); b.select(sw); ok(b.flip().ok, 'lone flip'); const g1 = b.circuit.encode(); ok(g1 !== g0, 'mirrored'); b.select(b.circuit.ofType(ThrowSwitch)[0]); ok(b.flip().ok, 'flip back'); ok(b.circuit.encode() === g0, 'two flips = no change'); }

// ---- F9: "Clean up circuit" never crowds parts together ----
{ const gap = (c) => { const ps = c.parts, out = []; for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) out.push([ps[i].id, ps[j].id, ps[i].clearanceTo(ps[j])]); return out; };
  const nets = PRESETS.list.map(([nm]) => PRESETS.nets[nm]).concat(['b12.9-12.13@6 w12.8-12.9 w12.13-12.14 w12.8-20.8 r20.8-24.8@10 w24.8-30.8 w30.8-30.20 w30.20-12.20 w12.14-12.20 r14.24-18.24@20 c22.26-26.26@10',
    'b8.6-8.10@6 w8.6-8.4 w8.4-30.4 r30.4-30.8@10 w30.8-30.30 w30.30-8.30 w8.30-8.10 l14.14-18.14@1 a14.18-18.18']);
  for (const net of nets) { const b = load(net), was = new Map(gap(b.circuit).map(([i, j, d]) => [i + ':' + j, d])); b.tidyLayout(); clean(b, 'tidy');
    for (const [i, j, d] of gap(b.circuit)) { const d0 = was.get(i + ':' + j); ok(d >= Math.min(Circuit.ROOM, d0), 'tidy keeps parts ' + i + ',' + j + ' apart: ' + d0 + ' -> ' + d); } } }

// ---- F14: "fit" brings every label into view ----
{ const check = (b, what) => { const sc = { circuit: b.circuit, names: b.circuit.labels(), sol: b.sol, hide: false, revealed: () => true, view: b.view }, lo = b.view.toWorld(0, 0), hi = b.view.toWorld(b.view.w, b.view.h);
    for (const [id, Lb] of Renderer.layout(null, sc)) ok(Lb.x0 >= lo.x && Lb.x1 <= hi.x && Lb.y0 >= lo.y && Lb.y1 <= hi.y, what + ': label of ' + b.circuit.byId(id).type + ' inside the canvas'); };
  for (const [w, h] of [[560, 400], [480, 340], [900, 600]]) { const b = new Workbench(); b.view.resize(w, h);
    for (const [name] of PRESETS.list) { b.loadPreset(name); check(b, name + ' @' + w); if (w === 560) ok(b.view.scale === 1, name + ' still opens at 100%: ' + b.view.scale.toFixed(3)); }
    for (const [kind] of WorkedExample.ORDER) { new WorkedExample(kind).build(b); b.fit(); check(b, 'example ' + kind + ' @' + w); } } }

// ---- F1: a switch toggles on its lever, not on its leads ----
{ const b = bench('rl'), sw = b.circuit.ofType(Switch)[0], pt = PAINTERS.switch, a = View.xy(sw.a), z = View.xy(sw.b), mid = { x: (a.x + z.x) / 2, y: (a.y + z.y) / 2 }, ux = Math.sign(z.x - a.x), uy = Math.sign(z.y - a.y);
  ok(pt.onLever(sw, mid.x, mid.y), 'middle of the switch is the lever'); ok(!pt.onLever(sw, a.x + ux * 6, a.y + uy * 6), 'the lead by terminal a is not'); ok(!pt.onLever(sw, z.x - ux * 6, z.y - uy * 6), 'nor the lead by terminal b');
  const tool = new PointerTool(b), p = (x, y) => { const s = b.view.toCanvas(x, y); return { x, y, sx: s.x, sy: s.y }; };
  tool.down(p(a.x + ux * 10, a.y + uy * 10)); tool.up(p(a.x + ux * 10, a.y + uy * 10)); ok(!sw.closed, 'clicking the lead does not throw the switch'); ok(b.selId === sw.id, 'it selects it');
  tool.down(p(mid.x, mid.y)); tool.up(p(mid.x, mid.y)); ok(sw.closed, 'clicking the lever does'); }

// ---- F2 / F20: the summary line does not talk about things that are not there ----
{ const { Panel } = L; if (Panel) { const mk = (b) => new Panel({ bench: b, state: { hide: false, peek: {} } }).summary().summaryText;
    const b = bench('blank'); b.add('switch'); ok(!/Switch open/.test(mk(b)), 'an unwired open switch is not "the" open switch: ' + mk(b));
    const c = bench('blank'); c.add('cap'); ok(!/running/.test(mk(c)) && /wired/.test(mk(c)), 'a lone capacitor is not "running": ' + mk(c));
    ok(/Switch open/.test(mk(bench('rl'))), 'RL preset: switch open'); const lc = load('c12.8-12.12@10 l20.8-20.12@1 w12.8-20.8 w12.12-20.12'); ok(/running/.test(mk(lc)) && !/Throw a switch/.test(mk(lc)), 'no switch, no "throw a switch": ' + mk(lc)); } }

// ---- a wire that neither elbow can carry goes round ----
{ const b = load('g20.12-20.14 o17.11-17.15@6~1'), tool = new PointerTool(b); drag(b, tool, P.of(17, 15), P.of(20, 12));
  ok(b.circuit.wires.length > 0 && !(b.notice && b.notice.bad), 'bottom of the source to the top of the ground: routed round (' + b.circuit.encode() + ')'); clean(b, 'detour wire');
  ok(b.circuit.wired(b.circuit.ofType(L.Ground)[0]) && b.circuit.encode().includes('w17.15-19.15'), 'joined at both ends, one column short of the ground');
  // a straight shot through a part is still refused (no way round to a point inside a part)
  const b2 = load('r14.10-18.10@10'), t2 = new PointerTool(b2); drag(b2, t2, P.of(12, 10), P.of(16, 10)); ok(b2.circuit.wires.length === 0, 'cannot end a wire inside a part'); }

// ---- formatting ----
ok(Fmt.A(0) === '0 mA' && Fmt.A(2e-5) === '0 mA' && Fmt.A(0.0005) === '0.5 mA' && Fmt.A(0.0273) === '27 mA' && Fmt.A(1.5) === '1.500 A', 'currents: ' + [Fmt.A(0), Fmt.A(0.0005), Fmt.A(0.0273), Fmt.A(1.5)].join(' | '));
ok(Fmt.signedA(-1e-7) === '0 mA' && Fmt.signedA(-0.02) === '−20 mA', 'signed zero has no sign'); ok(Fmt.V(-0.001) === '0.00 V' && Fmt.V(1.5) === '+1.50 V', 'voltages'); ok(Fmt.Q(0) === '0 mC' && Fmt.Q(1e-13) === '0 mC', 'no charge is 0 mC');

// ---- "Clean up circuit" straightens; it does not shrink or rearrange ----
{ // a tidy drawing has nothing to tidy: every preset comes back untouched
  for (const [name] of PRESETS.list) { const b = bench(name), e0 = b.circuit.encode(), h0 = b.history.past.length; b.tidyLayout(); ok(b.circuit.encode() === e0, 'preset ' + name + ' is already tidy'); ok(b.notice && /Nothing/.test(b.notice.text), 'preset ' + name + ' says so: ' + (b.notice && b.notice.text)); ok(b.history.past.length === h0, 'and nothing lands on the undo stack (' + name + ')'); }
  // the bridge with its middle resistor dragged three rows down: it goes back in line and nothing else moves
  const net = 'b12.10-12.14@6_g12.16-12.18_r16.8-16.12@10_r26.8-26.12@10_r20.15-24.15@30_r16.12-16.16@20_r26.12-26.16@45_w12.8-16.8_w16.8-26.8_w12.16-16.16_w16.16-26.16_w16.12-19.12_w24.12-26.12_w19.15-20.15_w12.8-12.10_w12.14-12.16_w19.12-19.15_w24.12-24.15';
  const b = load(net), c = b.circuit, t0 = c.turns(c.wireEdges()), w0 = c.wireEdges().size; b.tidyLayout(); clean(b, 'tidied bridge'); const e = c.encode();
  ok(/r20\.12-24\.12@30/.test(e), 'the dragged resistor is back on the bridge row: ' + e); for (const keep of ['b12.10-12.14@6', 'r16.8-16.12@10', 'r26.8-26.12@10', 'r16.12-16.16@20', 'r26.12-26.16@45', 'g12.16-12.18']) ok(e.includes(keep), 'tidy leaves ' + keep + ' where it was');
  ok(c.turns(c.wireEdges()) < t0 && c.wireEdges().size <= w0, 'fewer turns, no more wire: ' + t0 + ' -> ' + c.turns(c.wireEdges()) + ', ' + w0 + ' -> ' + c.wireEdges().size);
  ok(b.history.canUndo, 'one undo step'); b.undo(); ok(b.circuit.encode() === net, 'undo puts the dragged layout back');
  // a jog in a wire is taken out without moving the parts
  const j = load('b12.9-12.13@6 w12.8-12.9 w12.8-15.8 w15.8-15.7 w15.7-17.7 r17.7-21.7@10 w21.7-24.7 w24.7-24.14 w24.14-12.14 w12.13-12.14'), jt = j.circuit.turns(j.circuit.wireEdges()); j.tidyLayout(); clean(j, 'tidied jog');
  ok(j.circuit.turns(j.circuit.wireEdges()) < jt, 'the jog is gone'); ok(j.circuit.encode().includes('b12.9-12.13@6') && j.circuit.parts.length === 2, 'battery stays put');
  // the measure itself: a straight run has no turns, an L has one, a T-junction counts one
  const tn = (net) => { const x = load(net).circuit; return x.turns(x.wireEdges()); };
  ok(tn('w10.10-14.10') === 0, 'straight wire: 0 turns'); ok(tn('w10.10-14.10 w14.10-14.14') === 1, 'an L: 1 turn'); ok(tn('w10.10-18.10 w14.10-14.14') === 1, 'a T: 1'); ok(tn('r10.10-14.10@10 w14.10-18.10') === 0, 'wire straight out of a part: 0'); ok(tn('r10.10-14.10@10 w14.10-14.14') === 1, 'wire sideways out of a part: 1'); }

// ---- deleting an ammeter closes the wire it was spliced into; deleting anything else leaves a gap ----
{ const net = 'b12.9-12.13@6_g12.14-12.16_r18.9-18.13@10_r24.9-24.13@20_a19.8-23.8_w12.8-18.8_w18.8-19.8_w23.8-24.8_w12.14-18.14_w18.14-24.14_w12.8-12.9_w12.13-12.14_w18.8-18.9_w18.13-18.14_w24.8-24.9_w24.13-24.14';
  const b = load(net), r2 = b.circuit.parts.find((e) => e instanceof Resistor && e.value === 20), I = () => Math.abs(b.sol.current(b.circuit.byId(r2.id)));
  near(I(), 0.3, 1e-6, 'with the ammeter in: 0.3 A in the 20 Ω branch'); b.select(b.circuit.parts.find((e) => e instanceof Ammeter)); b.remove(); clean(b, 'ammeter deleted');
  ok(!b.circuit.parts.some((e) => e instanceof Ammeter), 'the ammeter is gone'); near(I(), 0.3, 1e-6, 'and the branch still carries 0.3 A'); ok(b.circuit.encode().includes('w18.8-24.8'), 'the wire is whole again: ' + b.circuit.encode());
  b.undo(); ok(b.circuit.encode() === net, 'undo brings the ammeter back');
  // an ammeter with a loose lead just goes
  const c = load('b12.9-12.13@6 w12.8-12.9 w12.8-14.8 a14.8-18.8 r20.12-24.12@10'), w0 = c.circuit.wireEdges().size; c.select(c.circuit.parts.find((e) => e instanceof Ammeter)); c.remove(); clean(c, 'loose ammeter deleted'); ok(c.circuit.wireEdges().size === w0, 'no wire is invented for a meter that was not in line');
  // a resistor leaves a gap
  const d = load(net); d.select(d.circuit.parts.find((e) => e instanceof Resistor && e.value === 20)); d.remove(); clean(d, 'resistor deleted'); ok(!d.circuit.wireEdges().has(P.edge({ c: 24, r: 10 }, { c: 24, r: 11 })), 'deleting a resistor leaves the branch open'); }

// ---- the automatic view follows the circuit: nothing an edit does ends up off the canvas ----
{ const inView = (b) => { const box = Renderer.fitBox(b.circuit, b.view.labelScale), a = b.view.toWorld(0, 0), z = b.view.toWorld(b.view.w, b.view.h); return box.x0 >= a.x - 0.5 && box.y0 >= a.y - 0.5 && box.x1 <= z.x + 0.5 && box.y1 <= z.y + 0.5; };
  const b = bench('parallel'); ok(b.view.auto && inView(b), 'a preset starts in view'); const ox0 = b.view.ox; b.add('volt'); ok(inView(b), 'a new part lands in view'); ok(b.view.ox === ox0, 'and the view does not jump for it');
  let moved = 0; for (let i = 0; i < 14; i++) { const r = b.nudge(1, 0); if (r && r.ok) moved++; ok(inView(b), 'nudge right ' + (i + 1) + ': still in view'); } ok(moved >= 8, 'the part really travelled (' + moved + ' steps)'); ok(b.view.ox !== ox0 || b.view.scale !== 1, 'so the view had to follow');
  // once the user has taken the view over, it is left alone
  const c = bench('parallel'); c.add('volt'); c.view.zoomBy(1.25); const s0 = c.view.scale, o0 = c.view.ox; for (let i = 0; i < 14; i++) c.nudge(1, 0); ok(c.view.scale === s0 && c.view.ox === o0, 'a view the user set is not touched'); }

// ---- worked examples quote currents the way the meters read them ----
{ const T = WorkedExample.TEX;
  ok(T.cur(0.0941)(0.0941) === '94.1\\text{ mA}', 'under 100 mA: one decimal'); ok(T.cur(0.6)(0.6) === '600\\text{ mA}', '600 mA'); ok(T.cur(0.8, 1.4)(0.8) === '0.80\\text{ A}', 'one current of 1 A or more puts the whole problem in A');
  for (const [kind] of WorkedExample.ORDER) for (let i = 0; i < 30; i++) { const m = new WorkedExample(kind).model(), all = m.given.concat(m.steps).map((x) => x.tex).join(' ');
    ok(!/NaN|undefined|tfrac/.test(all), kind + ': clean TeX'); const units = new Set((all.match(/\\text\{ m?A\}/g) || [])); ok(units.size <= 1, kind + ': one current unit per problem'); } }

// ---- answers never land on exactly 1; time constants to three figures ----
{ for (const [kind] of WorkedExample.ORDER) for (let i = 0; i < 300; i++) { const all = new WorkedExample(kind).model().steps.map((x) => x.tex).join(' ');
    if (/= 1(\.0+)?\\text\{ (s|A)\}/.test(all)) { ok(false, kind + ': an answer of exactly 1 -- ' + all); break; } }
  ok(true, 'no worked example has a time constant or a current of exactly 1');
  const rl = new WorkedExample('rl'); rl.vals = { emf: 6, R: 5, L: 8 }; ok(rl.model().steps[0].tex.endsWith('= 1.60\\text{ s}'), 'tau to three figures: ' + rl.model().steps[0].tex);
  rl.vals = { emf: 6, R: 15, L: 4 }; ok(rl.model().steps[0].tex.endsWith('= 0.267\\text{ s}'), 'tau = 0.267 s'); }

// ---- the graph's current axis follows the meters: mA below 1 A, A from there up ----
{ const { GraphPainter, Ammeter: Am } = L; const texts = []; const grad = { addColorStop() {} };
  const g = new Proxy({}, { get: (t, k) => k === 'fillText' ? (s) => texts.push(String(s)) : k === 'measureText' ? () => ({ width: 10 }) : (k === 'createRadialGradient' || k === 'createLinearGradient') ? () => grad : (typeof k === 'string' && /^[a-z]/.test(k) && !(k in t) ? () => {} : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
  const axis = (peak) => { texts.length = 0; const el = { type: 'amm', samples: [[0, 0], [1, peak / 2], [2, peak]] }; new GraphPainter().draw(g, { dpr: 1, t: 2, origin: 0, meters: [{ el, name: 'A1', shown: true }] }); return texts.slice(); };
  const lo = axis(0.82), hi = axis(1.2);
  ok(lo.includes('mA') && lo.includes('1000'), 'up to 1 A the axis is in mA: ' + lo.join(' ')); ok(hi.includes('A') && !hi.includes('mA') && !hi.includes('1500') && hi.includes('1.5'), 'from 1 A it is in A: ' + hi.join(' ')); }

// ---- a shorted-out part keeps both its leads when it is moved ----
{ const c = bench('blank'); const load = (net) => { c.circuit = L.Circuit.decode(net, Workbench.NC, Workbench.NR); c.sim.circuit = c.circuit; c.sim.reset(); };
  const wired = (el) => { const { comp } = L.Circuit.components(c.circuit.wireEdges()); return el.terminals().map((t) => comp.get(L.P.key(t.p))); };
  load('b12.9-12.13@6_g12.14-12.16_r14.8-18.8@10_r20.8-24.8@20_w12.8-14.8_w18.8-20.8_w24.8-26.8_w12.14-26.14_w14.9-18.9_w12.8-12.9_w12.13-12.14_w26.8-26.14_w14.8-14.9_w18.8-18.9');
  const r1 = c.circuit.elements.find((e) => e.type === 'resistor' && e.a.c === 14);
  for (const [dc, dr] of [[0, 3], [0, -3], [2, 4], [-1, -2], [5, 6]]) { const snap = c.circuit.snapshot(); const r = c.circuit.move(r1, dc, dr);
    if (r.ok) { const w = wired(r1); ok(w[0] != null && w[0] === w[1], 'shorted resistor moved by ' + dc + ',' + dr + ': both ends still on the one net (' + c.circuit.encode() + ')');
      c.sim.refresh(); ok(Math.abs(c.sol.current(r1)) < 1e-9 && Math.abs(Math.abs(c.sol.current(c.circuit.elements.find((e) => e.type === 'resistor' && e !== r1))) - 0.3) < 1e-6, 'and it is still shorted: 6 V across the 20 ohm alone'); }
    else ok(true, 'refused: ' + r.why); c.circuit.restore(snap); } }

// ---- the view cannot leave the board: panning and zooming stop at its edge ----
{ const { View, Workbench } = L; const B = View.boardOf(Workbench.NC, Workbench.NR);
  const inside = (v) => { const a = v.toWorld(0, 0), z = v.toWorld(v.w, v.h); return a.x >= B.x0 - 1e-6 && a.y >= B.y0 - 1e-6 && z.x <= B.x1 + 1e-6 && z.y <= B.y1 + 1e-6; };
  const c = bench('series'); const v = c.view; ok(inside(v), 'a preset opens inside the board');
  v.panTo(v.ox + 5000, v.oy + 5000); ok(inside(v) && v.ox === 0 && v.oy === 0 && !v.auto, 'dragged far right/down: stops with the board\'s corner at the canvas\'s corner');
  v.panTo(-99999, -99999); ok(inside(v) && Math.abs(v.toWorld(v.w, v.h).x - B.x1) < 1e-6 && Math.abs(v.toWorld(v.w, v.h).y - B.y1) < 1e-6, 'and the far corner the other way');
  v.zoomAbout(0, 0, 0.01); ok(v.scale === View.MIN && inside(v), 'zoomed right out: still inside (' + v.percent + ')');
  v.zoomAbout(v.w, v.h, 100); ok(v.scale === View.MAX && inside(v), 'zoomed right in at a corner: still inside');
  // a canvas larger than the whole board at this zoom: the board sits centred, and panning does nothing
  const big = new View(B); big.resize(1200, 800); big.zoomBy(0.01); const cx = big.toCanvas((B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2);
  ok(Math.abs(cx.x - 600) < 1e-6 && Math.abs(cx.y - 400) < 1e-6, 'a board smaller than the canvas is centred'); const o = big.ox; big.panTo(big.ox + 300, big.oy - 300); ok(big.ox === o, 'and cannot be pushed off-centre');
  // an empty bench opens on the middle of the board
  const e = bench('blank'); e.select(e.circuit.elements[0]); e.remove(); ok(e.circuit.elements.length === 0, 'the ground can go'); e.fit(); const m = e.view.toWorld(e.view.w / 2, e.view.h / 2); ok(Math.abs(m.x - (B.x0 + B.x1) / 2) < 1e-6 && Math.abs(m.y - (B.y0 + B.y1) / 2) < 1e-6 && e.view.auto, 'an empty bench shows the middle of the board');
  e.add('resistor'); const r = e.circuit.elements[0]; ok(r && Math.abs(r.a.c + r.b.c - (Workbench.NC - 1)) <= 2 && Math.abs(r.a.r + r.b.r - (Workbench.NR - 1)) <= 8, 'and the first part lands near the middle: ' + e.circuit.encode());
  // a circuit in the very corner still fits on screen (it just is not centred)
  const k = bench('blank'); k.circuit = L.Circuit.decode('r0.0-4.0@10_w0.0-0.4_w0.4-4.4_w4.0-4.4', Workbench.NC, Workbench.NR); k.sim.circuit = k.circuit; k.sim.reset(); k.fit();
  const p = k.view.toCanvas(View.xy({ c: 0, r: 0 }).x, View.xy({ c: 0, r: 0 }).y); ok(inside(k.view) && p.x >= 0 && p.y >= 0 && p.x < k.view.w && p.y < k.view.h, 'a circuit in the corner of the board is still shown'); }

// ---- two dozen loose parts: every one gets a roomy slot, no label lands on a part or another label ----
{ const { Renderer, PAINTERS, View } = L; const c = bench('blank');
  for (const t of ['battery', 'resistor', 'cap', 'ind', 'switch', 'swdt', 'volt', 'amm', 'ac', 'resistor', 'battery', 'ground', 'resistor', 'cap', 'ind', 'battery', 'amm', 'volt', 'swdt', 'switch', 'resistor', 'resistor', 'ac', 'ground']) ok(!!c.add(t), 'room for another ' + t);
  const parts = c.circuit.parts, lay = Renderer.layout(null, { circuit: c.circuit, names: c.circuit.labels(), sol: null, hide: true, revealed: () => false, view: { labelScale: c.view.labelScale } });
  const hit = (a, b) => a.x0 < b.x1 - 0.5 && a.x1 > b.x0 + 0.5 && a.y0 < b.y1 - 0.5 && a.y1 > b.y0 + 0.5; let clash = 0;
  for (const [id, lb] of lay) { for (const o of parts) if (o.id !== id && hit(lb, PAINTERS[o.type].box(o))) clash++; for (const [id2, l2] of lay) if (id2 !== id && hit(lb, l2)) clash++; }
  ok(clash === 0, '24 loose parts: no label on another part or label (' + clash + ' clashes, zoom ' + c.view.percent + ')');
  ok(c.view.auto && !c.covered(), 'and nothing is left under the zoom control');
  const a = c.view.toWorld(0, 0), z = c.view.toWorld(c.view.w, c.view.h); ok(Renderer.boxes(c.circuit, c.view.labelScale).every((o) => o.x0 >= a.x - 1 && o.y0 >= a.y - 1 && o.x1 <= z.x + 1 && o.y1 <= z.y + 1), 'and all of it is on screen'); }

// ---- a label is never put on the far side of another part ----
{ const { Renderer, PAINTERS, View } = L; const c = bench('blank'); c.circuit = L.Circuit.decode('r10.4-14.4@10_v10.6-14.6_v10.8-14.8_c10.10-14.10@10_r10.12-14.12@10', Workbench.NC, Workbench.NR); c.sim.circuit = c.circuit; c.sim.reset(); c.fit();
  const lay = Renderer.layout(null, { circuit: c.circuit, names: c.circuit.labels(), sol: null, hide: true, revealed: () => false, view: { labelScale: 1.45 } });
  for (const el of c.circuit.parts) { const lb = lay.get(el.id); if (!lb) continue; const y = View.xy(el.center()).y, my = (lb.y0 + lb.y1) / 2;
    const leapt = c.circuit.parts.some((o) => { if (o === el) return false; const oy = View.xy(o.center()).y; return (oy - y) * (oy - my) < 0; });
    ok(!leapt, el.type + ' at row ' + el.a.r + ': its label stays on its own side of the neighbours'); } }

// ---- touch: one finger is the pointer, two pinch ----
{ const { PinchGesture } = L; const b = bench('series'), tool = new PointerTool(b), V = b.view, T = (sx, sy) => ({ sx, sy, ...V.toWorld(sx, sy), coarse: true });
  const net = b.circuit.encode(), s0 = V.scale, mid0 = V.toWorld(280, 200);
  // spread two fingers to twice as far apart about (280, 200): zoom doubles, the midpoint stays put
  tool.touchDown(1, T(230, 200), true); ok(tool.gesture && !(tool.gesture instanceof PinchGesture), 'one finger starts an ordinary gesture');
  tool.touchDown(2, T(330, 200), false); ok(tool.gesture instanceof PinchGesture, 'a second finger makes it a pinch'); ok(V.auto, 'resting two fingers changes nothing yet');
  tool.touchMove(1, T(205, 200)); tool.touchMove(2, T(380, 200)); const want = Math.min(View.MAX, s0 * 1.75); near(V.scale, want, 1e-9, 'spread x1.75 -> zoom x1.75');
  tool.touchMove(1, T(180, 200)); tool.touchMove(2, T(380, 200)); near(V.scale, Math.min(View.MAX, s0 * 2), 1e-9, 'spread x2 -> zoom x2'); ok(!V.auto, 'a pinch takes the view off automatic');
  { const m = V.toWorld(280, 200); near(m.x, mid0.x, 1e-6, 'the point between the fingers stays between them (x)'); near(m.y, mid0.y, 1e-6, '... (y)'); }
  // both fingers slide 40 px right, 25 down: a pan, same zoom
  const sc = V.scale; tool.touchMove(1, T(220, 225)); tool.touchMove(2, T(420, 225)); near(V.scale, sc, 1e-9, 'sliding both fingers keeps the zoom');
  { const m = V.toWorld(320, 225); near(m.x, mid0.x, 1e-6, 'and carries the board along (x)'); near(m.y, mid0.y, 1e-6, '... (y)'); }
  // one finger lifts: the pinch is over and the other finger does nothing more
  const ox = V.ox, oy = V.oy; tool.touchUp(2, T(420, 225)); ok(!tool.gesture && tool.spent, 'lifting one finger ends the pinch');
  tool.touchMove(1, T(100, 100)); tool.touchMove(1, T(60, 60)); ok(V.ox === ox && V.oy === oy && !tool.gesture, 'the finger left behind neither pans nor drags');
  tool.touchUp(1, T(60, 60)); ok(!tool.touches.size && !tool.spent, 'all fingers up: back to normal'); ok(b.circuit.encode() === net && b.selId == null, 'the pinch changed nothing in the circuit');
  // pinching in stops at the minimum zoom, pinching out at the maximum
  tool.touchDown(1, T(100, 200), true); tool.touchDown(2, T(500, 200), false); tool.touchMove(1, T(279, 200)); tool.touchMove(2, T(281, 200)); near(V.scale, View.MIN, 1e-9, 'pinch in stops at the minimum'); tool.touchUp(1, T(279, 200)); tool.touchUp(2, T(281, 200));
  tool.touchDown(1, T(270, 200), true); tool.touchDown(2, T(290, 200), false); tool.touchMove(1, T(10, 200)); tool.touchMove(2, T(550, 200)); near(V.scale, View.MAX, 1e-9, 'pinch out stops at the maximum'); tool.touchUp(1, T(10, 200)); tool.touchUp(2, T(550, 200));
  // the view never leaves the board, however it is pinched
  { const B = V.board, a = V.toWorld(0, 0), z = V.toWorld(V.w, V.h); ok(a.x >= B.x0 - 1e-6 && a.y >= B.y0 - 1e-6 && z.x <= B.x1 + 1e-6 && z.y <= B.y1 + 1e-6, 'still on the board after pinching'); } }
// a second finger landing mid-drag cancels the drag: the part goes back, nothing is recorded
{ const { PinchGesture } = L; const b = bench('series'), tool = new PointerTool(b), V = b.view, r1 = b.circuit.ofType(Resistor)[0], net = b.circuit.encode(), undo = b.history.past.length;
  const T = (p, dx, dy) => ({ ...at(b, p, dx, dy), coarse: true }), c = r1.center();
  tool.touchDown(5, T(c), true); for (let i = 1; i <= 6; i++) tool.touchMove(5, T({ c: c.c, r: c.r - i * 0.5 })); ok(b.circuit.encode() !== net, 'one finger drags a part');
  tool.touchDown(6, T({ c: c.c + 6, r: c.r }), false); ok(tool.gesture instanceof PinchGesture && b.circuit.encode() === net, 'a second finger puts it back and starts a pinch');
  tool.touchUp(5, T(c)); tool.touchUp(6, T(c)); ok(b.circuit.encode() === net && b.history.past.length === undo, 'nothing recorded'); clean(b, 'after a cancelled touch drag'); }
// one finger still does everything a mouse does: tap selects, drag from a terminal lays a wire, drag on empty board pans
{ const b = load('r14.10-18.10@10 r14.16-18.16@20'), tool = new PointerTool(b), T = (p, dx, dy) => ({ ...at(b, p, dx, dy), coarse: true }), rs = b.circuit.ofType(Resistor);
  tool.touchDown(1, T(P.of(16, 10), 3, 5), true); tool.touchMove(1, T(P.of(16, 10), 8, 9)); tool.touchUp(1, T(P.of(16, 10), 8, 9)); ok(b.selId === rs[0].id, 'a tap that wobbles 6 px still selects (not a drag)'); ok(b.circuit.encode() === 'r14.10-18.10@10_r14.16-18.16@20', 'and moves nothing');
  // a finger 10 px off a terminal still grabs it (a mouse would have to be within 7)
  tool.touchDown(1, T(P.of(18, 10), 7, -7), true); for (let i = 1; i <= 6; i++) tool.touchMove(1, T(P.of(18, 10 + i))); tool.touchUp(1, T(P.of(18, 16))); ok(b.circuit.wires.length >= 1, 'a finger near a terminal lays a wire from it'); clean(b, 'after a touch wire');
  ok(b.circuit.encode().includes('w18.10-18.16'), 'the wire runs terminal to terminal: ' + b.circuit.encode());
  const ox = b.view.ox; tool.touchDown(1, T(P.of(24.5, 20.5)), true); tool.touchMove(1, T(P.of(26.5, 20.5))); tool.touchMove(1, T(P.of(27.5, 20.5))); tool.touchUp(1, T(P.of(27.5, 20.5))); ok(b.view.ox !== ox || !b.view.auto, 'one finger on empty board pans');
  // a third finger is ignored; a missed lift is cleared by the next first finger
  tool.touchDown(1, T(P.of(24.5, 20.5)), true); tool.touchDown(2, T(P.of(28.5, 20.5)), false); tool.touchDown(3, T(P.of(30.5, 24.5)), false); ok(tool.touches.size === 2, 'a third finger is ignored');
  tool.touchDown(9, T(P.of(24.5, 20.5)), true); ok(tool.touches.size === 1 && !(tool.gesture instanceof L.PinchGesture), 'a new first finger clears stale ones'); tool.touchUp(9, T(P.of(24.5, 20.5))); ok(!tool.gesture, 'and ends cleanly'); }

// ---- a meter's graph, opened part-way through a run, shows the run from its start ----
{ const b = bench('rc'), am = b.circuit.ofType(Ammeter)[0]; ok(!am.graph, 'RC preset opens with the graphs off'); run(b.sim, 2);
  b.toggleGraph(am); ok(am.graph && am.samples.length > 100 && am.samples[0][0] < 0.01, 'graph opened at t = 2 s has the trace from t = 0 (' + am.samples.length + ' samples from t = ' + am.samples[0][0] + ')');
  near(Math.abs(am.samples[0][1]), 6 / 220, 2e-3, 'starting at the full charging current');
  b.toggleGraph(am); b.toggleGraph(am); ok(am.samples[0][0] < 0.01, 'closing and re-opening the graph keeps it'); b.sim.reset(); ok(am.samples.length <= 1, 't = 0 clears it'); }

// ---- a detour may end on the wire that already leads to where it was aimed ----
// (ground beside a battery whose bottom terminal is boxed in by its own lead: the only way in is to meet that lead)
{ const b = load('g20.12-20.14 b17.11-17.15@6 r23.13-27.13@10 l20.8-24.8@1 s20.18-24.18@0 w17.8-20.8 w24.8-27.8 w23.14-24.14 w17.15-20.15 w17.8-17.11 w27.8-27.13 w23.13-23.14 w24.14-24.18 w20.15-20.18'), tool = new PointerTool(b);
  const before = b.circuit.wires.length; drag(b, tool, P.of(20, 12), P.of(17, 15));
  ok(b.circuit.wires.length > before && !(b.notice && b.notice.bad), 'ground to the battery terminal: routed to meet the terminal\'s lead (' + (b.notice && b.notice.text) + ')'); clean(b, 'after the joining detour');
  const { comp } = Circuit.components(b.circuit.wireEdges()); ok(comp.get('20,12') != null && comp.get('20,12') === comp.get('17,15'), 'the ground is now wired to the battery terminal');
  ok(b.circuit.encode().includes('w19.12-19.15') || b.circuit.encode().includes('w18.12-18.15'), 'by the short way round: ' + b.circuit.encode().split('_').filter((t) => /^w1[89]/.test(t)).join(' '));
  // dragging between two points that a wire already joins is still refused, not re-routed
  const n2 = b.circuit.wires.length; ok(b.circuit.detour(P.of(19, 12), P.of(17, 15)) === null, 'no detour between points already joined by wire'); ok(b.circuit.wires.length === n2, 'and nothing added'); }

console.log(bad ? bad + ' of ' + n + ' FAILED' : 'fixes: all ' + n + ' checks passed');
