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
// RC charging against the exact curve (the RC preset: 6 V, 4.7 kΩ, 0.47 mF, tau = 2.209 s)
{ const b = bench('rc'), cap = b.circuit.ofType(Capacitor)[0]; let worst = 0;
  for (let k = 1; k <= 10; k++) { run(b.sim, 0.5); worst = Math.max(worst, Math.abs(Math.abs(cap.vc) - 6 * (1 - Math.exp(-b.sim.t / 2.209)))); }
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
  near(Math.abs(vm.number(b.sol)), 0, 1e-4, 'RC at t = 0: capacitor voltage is zero'); near(Math.abs(am.number(b.sol)), 6 / 4700, 1e-6, 'RC at t = 0: I = emf / R'); }

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
  b.type('value', 500000); ok(r1.value === 100000, 'clamped to the maximum'); ok(b.notice && /between 0\.5 Ω and 100 kΩ/.test(b.notice.text) && !b.notice.bad, 'range notice: ' + (b.notice && b.notice.text));
  b.type('value', 500); ok(r1.value === 500 && !b.notice, 'an allowed value clears it'); b.endTyping();
  b.select(bat); b.type('ri', 80); ok(bat.ri === 50 && b.notice && /Internal resistance is kept between 0 Ω and 50 Ω/.test(b.notice.text), 'internal resistance range: ' + (b.notice && b.notice.text)); b.endTyping(); }

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
// F44: three figures in µA, mA or A, so a kΩ circuit's currents are not all "0.5 mA" or "0 mA"
ok(Fmt.A(0) === '0 mA' && Fmt.A(2e-8) === '0 mA' && Fmt.A(6e-5) === '60.0 µA' && Fmt.A(0.00048) === '480 µA' && Fmt.A(0.00128) === '1.28 mA' && Fmt.A(0.0273) === '27.3 mA' && Fmt.A(0.6) === '600 mA' && Fmt.A(0.9997) === '1.00 A' && Fmt.A(1.5) === '1.50 A' && Fmt.A(48) === '48.0 A', 'currents: ' + [0, 2e-8, 6e-5, 0.00048, 0.00128, 0.0273, 0.6, 0.9997, 1.5, 48].map(Fmt.A).join(' | '));
{ const R = L.Resistor; ok(R.say(220) === '220 Ω' && R.say(999) === '999 Ω' && R.say(1000) === '1 kΩ' && R.say(4700) === '4.7 kΩ' && R.say(100000) === '100 kΩ' && R.say(0.5) === '0.5 Ω', 'resistances from 1000 Ω up are written in kΩ: ' + [220, 1000, 4700, 100000].map((x) => R.say(x)).join(' | '));
  // the current dots: faster for more current over the whole range, and never stopped or a blur
  const sp = [6e-5, 0.00048, 0.002, 0.027, 0.6, 12].map(L.Painter.speed); ok(sp.every((v, i) => !i || v > sp[i - 1] + 5), 'more current, visibly faster dots: ' + sp.map((v) => v.toFixed(0)).join(' ')); ok(sp[0] > 10 && sp[5] < 160, 'between a crawl and a blur'); }
ok(Fmt.signedA(-1e-9) === '0 mA' && Fmt.signedA(-0.02) === '−20.0 mA', 'signed zero has no sign'); ok(Fmt.V(-0.001) === '0.00 V' && Fmt.V(1.5) === '+1.50 V', 'voltages'); ok(Fmt.Q(0) === '0 mC' && Fmt.Q(1e-13) === '0 mC', 'no charge is 0 mC');

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
  const b = bench('series'); ok(b.view.auto && inView(b), 'a preset starts in view'); const ox0 = b.view.ox; b.add('volt'); ok(inView(b), 'a new part lands in view'); ok(b.view.ox === ox0, 'and the view does not jump for it');
  let moved = 0; for (let i = 0; i < 14; i++) { const r = b.nudge(1, 0); if (r && r.ok) moved++; ok(inView(b), 'nudge right ' + (i + 1) + ': still in view'); } ok(moved >= 8, 'the part really travelled (' + moved + ' steps)'); ok(b.view.ox !== ox0 || b.view.scale !== 1, 'so the view had to follow');
  // (a circuit with no room under it: the new part lands beside it, and the view follows it there)
  { const t = bench('parallel'); t.add('volt'); ok(inView(t), 'a new part beside a tall circuit is brought into view'); }
  // once the user has taken the view over, it is left alone
  const c = bench('series'); c.add('volt'); c.view.zoomBy(1.25); const s0 = c.view.scale, o0 = c.view.ox; for (let i = 0; i < 14; i++) c.nudge(1, 0); ok(c.view.scale === s0 && c.view.ox === o0, 'a view the user set is not touched'); }

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
  const draw = (o) => { texts.length = 0; new GraphPainter().draw(g, { dpr: 1, w: 550, h: 150, top: 0, t: 2, origin: 0, hover: null, ...o }); return texts.slice(); };
  const axis = (peak, size) => draw({ ...size, traces: [{ kind: 'amm', name: 'A1', shown: true, samples: [[0, 0], [1, peak / 2], [2, peak]] }] });
  const lo = axis(0.82), hi = axis(1.2);
  ok(lo.includes('mA') && lo.includes('1000'), 'up to 1 A the axis is in mA: ' + lo.join(' ')); ok(hi.includes('A') && !hi.includes('mA') && !hi.includes('1500') && hi.includes('1.5'), 'from 1 A it is in A: ' + hi.join(' '));
  // F41: ... and in µA below 1 mA, so a kΩ circuit's trace is not a flat line on a 0-10 mA axis
  const tiny = axis(0.00042); ok(tiny.includes('µA') && tiny.includes('400') && !tiny.includes('mA'), 'below 1 mA the axis is in µA: ' + tiny.join(' '));
  // F42: the graph draws at whatever size it is given: more marks on both axes when it is enlarged
  const small = axis(0.82, { w: 294, h: 150 }), big = axis(0.82, { w: 550, h: 392, top: 30 }), marks = (list) => list.filter((x) => /^−?\d+(\.\d+)?$/.test(x)).length;
  ok(marks(big) > marks(small) + 4, 'the enlarged graph has more axis marks: ' + marks(small) + ' -> ' + marks(big)); ok(small.includes('2') && !small.includes('1') && big.includes('1'), 'a time mark every second once there is room');
  ok(small.includes('A1') && big.includes('A1'), 'the key names the trace');
  // F43: with the pointer over it, the graph reads each trace off at that instant -- and nothing beyond the present
  const two = [{ kind: 'volt', name: 'V1', shown: true, samples: [[0, 0], [1, 3], [2, 6]] }, { kind: 'amm', name: 'A1', shown: true, samples: [[0, 0], [1, 0.012], [2, 0.024]] }];
  const xAt = (t) => { const x0 = Math.round(9 * 4.2), x1 = 550 - Math.round(9 * 4.8); return x0 + t / 8 * (x1 - x0); };
  const read = draw({ traces: two, hover: xAt(1.001) }); ok(read.includes('t = 1.00 s') && read.includes('V1 +3.00 V') && read.includes('A1 12.0 mA'), 'reads the traces under the pointer: ' + read.join(' | '));
  const ahead = draw({ traces: two, hover: xAt(5) }); ok(!ahead.some((x) => /^t = /.test(x)) && ahead.includes('V1') && ahead.includes('A1'), 'no reading where nothing has happened yet: ' + ahead.join(' | '));
  const hid = draw({ traces: two.map((m) => ({ ...m, shown: false })), hover: xAt(1) }); ok(!hid.some((x) => /3\.00|12\.0 mA/.test(x)), 'hidden traces are not read out: ' + hid.join(' | '));
  // F45: the enlarge button sits against the plot's corner, not over the current axis's numbers; the key keeps clear of it
  ok(GraphPainter.gutter(150, true) === 550 - (xAt(8)) && GraphPainter.gutter(150, false) === 14, 'the strip beside the plot is as wide as the numbers need: ' + GraphPainter.gutter(150, true));
  const narrow = { w: 180, h: 150, traces: two }; ok(draw(narrow).includes('V1') && !draw({ ...narrow, clear: 28 }).includes('V1'), 'no key where it would run under the button');
  ok(GraphPainter.at([[0, 5], [1, 6], [2, 7]], 1.5)[1] === 6, 'the sample at or before a time'); ok(GraphPainter.at([[1, 6]], 0.5) === null, 'nothing before the first sample');
  // F60: volts and amps share one zero line, placed where it leaves the more squeezed axis the most room
  const Z = (...e) => GraphPainter.zero(e.map(([n, p]) => ({ n, p })));
  ok(Z([0, 6]) === 0 && Z([3, 0]) === 1, 'one axis, all one sign: zero on the edge'); near(Z([2, 6]), 0.25, 1e-9, 'one axis, both signs: zero where the trace needs it');
  near(Z([6, 6], [0.5, 0.5]), 0.5, 1e-9, 'two swings about zero: zero in the middle'); near(Z([0, 6], [1.5, 0]), 0.5, 0.011, 'a positive voltage and a negative current: half the plot each');
  { const z = Z([0, 12], [400, 600]); ok(z > 0.25 && z < 0.4, 'a positive voltage and a current that swings: zero a third of the way up (' + z + ')'); }
  { const lines = []; const gl = new Proxy({}, { get: (t, k) => k === 'moveTo' ? (x, y) => { t.at = [x, y]; } : k === 'lineTo' ? (x, y) => lines.push([t.at, [x, y]]) : k === 'measureText' ? () => ({ width: 10 }) : (k === 'createRadialGradient') ? () => grad : (typeof k === 'string' && /^[a-z]/.test(k) && !(k in t) ? () => {} : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
    const wave = (A, off) => { const s = []; for (let i = 0; i <= 1000; i++) s.push([i * 0.002, off + A * Math.sin(2 * Math.PI * i * 0.002)]); return s; };
    new GraphPainter().draw(gl, { dpr: 1, w: 550, h: 150, top: 0, t: 2, origin: 0, hover: null, traces: [{ kind: 'volt', name: 'V1', shown: true, samples: wave(3, 6) }, { kind: 'amm', name: 'A1', shown: true, samples: wave(0.4, 0) }] });
    const across = lines.filter(([a, b]) => a && a[1] === b[1] && Math.abs(b[0] - a[0]) > 300).map(([a]) => a[1]), y0 = Math.round(9 * 2.5), y1 = 150 - Math.round(9 * 2.9);
    ok(across.some((y) => y > y0 + 20 && y < y1 - 20), 'with a current that goes negative the zero line is inside the plot, not on its bottom edge'); }
  // F61: the span button steps down through the spans and round again; a short span has marks a fraction of a second apart
  { const G = new GraphPainter(); ok(G.span === 8, 'the graph opens 8 s across'); const seen = []; for (let i = 0; i < 6; i++) seen.push(G.shorter()); ok(seen.join() === '4,2,1,0.5,16,8', 'the span button: ' + seen.join(' '));
    G.span = 0.5; texts.length = 0; G.draw(g, { dpr: 1, w: 550, h: 150, top: 0, t: 2, origin: 0, hover: null, traces: two }); ok(texts.includes('1.90') && texts.includes('2.00') && !texts.includes('1.40'), 'half a second across: marks every 0.05 s, ending now: ' + texts.join(' '));
    G.span = 16; texts.length = 0; G.draw(g, { dpr: 1, w: 550, h: 150, top: 0, t: 2, origin: 0, hover: null, traces: two }); ok(texts.includes('16') && texts.includes('2') && !texts.includes('1'), '16 s across: a mark every 2 s: ' + texts.join(' ')); }
  // F62: a trace costs what the plot is wide, not what it holds: samples sharing a pixel column are drawn as one stroke
  { let n = 0; const gp = { moveTo() { n++; }, lineTo() { n++; } }, s = []; for (let i = 0; i < 8000; i++) s.push([i * 0.002, Math.sin(i * 0.6)]);
    GraphPainter.path(gp, s, 0, (t) => 40 + t / 16 * 470, (v) => 70 - 40 * v); ok(n > 900 && n < 4 * 2 * 470 + 8, '8000 samples across 470 px: ' + n + ' path points');
    const ys = []; GraphPainter.path({ moveTo(x, y) { ys.push(y); }, lineTo(x, y) { ys.push(y); } }, s, 0, (t) => 40 + t / 16 * 470, (v) => 70 - 40 * v); ok(Math.min(...ys) < 30.5 && Math.max(...ys) > 109.5, 'and the peaks are still drawn');
    let m = 0; GraphPainter.path({ moveTo() { m++; }, lineTo() { m++; } }, s, 15.9, (t) => t * 1000, (v) => v); ok(m === 50, 'only the samples inside the span are drawn (' + m + ')'); }
  // F63: a trace keeps the graph's longest span, and no more than Meter.KEEP samples
  { const { Trace, Meter: Mt } = L, s = []; for (let i = 0; i < 20000; i++) Trace.put(s, i * 0.002, Math.sin(i), Mt.KEEP); ok(s.length <= Mt.KEEP && s[s.length - 1][0] - s[0][0] >= 16, 'after 40 s a trace holds ' + s.length + ' samples covering ' + (s[s.length - 1][0] - s[0][0]).toFixed(1) + ' s');
    ok(L.Scope.KEEP >= 8001 + Trace.BLOCK, 'a part\'s own trace keeps the longest span too'); }
  // F64: a meter that reads nothing yet gets a plain 0 to 1 V / 0 to 10 mA axis, not 1.2 V / 12 mA
  { const flat = (kind) => draw({ w: 550, h: 392, top: 30, traces: [{ kind, name: 'M1', shown: true, samples: [[0, 0], [1, 0], [2, 0]] }] });
    const v = flat('volt'), a = flat('amm'); ok(v.includes('1') && !v.includes('1.2') && !v.includes('1.5'), 'a flat voltage trace: 0 to 1 V (' + v.join(' ') + ')'); ok(a.includes('10') && !a.includes('12') && !a.includes('15'), 'a flat current trace: 0 to 10 mA (' + a.join(' ') + ')'); } }

// ---- F65: a charge is read to three figures like a current, not to four ----
ok(Fmt.Q(60.68e-3) === '60.7 mC' && Fmt.Q(1.234e-3) === '1.23 mC' && Fmt.Q(0.2) === '200 mC', 'mC to three figures: ' + Fmt.Q(60.68e-3) + ', ' + Fmt.Q(1.234e-3) + ', ' + Fmt.Q(0.2));
ok(Fmt.Q(954.8e-6) === '955 µC' && Fmt.Q(12.34e-6) === '12.3 µC' && Fmt.Q(999.7e-6) === '1.00 mC', 'µC to three figures, and no "1000 µC": ' + Fmt.Q(954.8e-6) + ', ' + Fmt.Q(12.34e-6) + ', ' + Fmt.Q(999.7e-6));
ok(Fmt.Q(-2.5e-3) === '−2.50 mC' && Fmt.Q(42e-9) === '42.0 nC' && Fmt.Q(1.5) === '1.50 C', 'signed, nC and whole coulombs: ' + Fmt.Q(-2.5e-3) + ', ' + Fmt.Q(42e-9) + ', ' + Fmt.Q(1.5));
// ---- F67: an AC source's value is an amplitude, and its label says so ("6 V peak", then the frequency) ----
{ const src = new L.AcSource(P.of(4, 6), P.of(4, 10), 6); src.setFreq(0.8); const lines = L.PAINTERS.ac.label(src, 'AC1', {}).lines.map((l) => l.t);
  ok(lines.join(' | ') === 'AC1 | 6 V peak | 0.8 Hz', 'the AC source label: ' + lines.join(' | ')); ok(new L.Battery(P.of(4, 6), P.of(4, 10), 6).valueText() === '6 V', 'a battery is still plain volts'); }
// ---- F68: a notice keeps off the part labels too, not only the parts (with the graph docked, R1's label is at the top edge) ----
{ const { Renderer } = L, b = new Workbench(); b.view.resize(560, 245); b.loadPreset('ac'); const r = new Renderer(), sc = { circuit: b.circuit, names: b.circuit.labels(), sol: b.sol, hide: false, revealed: () => true, view: b.view };
  r.labels = Renderer.layout(null, sc); const g = new Proxy({}, { get: (t, k) => k === 'measureText' ? (x) => ({ width: 5.25 * String(x).length }) : (typeof k === 'string' && /^[a-z]/.test(k) && !(k in t) ? () => {} : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
  const was = Renderer.roundRect; let box = null; Renderer.roundRect = (g2, x, y, w, h) => { box = { x0: x, y0: y, x1: x + w, y1: y + h }; };
  try { r.message(g, { text: 'The AC source is now connected the other way round (F flips it back)', alpha: 1 }, sc); } finally { Renderer.roundRect = was; }
  const under = [...r.labels.values()].filter((Lb) => { const p = b.view.toCanvas(Lb.x0, Lb.y0), q = b.view.toCanvas(Lb.x1, Lb.y1); return p.x < box.x1 && q.x > box.x0 && p.y < box.y1 && q.y > box.y0; });
  ok(box && under.length === 0, 'the notice covers no label (box ' + (box ? [box.x0, box.y0, box.x1, box.y1].map(Math.round).join(',') : 'none') + ', ' + under.length + ' labels under it)');
  const hitP = b.circuit.parts.filter((e) => { const o = L.PAINTERS[e.type].box(e), p = b.view.toCanvas(o.x0, o.y0), q = b.view.toCanvas(o.x1, o.y1); return p.x < box.x1 && q.x > box.x0 && p.y < box.y1 && q.y > box.y0; });
  ok(hitP.length === 0, 'nor a part (' + hitP.map((e) => e.type) + ')'); ok(box.x0 >= 0 && box.x1 <= 560 && box.y0 >= 0 && box.y1 <= 245, 'and it is inside the canvas');
  ok(!(box.x1 > 560 - 140 && box.y1 > 245 - 46), 'and off the zoom buttons');
  // an empty board: on one line, in the middle of the top edge, as before
  const e = new Workbench(); e.view.resize(560, 400); const r2 = new Renderer(); r2.labels = new Map(); Renderer.roundRect = (g2, x, y, w, h) => { box = { x0: x, y0: y, x1: x + w, y1: y + h }; };
  try { r2.message(g, { text: 'Nothing to undo', alpha: 1 }, { circuit: e.circuit, view: e.view }); } finally { Renderer.roundRect = was; }
  ok(Math.abs((box.x0 + box.x1) / 2 - 280) < 0.01 && box.y0 === 8 && box.y1 - box.y0 === 26, 'an empty board: top middle, one line (' + [box.x0, box.y0, box.x1, box.y1].map(Math.round) + ')'); }
// ---- F66: the summary names the button as it is labelled ("Run", not "Play") ----
{ const { Panel } = L, b = bench('rlc'); b.sim.playing = false; const text = new Panel({ bench: b, state: { hide: false, peek: {} } }).summary().summaryText; ok(/Press ▶ Run/.test(text) && !/Play/.test(text), 'paused: ' + text); }

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
  near(Math.abs(am.samples[0][1]), 6 / 4700, 1e-4, 'starting at the full charging current');
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

// ---- F40: a turn is the turn asked for, or nothing ----
// (Seth, 2026-11-10: "rotate left wasn't acting consistently". A wired part used to fall back to
//  the opposite quarter turn, or to a turn about one end, whenever its wires could not follow:
//  a third of all turns on the presets were not the turn asked for.)
{ const seqs = [[1, 1, 1, 1], [-1, -1, -1, -1], [1, -1, 1, -1], [-1, 1, -1, 1], [1, 1, -1, -1], [-1, -1, 1, 1]]; let turns = 0, refused = 0;
  for (const name of ['single', 'series', 'parallel', 'bridge', 'rc', 'rl', 'rlc']) { const count = PRESETS.build(name).parts.length;
    for (let idx = 0; idx < count; idx++) for (const seq of seqs) { const b = bench(name), c = b.circuit, el = c.parts[idx]; if (!el.info.rotatable) continue;
      const home = JSON.stringify(el.geometry()), tag = name + ' ' + el.type + '#' + idx + ' ' + seq.join(''); let all = true; b.select(el);
      for (const d of seq) { const want = JSON.stringify(el.rotated(d)), was = c.encode(), r = b.rotate(d); turns++;
        if (r.ok) ok(JSON.stringify(el.geometry()) === want, tag + ': the part was turned some other way'); else { refused++; all = false; ok(c.encode() === was, tag + ': a refused turn changed the circuit'); ok(b.notice && b.notice.bad, tag + ': a refused turn says why'); }
        ok(b.turn && b.turn.id === el.id && b.turn.dir === d && b.turn.ok === r.ok, tag + ': the picture is told which way it turned');
        clean(b, tag); ok(b.sol && b.sol.solved, tag + ': still solves'); }
      if (all) ok(JSON.stringify(el.geometry()) === home, tag + ': four turns (or there and back) come home'); } }
  ok(turns > 700 && refused < turns / 10, 'turns tried: ' + turns + ', refused: ' + refused); }
// a wired battery turned half way round is reversed, and says so; the other way round it is reversed back
{ const b = bench('series'), bat = b.circuit.ofType(Battery)[0], R = b.circuit.ofType(Resistor)[0], I0 = b.sol.current(R); b.select(bat);
  b.rotate(1); near(b.sol.current(R), I0, 1e-9, 'a quarter turn leaves the circuit alone'); ok(!b.notice, 'and says nothing');
  b.rotate(1); near(b.sol.current(R), -I0, 1e-9, 'a half turn reverses the battery'); ok(b.notice && !b.notice.bad && /other way round/.test(b.notice.text), 'and says so: ' + (b.notice && b.notice.text));
  b.rotate(-1); b.rotate(-1); near(b.sol.current(R), I0, 1e-9, 'two turns back undo it'); }
// a part with no direction is the same part end for end: a charged capacitor keeps its charge where it was
{ const b = bench('rc'), cap = b.circuit.ofType(Capacitor)[0], R = b.circuit.ofType(Resistor)[0]; run(b.sim, 3); const drop = () => b.sol.drop(P.of(24, 11), P.of(24, 15)), v0 = drop(), I0 = b.sol.current(R);
  ok(Math.abs(v0) > 3, 'charged: ' + v0); b.select(cap); const a0 = P.key(cap.a); b.rotate(-1); b.rotate(-1); ok(P.key(cap.b) === a0, 'turned end for end');
  near(drop(), v0, 1e-6, 'the same plate is still the positive one'); near(b.sol.current(R), I0, 1e-6, 'and the current did not jump'); ok(!b.notice, 'nothing to report: ' + (b.notice && b.notice.text)); }
{ const b = bench('rl'), ind = b.circuit.ofType(Inductor)[0], sw = b.circuit.ofType(Switch)[0], R = b.circuit.ofType(Resistor)[0]; if (!sw.closed) b.toggle(sw); run(b.sim, 2); const I0 = b.sol.current(R);
  ok(Math.abs(I0) > 0.3, 'current built up: ' + I0); b.select(ind); b.rotate(-1); b.rotate(-1); near(b.sol.current(R), I0, 1e-6, 'an inductor turned end for end carries on'); ok(!b.notice, 'no spark: ' + (b.notice && b.notice.text)); }

// ---- F69: a part that has been turned does not leave a staircase in its wiring (same length of wire, fewer corners) ----
{ const b = bench('ac'), c = b.circuit, src = c.elements.find((e) => e.type === 'ac'); b.select(src); ok(b.rotate(-1).ok, 'the AC source turns anticlockwise'); clean(b, 'turned source');
  const enc = c.encode(), corners = (c2) => { const E = c2.wireEdges(), adj = Circuit.adjacency(E); let nb = 0; for (const [k, l] of adj) if (l.length === 2) { const p = P.parse(k), q = P.parse(l[0]), r = P.parse(l[1]); if (q.c !== r.c && q.r !== r.r) nb++; } return nb; };
  ok(/w8\.10-13\.10/.test(enc) && /w8\.10-8\.13/.test(enc), 'its + lead is one elbow up to the top wire, not a staircase: ' + enc);
  ok(corners(c) === 3, 'three corners in the whole circuit, where there were five (' + corners(c) + ')');
  b.undo(); ok(c.encode().includes('w10.10-13.10') && c.encode().includes('w10.10-10.11'), 'undo puts the old wiring back');
  // a wire the user took the long way round stays the long way round: only a staircase is straightened
  const u = load('b8.10-8.14@6 w8.10-8.6 w8.6-16.6 w16.6-16.10 r16.10-16.14@10 w16.14-16.18 w16.18-8.18 w8.18-8.14'), bat = u.circuit.ofType(Battery)[0], len = () => u.circuit.wireEdges().size, was = len();
  u.select(bat); const r = u.circuit.move(bat, 0, 1); ok(r.ok, 'the battery of a roomy loop moves down one'); clean(u, 'roomy loop');
  ok(len() === was, 'and the loop is as roomy as it was (' + was + ' -> ' + len() + ' edges of wire)'); ok(u.circuit.encode().includes('w8.6-16.6'), 'its top run stays put'); }

// ---- F70: a turn or a move that is refused for want of room names the part that is in the way ----
{ const b = bench('rc'), c = b.circuit, sw = c.ofType(ThrowSwitch)[0]; b.select(sw); ok(b.rotate(1).ok, 'the two-position switch turns once'); clean(b, 'turned throw switch');
  const r = b.rotate(1); ok(!r.ok, 'the next quarter turn would lay it on the resistor: refused'); ok(b.notice && b.notice.text === 'Can’t rotate S₁ — R₁ is in the way', 'and the notice says which part: ' + (b.notice && b.notice.text));
  ok(b.turn && b.turn.ok === false, 'the picture shows the turn being refused');
  const g = load('b8.10-8.14@6 g8.14-8.16'), bat = g.circuit.ofType(Battery)[0]; g.select(bat); const m = g.nudge(0, 1); ok(!m.ok && g.notice.text === 'Can’t move the battery there — the ground is in the way', 'a part with no label is named by what it is: ' + g.notice.text); }

// ---- F71: a battery circuit with a gap in it says why every reading is zero ----
{ const { Panel } = L, text = (b) => new Panel({ bench: b, state: { hide: false, peek: {} } }).summary().summaryText;
  const gap = load('b8.10-8.14@6 w8.10-12.10 r12.10-16.10@1000 w16.10-20.10 w20.14-8.14 g8.14-8.16'); ok(/No current is flowing/.test(text(gap)), 'a loop with a gap: ' + text(gap));
  ok(!/No current/.test(text(bench('series'))), 'a closed loop: ' + text(bench('series')));
  const rc = bench('rc'); run(rc.sim, 30); ok(!/No current/.test(text(rc)), 'a charged capacitor is not a gap: ' + text(rc));
  const cut = bench('rc'); cut.select(cut.circuit.ofType(Capacitor)[0]); cut.remove(); ok(/No current is flowing/.test(text(cut)), 'the RC preset with its capacitor taken out: ' + text(cut));
  const sw = bench('rl'), s1 = sw.circuit.ofType(Switch)[0]; if (s1.closed) sw.toggle(s1); ok(!/No current is flowing/.test(text(sw)), 'an open switch has its own message: ' + text(sw)); }

// ---- F72: a label is not put on the far side of a wire from its part when there is room beside the part ----
{ const jumps = (c, ls) => { const lay = Renderer.layout(null, { circuit: c, names: c.labels(), sol: null, hide: true, revealed: () => false, view: { labelScale: ls } }), out = [];
    for (const el of c.parts) { const B = lay.get(el.id); if (!B) continue; const ctr = View.xy(el.center()), hz = el.horizontal();
      const lane = hz ? { x0: B.x0, x1: B.x1, y0: B.ny < 0 ? B.y1 : ctr.y, y1: B.ny < 0 ? ctr.y : B.y0 } : { x0: B.nx < 0 ? B.x1 : ctr.x, x1: B.nx < 0 ? ctr.x : B.x0, y0: B.y0, y1: B.y1 };
      for (const w of c.elements) { if (!w.isWire) continue; const a = View.xy(w.a), b2 = View.xy(w.b), ink = { x0: Math.min(a.x, b2.x) - 1, x1: Math.max(a.x, b2.x) + 1, y0: Math.min(a.y, b2.y) - 1, y1: Math.max(a.y, b2.y) + 1 };
        // (the part's own leads start at its ends, inside the lane's near edge: only a wire that lies wholly clear of the part counts)
        const own = PAINTERS[el.type].box(el), clear = ink.x1 < own.x0 || ink.x0 > own.x1 || ink.y1 < own.y0 || ink.y0 > own.y1;
        if (clear && ink.x0 < lane.x1 && ink.x1 > lane.x0 && ink.y0 < lane.y1 && ink.y1 > lane.y0) { out.push(c.labels().get(el.id).text + ' over ' + w.encode()); break; } } }
    return out; };
  // the hand-built AC loop with its resistor turned upright between two wires, zoomed out (labels at 1.45)
  const c = Circuit.decode('g20.12-20.14_o17.11-17.15@6~0.5_r25.11-25.15@1000_l20.8-24.8@1_c20.18-24.18@10_a27.9-27.13_v24.20-20.20_w17.8-20.8_w24.8-27.8_w23.14-24.14_w17.15-19.15_w19.15-20.15_w25.15-27.15_w19.12-20.12_w23.11-25.11_w17.8-17.11_w27.8-27.9_w27.13-27.15_w23.11-23.14_w24.14-24.18_w24.18-24.20_w20.15-20.18_w20.18-20.20_w19.12-19.15', Workbench.NC, Workbench.NR);
  for (const ls of [1, 1.2, 1.45]) ok(jumps(c, ls).length === 0, 'no label across a wire at label scale ' + ls + ': ' + jumps(c, ls).join(', '));
  for (const name of Object.keys(PRESETS.nets)) for (const ls of [1, 1.2, 1.45]) { const b = bench(name); ok(jumps(b.circuit, ls).length === 0, name + ' preset, label scale ' + ls + ': ' + jumps(b.circuit, ls).join(', ')); } }

// ---- F73: a value axis is never left with just "0" and one number.
// The RLC preset's ringing current (-380..+490 mA beside a 0..10 V trace) got marks every 500 mA: two in all.
{ const { GraphPainter } = L; const few = GraphPainter.marks(-400, 933, 253).list;
  ok(few.length === 2, 'the plain rule gives that axis two marks (' + few.join(',') + ')');
  const T = GraphPainter.axisMarks(-400, 933, 253);
  ok(T.list.length >= 3, 'the axis gets at least three marks: ' + T.list.join(','));
  ok(T.step === 200 && T.list.includes(0), 'they are round, and zero is one of them: step ' + T.step);
  const same = GraphPainter.axisMarks(-5, 12, 4.1); ok(same.step === 5 && same.list.join(',') === '-5,0,5,10', 'an axis with enough marks is left alone: ' + same.list.join(','));
  const tight = GraphPainter.axisMarks(0, 1.2, 0.9); ok(tight.list.length >= 3 || tight.step >= 0.5, 'never finer than 0.6 of the room a mark needs: step ' + tight.step); }

// ---- F74: "this instant" is the instant: closing a switch on an inductor shows no current yet, and edits made while
// paused do not let time creep (each used to move the circuit on by a ten-millionth of a second).
{ const b = bench('rl'), c = b.circuit, sw = c.ofType(Switch)[0], ind = c.ofType(Inductor)[0], am = c.ofType(Ammeter)[0], vm = c.ofType(Voltmeter)[0];
  b.toggle(sw); ok(Math.abs(am.number(b.sol)) < 1e-10, 'RL at t = 0: the ammeter reads nothing, got ' + am.number(b.sol));
  ok(Fmt.signedA(am.number(b.sol)) === '0 mA', 'and prints as 0 mA: ' + Fmt.signedA(am.number(b.sol))); ok(Math.abs(ind.il) < 1e-10, 'the coil has not started to carry current: ' + ind.il);
  near(Math.abs(vm.number(b.sol)), 6, 1e-6, 'all of the emf is across the coil');
  const s = load('b10.11-10.15@24 s10.10-14.10@0 r15.10-19.10@10 a19.10-23.10 l24.11-24.15@0.05 g10.16-10.18 w14.10-15.10 w23.10-24.10 w10.16-24.16 w10.10-10.11 w10.15-10.16 w24.10-24.11 w24.15-24.16');
  const s1 = s.circuit.ofType(Switch)[0], a1 = s.circuit.ofType(Ammeter)[0], l1 = s.circuit.ofType(Inductor)[0]; clean(s, 'smallest coil, biggest battery');
  s.toggle(s1); ok(Fmt.signedA(a1.number(s.sol)) === '0 mA', 'the smallest coil on the biggest battery still reads 0 mA at t = 0: ' + Fmt.signedA(a1.number(s.sol)));
  for (let i = 0; i < 50; i++) s.sim.jolt(); ok(Math.abs(l1.il) < 4e-8, 'fifty edits later it still carries nothing: ' + l1.il); ok(Fmt.signedA(a1.number(s.sol)) === '0 mA', 'and still reads 0 mA');
  run(s.sim, 0.01); near(Math.abs(l1.il), 2.4 * (1 - Math.exp(-0.01 / 0.005)), 0.06, 'then it ramps as it should');
  // a capacitor being charged does not gain charge from edits either
  const r = bench('rc'), cap = r.circuit.ofType(Capacitor)[0]; for (let i = 0; i < 200; i++) r.sim.jolt(); ok(Math.abs(cap.vc) < 1e-9, 'RC at t = 0 after 200 edits: capacitor still empty, ' + cap.vc);
  run(r.sim, 1); const v1 = cap.vc; for (let i = 0; i < 200; i++) r.sim.jolt(); ok(Math.abs(cap.vc - v1) < 1e-9, 'and a part-charged one keeps its voltage through edits: moved ' + (cap.vc - v1));
  // what must change at once still does: the cut inductor and the shared charge are covered above (F6 block); here, the reading after a cut
  const k = bench('rl'), ks = k.circuit.ofType(Switch)[0], ki = k.circuit.ofType(Inductor)[0]; k.toggle(ks); run(k.sim, 2); k.toggle(ks); ok(ki.il === 0, 'a cut coil is dead, exactly: ' + ki.il); ok(Fmt.signedA(k.circuit.ofType(Ammeter)[0].number(k.sol)) === '0 mA', 'and the ammeter says so'); ok(k.notice && /spark/.test(k.notice.text), 'with the spark notice'); }

// ---- F75: the graph's current axis reads in the meters' unit: rounding dust (what a meter prints as 0 mA) is not microamps
{ const { GraphPainter } = L;
  ok(GraphPainter.ampUnit(1.4e-21).unit === 'mA', 'dust does not turn the axis to µA: ' + GraphPainter.ampUnit(1.4e-21).unit);
  ok(GraphPainter.ampUnit(4e-8).unit === 'mA', 'nor does anything a meter prints as 0 mA'); ok(GraphPainter.ampUnit(0).unit === 'mA', 'nothing at all is mA');
  ok(GraphPainter.ampUnit(60e-6).unit === 'µA', 'a real 60 µA is µA'); ok(GraphPainter.ampUnit(0.6).unit === 'mA', '600 mA is mA'); ok(GraphPainter.ampUnit(2.4).unit === 'A', '2.4 A is A'); }

// ---- F76: no label lies on another label, at any label size (zoomed out, the labels are up to 1.45x and a meter's
//      reading could land on the name of the part next to it: the AC preset's C1 went under V1's reading)
{ for (const nm of Object.keys(PRESETS.nets)) { const b = bench(nm); for (const s of b.circuit.ofType(Switch)) if (!s.closed) b.toggle(s); run(b.sim, 1.2); b.sim.refresh();
    for (const ls of [1, 1.15, 1.3, 1.45]) for (const hide of [false, true]) {
      const lay = [...Renderer.layout(null, { circuit: b.circuit, names: b.circuit.labels(), sol: hide ? null : b.sol, hide, revealed: () => false, view: { labelScale: ls } })], hits = [];
      for (let i = 0; i < lay.length; i++) for (let j = i + 1; j < lay.length; j++) { const p = lay[i][1], q = lay[j][1];
        if (p.x0 < q.x1 - 1 && p.x1 > q.x0 + 1 && p.y0 < q.y1 - 1 && p.y1 > q.y0 + 1) hits.push(b.circuit.byId(lay[i][0]).type + ' on ' + b.circuit.byId(lay[j][0]).type); }
      ok(!hits.length, nm + ' at label size ' + ls + (hide ? ' (hidden)' : '') + ': no label on another label (by more than a pixel)' + (hits.length ? ' -- ' + hits.join(', ') : '')); } } }

// ---- F77: a meter's trace is of the reading with its leads as they are now. Swapping the leads (Flip, a half turn,
//      undoing either) turns the whole trace over with the reading, so the graph never shows a jump the circuit did not make
{ const b = bench('rc'), vm = () => b.circuit.ofType(Voltmeter)[0], am = () => b.circuit.ofType(Ammeter)[0]; vm().graph = true; am().graph = true; run(b.sim, 1);
  const tr = (id) => b.sim.traces(null).find((t) => t.id === id).samples, jump = (s) => { let w = 0; for (let i = 1; i < s.length; i++) w = Math.max(w, Math.abs(s[i][1] - s[i - 1][1])); return w; };
  const v0 = vm().number(b.sol), n0 = tr(vm().id).length; ok(Math.abs(v0) > 1 && n0 > 400, 'the voltmeter has a second of trace: ' + v0.toFixed(3) + ' V, ' + n0 + ' samples');
  b.select(vm()); ok(b.flip().ok, 'the voltmeter flips'); near(vm().number(b.sol), -v0, 1e-9, 'its reading changes sign');
  near(tr(vm().id)[n0 - 1][1], -v0, 1e-9, 'and so does what it has recorded, at once (paused or not)'); run(b.sim, 0.5);
  ok(jump(tr(vm().id)) < 0.02, 'no jump in the trace across the swap: ' + jump(tr(vm().id)).toFixed(4) + ' V');
  b.undo(); near(vm().number(b.sim.refresh()), tr(vm().id)[tr(vm().id).length - 1][1], 1e-6, 'undo puts the leads back and the trace with them'); ok(jump(tr(vm().id)) < 0.02, 'still no jump');
  b.redo(); near(vm().number(b.sim.refresh()), tr(vm().id)[tr(vm().id).length - 1][1], 1e-6, 'redo likewise');
  // the ammeter, wired in line, turned end for end by two quarter turns
  const i0 = am().number(b.sol); b.select(am()); b.rotate(1); const r2 = b.rotate(1); ok(r2.ok, 'the ammeter turns half way round'); near(am().number(b.sim.refresh()), -i0, 1e-9, 'its reading changes sign');
  run(b.sim, 0.3); ok(jump(tr(am().id)) < 2e-5, 'no jump in its trace: ' + jump(tr(am().id)).toExponential(2) + ' A');
  // a meter moved somewhere else keeps what it recorded as it was
  const b2 = bench('rc'), v2 = b2.circuit.ofType(Voltmeter)[0]; v2.graph = true; run(b2.sim, 1); const before = b2.sim.traces(null)[0].samples.map((s) => s[1]);
  b2.select(v2); b2.nudge(1, 0); const after = b2.sim.traces(null)[0].samples.map((s) => s[1]); ok(before.every((v, i) => v === after[i]), 'a moved meter keeps its trace unchanged'); }

// ---- F78: a part dropped where a wire turns off under it is refused in words that say what it needs
{ const b = load('g20.12-20.14 o17.11-17.15@6~1.59 r25.11-25.15@3 l20.8-24.8@1 c20.18-24.18@10 a10.13-14.13 w17.11-20.11 w24.11-25.11 w24.18-25.18 w17.15-20.15 w20.8-20.11 w20.11-20.12 w20.15-20.18 w24.8-24.11 w25.15-25.18');
  const am = b.circuit.ofType(Ammeter)[0], r = b.circuit.move(am, 7, 2);            // onto the 3-square wire from the source: its far end lies on the corner
  ok(!r.ok && /4 squares of straight wire/.test(r.why || ''), 'the refusal says how much straight wire the ammeter needs: ' + r.why);
  ok(/turns off part-way along it/.test(r.why || ''), 'and that a wire turns off under it'); }

// ---- F79: a long notice (one that needs two lines at full width) may fold narrower still to find a place clear of the wires
{ const { Renderer } = L, b = load('g20.12-20.14 o17.11-17.15@6~1.59 r25.11-25.15@3 l20.8-24.8@1 c20.18-24.18@10 a10.13-14.13 w17.11-20.11 w24.11-25.11 w24.18-25.18 w17.15-20.15 w20.8-20.11 w20.11-20.12 w20.15-20.18 w24.8-24.11 w25.15-25.18');
  b.fit(); const r = new Renderer(), sc = { circuit: b.circuit, names: b.circuit.labels(), sol: b.sol, hide: false, revealed: () => true, view: b.view }; r.labels = Renderer.layout(null, sc);
  const g = new Proxy({}, { get: (t, k) => k === 'measureText' ? (x) => ({ width: 5.6 * String(x).length }) : (typeof k === 'string' && /^[a-z]/.test(k) && !(k in t) ? () => {} : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
  const was = Renderer.roundRect; let box = null; Renderer.roundRect = (g2, x, y, w, h) => { box = { x0: x, y0: y, x1: x + w, y1: y + h }; };
  try { r.message(g, { text: 'Put back where it was — can’t go there: a wire turns off part-way along it (it needs 4 squares of straight wire)', alpha: 1, bad: true }, sc); } finally { Renderer.roundRect = was; }
  const over = (o) => { const p = b.view.toCanvas(o.x0, o.y0), q = b.view.toCanvas(o.x1, o.y1); return p.x < box.x1 && q.x > box.x0 && p.y < box.y1 && q.y > box.y0; };
  const hitW = b.circuit.wires.filter((e) => over(L.PAINTERS[e.type].box(e))), hitP = b.circuit.parts.filter((e) => over(L.PAINTERS[e.type].box(e))), hitL = [...r.labels.values()].filter(over);
  ok(box && hitW.length === 0, 'a long notice lies on no wire (box ' + [box.x0, box.y0, box.x1, box.y1].map(Math.round).join(',') + ', ' + hitW.length + ' wires under it)');
  ok(hitP.length === 0 && hitL.length === 0, 'nor on a part or a label'); ok(box.x0 >= 0 && box.x1 <= 560 && box.y0 >= 0 && box.y1 <= 400, 'and it is inside the canvas'); }

// ---- F80: while the view is the sim's own choice it follows the circuit both ways: when a part that forced it to
//      zoom out is brought back in, the view grows again (it used to stay small until Fit was pressed)
{ const net = 'g20.12-20.14 o16.11-16.15@6~1.59 r25.11-25.15@3 l20.8-24.8@1 c20.18-24.18@10 a16.15-20.15 v40.30-40.34 w16.11-20.11 w24.11-25.11 w24.18-25.18 w20.8-20.11 w20.11-20.12 w20.15-20.18 w24.8-24.11 w25.15-25.18';
  const mk = () => { const b = new Workbench(); b.view.resize(560, 400); b.replace(Circuit.decode(net.replace(/ /g, '_'), Workbench.NC, Workbench.NR)); return b; };
  const b = mk(), s0 = b.view.scale; ok(s0 < 0.75, 'a circuit with a part far out is zoomed out: ' + s0.toFixed(3));
  const tool = new PointerTool(b), vm = b.circuit.ofType(Voltmeter)[0]; drag(b, tool, { c: 40, r: 32 }, { c: 13, r: 13 }); ok(P.eq(vm.a, { c: 13, r: 11 }), 'the voltmeter is brought in beside the source: ' + b.circuit.encode().match(/v[^_]*/)[0]);
  ok(b.view.scale > s0 * 1.1, 'and the view grows to suit: ' + s0.toFixed(3) + ' -> ' + b.view.scale.toFixed(3)); ok(b.view.auto, 'still the sim\'s own view');
  const fresh = new Workbench(); fresh.view.resize(560, 400); fresh.replace(Circuit.decode(b.circuit.encode(), Workbench.NC, Workbench.NR)); near(b.view.scale, fresh.view.scale, 1e-9, 'to the same view a fresh fit gives');
  const s1 = b.view.scale, o1 = [b.view.ox, b.view.oy].join(); drag(b, tool, { c: 13, r: 13 }, { c: 14, r: 13 }); ok(P.eq(vm.a, { c: 14, r: 11 }), 'one square over'); ok(Math.abs(b.view.scale - s1) < 1e-9 && [b.view.ox, b.view.oy].join() === o1, 'a small move inside the picture leaves the view where it is');
  // a view the user chose is left alone
  const b2 = mk(); b2.view.zoomBy(1.01); ok(!b2.view.auto, 'a zoom by hand'); const s2 = b2.view.scale;
  drag(b2, new PointerTool(b2), { c: 40, r: 32 }, { c: 13, r: 13 }); ok(P.eq(b2.circuit.ofType(Voltmeter)[0].a, { c: 13, r: 11 }), 'moved there too'); ok(b2.view.scale === s2, 'a view the user set does not move'); }

// ---- F81: a meter's reading is wider than the meter once the labels are enlarged (zoomed out), and centred under an
//      ammeter at a corner it lay across the wire turning down from the ammeter's end. It may now sit off-centre.
{ const net = 'g20.12-20.14 o16.11-16.15@6~1.59 r25.11-25.15@3 l20.8-24.8@1 c20.18-24.18@10 a16.15-20.15 v13.11-13.15 w16.11-20.11 w24.11-25.11 w24.18-25.18 w20.8-20.11 w20.11-20.12 w20.15-20.18 w24.8-24.11 w25.15-25.18';
  const b = load(net), c = b.circuit, am = c.ofType(Ammeter)[0]; run(b.sim, 0.3); b.sim.refresh(); const sol = b.sol;
  for (const ls of [1, 1.2, 1.45]) for (const hide of [false, true]) { const lay = Renderer.layout(null, { circuit: c, names: c.labels(), sol: hide ? null : sol, hide, revealed: () => false, view: { labelScale: ls } }), L = lay.get(am.id), on = [];
    for (const w of c.wires) { const a = View.xy(w.a), z = View.xy(w.b); if (Math.min(a.x, z.x) < L.x1 && Math.max(a.x, z.x) > L.x0 && Math.min(a.y, z.y) < L.y1 && Math.max(a.y, z.y) > L.y0) on.push(w.encode()); }
    ok(!on.length, 'label size ' + ls + (hide ? ' (hidden)' : '') + ': the ammeter\'s reading lies across no wire' + (on.length ? ' -- ' + on.join(', ') : ''));
    const mid = View.xy(am.center()).x; ok(L.x0 < mid && L.x1 > mid, 'and is still under (or over) the ammeter'); } }

// ---- F82: with the graph docked the canvas is short and a circuit can fill it. A long notice then folds narrower
//      again (three or four lines) to fit a corner, sooner than lie across a part: it covered the inductor and its name
{ const { Renderer } = L, net = 'g20.12-20.14 o16.15-16.11@6~0.8 r25.11-25.15@3 l20.8-24.8@1 c20.18-24.18@10 a16.15-20.15 v13.11-13.15 r15.17-15.21@1000 w13.11-16.11 w16.11-20.11 w24.11-25.11 w24.18-25.18 w13.15-16.15 w20.8-20.11 w20.11-20.12 w20.15-20.18 w24.8-24.11 w25.15-25.18';
  const b = new Workbench(); b.view.resize(560, 248); b.replace(Circuit.decode(net.replace(/ /g, '_'), Workbench.NC, Workbench.NR));
  const r = new Renderer(), sc = { circuit: b.circuit, names: b.circuit.labels(), sol: b.sol, hide: false, revealed: () => true, view: b.view }; r.labels = Renderer.layout(null, sc);
  const g = new Proxy({}, { get: (t, k) => k === 'measureText' ? (x) => ({ width: 5.6 * String(x).length }) : (typeof k === 'string' && /^[a-z]/.test(k) && !(k in t) ? () => {} : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
  const say = (text) => { const was = Renderer.roundRect; let box = null; Renderer.roundRect = (g2, x, y, w, h) => { box = { x0: x, y0: y, x1: x + w, y1: y + h }; }; try { r.spot = null; r.message(g, { text, alpha: 1, bad: true }, sc); } finally { Renderer.roundRect = was; } return box; };
  const under = (box) => { const over = (o) => { const p = b.view.toCanvas(o.x0, o.y0), q = b.view.toCanvas(o.x1, o.y1); return p.x < box.x1 && q.x > box.x0 && p.y < box.y1 && q.y > box.y0; };
    return b.circuit.parts.filter((e) => over(L.PAINTERS[e.type].box(e))).map((e) => e.type).concat([...r.labels.values()].filter(over).map(() => 'label')); };
  for (const text of ['Put back where it was — can’t go there: a wire turns off part-way along it (it needs 4 squares of straight wire)', 'Put back where it was — can’t go there: AC₁ is in the way', 'Circuit tidied']) { const box = say(text), hit = under(box);
    ok(hit.length === 0, '"' + text.slice(0, 40) + '…" lies on no part or label (box ' + [box.x0, box.y0, box.x1, box.y1].map(Math.round).join(',') + (hit.length ? '; on ' + hit.join(', ') : '') + ')');
    ok(box.x0 >= 0 && box.x1 <= 560 && box.y0 >= 0 && box.y1 <= 248, 'and it is inside the short canvas'); }
  // with nowhere clear at all it takes the place that hides least, not the top edge whatever is there
  const full = 'a '.repeat(150).trim(), box = say(full), solidArea = (bx) => { let a = 0; for (const e of b.circuit.parts) { const o = L.PAINTERS[e.type].box(e), p = b.view.toCanvas(o.x0, o.y0), q = b.view.toCanvas(o.x1, o.y1); a += Math.max(0, Math.min(q.x, bx.x1) - Math.max(p.x, bx.x0)) * Math.max(0, Math.min(q.y, bx.y1) - Math.max(p.y, bx.y0)); } return a; };
  const top = { x0: (560 - (box.x1 - box.x0)) / 2, x1: (560 + (box.x1 - box.x0)) / 2, y0: 8, y1: 8 + box.y1 - box.y0 }; ok(solidArea(box) <= solidArea(top), 'a notice too big for any gap hides no more than it would at the top edge: ' + solidArea(box).toFixed(0) + ' vs ' + solidArea(top).toFixed(0)); }

// ---- F83: a wire that has to go round still ends where it was aimed, when that costs only a few squares more ----
// (ground dragged straight down through its own symbol to the rail below: it used to hook across to the
// switch contact three columns away, because that contact's lead is the same net and two squares nearer)
{ const b = load('g20.12-20.14 b17.11-17.15@6 x26.13-23.12-23.14@0 r27.13-31.13@1000 c27.17-31.17@10 w17.11-23.11 w26.13-27.13 w17.17-23.17 w23.17-27.17 w23.11-23.12 w23.14-23.17 w31.13-31.17 w17.15-17.17'), tool = new PointerTool(b);
  drag(b, tool, P.of(20, 12), P.of(20, 17)); const E = b.circuit.wireEdges(); clean(b, 'F83 ground wire');
  ok(E.has(P.edge(P.of(20, 16), P.of(20, 17))), 'the ground wire comes down onto the rail at the point aimed at: ' + b.circuit.encode().split('_').filter((t) => /^w/.test(t)).join(' '));
  ok(!E.has(P.edge(P.of(22, 14), P.of(23, 14))), 'and does not hook across to the switch contact');
  const { comp } = Circuit.components(E); ok(comp.get('20,12') === comp.get('17,15'), 'ground joined to the battery\'s − side'); }

// ---- F84: the RLC preset's step response in every damping regime, against the exact curves ----
// (6 V, 1 H, 10 mF: w0 = 10 /s, critical at R = 20 ohm)
for (const R of [3, 12, 20, 30, 100, 1000]) { const b = bench('rlc'), c = b.circuit, res = c.ofType(Resistor)[0], sw = c.ofType(Switch)[0], am = c.ofType(Ammeter)[0], vm = c.ofType(Voltmeter)[0];
  res.setValue(R); b.sim.refresh(); const E = 6, a = R / 2, w0 = 10; let vc, i;
  if (a === w0) { vc = (t) => E * (1 - Math.exp(-a * t) * (1 + a * t)); i = (t) => E * t * Math.exp(-a * t); }
  else if (a < w0) { const wd = Math.sqrt(w0 * w0 - a * a); vc = (t) => E * (1 - Math.exp(-a * t) * (Math.cos(wd * t) + a / wd * Math.sin(wd * t))); i = (t) => E / wd * Math.exp(-a * t) * Math.sin(wd * t); }
  else { const be = Math.sqrt(a * a - w0 * w0), s1 = -a + be, s2 = -a - be; vc = (t) => E * (1 - (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s2 - s1)); i = (t) => E / (2 * be) * (Math.exp(s1 * t) - Math.exp(s2 * t)); }
  b.toggle(sw); const t0 = b.sim.t; let wv = 0, wi = 0, peak = 0;
  for (let k = 0; k < 1500; k++) { b.sim.advance(Simulation.DT); const t = b.sim.t - t0, I = Math.abs(am.number(b.sol)); wv = Math.max(wv, Math.abs(Math.abs(vm.number(b.sol)) - Math.abs(vc(t)))); peak = Math.max(peak, I); if (t > 0.02) wi = Math.max(wi, Math.abs(I - Math.abs(i(t)))); }
  ok(wv < 4e-3, 'RLC step, R = ' + R + ': capacitor voltage within 4 mV of exact (' + wv.toExponential(2) + ')'); ok(wi < 5e-3 * peak, 'RLC step, R = ' + R + ': current within 0.5% of its peak of the exact curve after the first 20 ms (' + (wi / peak).toExponential(2) + ')');
  if (R === 20) near(peak, 6 * 0.1 / Math.E, 4e-4, 'critical damping: peak current (E/L)(1/alpha)/e'); }

// ---- F85: a capacitor with an ammeter turning off at one end and a voltmeter under it, zoomed out so the
// reading is as long as the part. The label must not lie on either meter: it can sit off-centre instead. ----
{ const b = load('g20.17-20.19 b17.11-17.15@6 x26.13-23.12-23.14@1 r27.13-31.13@1000 c27.17-31.17@10 a31.13-31.17* v31.20-27.20* w17.11-23.11 w26.13-27.13 w17.17-20.17 w20.17-23.17 w23.17-27.17 w23.11-23.12 w23.14-23.17 w17.15-17.17 w27.17-27.20 w31.17-31.20');
  run(b.sim, 2); const c = b.circuit, hit = (p, q) => p.x0 < q.x1 && p.x1 > q.x0 && p.y0 < q.y1 && p.y1 > q.y0;
  for (const ls of [1, 1.1, 1.246, 1.35, 1.45]) for (const hide of [false, true]) { const lay = Renderer.layout(null, { circuit: c, names: c.labels(), sol: hide ? null : b.sol, hide, revealed: () => false, view: { labelScale: ls } });
    for (const [id, Lb] of lay) { const on = c.parts.filter((e) => e.id !== id && hit(Lb, PAINTERS[e.type].box(e))).map((e) => e.type);
      ok(!on.length, 'F85 at label scale ' + ls + (hide ? ' (hidden)' : '') + ': label of ' + c.byId(id).type + ' lies on no other part (' + on.join(', ') + ')');
      const el = c.byId(id), own = PAINTERS[el.type].box(el); if (el.type === 'cap') ok(Lb.x1 > own.x0 + 30 && Lb.x0 < own.x1 - 30, 'F85 at label scale ' + ls + ': the capacitor label is still beside the capacitor'); } } }

// ---- F86: "Clean up circuit" puts a part back in line with the parts it is in series with, even when that
// leaves it end to end with them: parts along one line are how a series loop is drawn. (Side by side is
// still crowding: F9.) ----
{ const b = load('b10.11-10.15@12 s10.10-14.10@1 r15.12-19.12@15 a19.10-23.10* l24.11-24.15@12 g10.16-10.18 v27.11-27.15 w14.10-15.10 w23.10-24.10 w24.10-27.10 w10.16-24.16 w24.16-27.16 w10.10-10.11 w10.15-10.16 w24.10-24.11 w24.15-24.16 w27.10-27.11 w27.15-27.16 w15.10-15.12 w19.10-19.12');
  const c = b.circuit, t0 = c.turns(c.wireEdges()); b.tidyLayout(); clean(b, 'F86 tidy'); const r = c.ofType(Resistor)[0];
  ok(r.a.r === 10 && r.b.r === 10, 'F86: the dropped resistor is back on the row of the switch and the ammeter (row ' + r.a.r + ')');
  ok(c.turns(c.wireEdges()) === t0 - 4, 'F86: and its four corners are gone (' + t0 + ' -> ' + c.turns(c.wireEdges()) + ')');
  ok(b.notice && b.notice.text === 'Circuit tidied', 'F86: and says so: ' + (b.notice && b.notice.text));
  ok(r.inLineWith(c.ofType(Switch)[0]) && !r.inLineWith(c.ofType(Inductor)[0]), 'F86: in line with the switch, not with the inductor'); }

// ---- F87: a loose part dropped ACROSS a straight wire turns to lie along it ----
// (an ammeter comes off the menu lying flat; dropped on an upright wire it used to be refused with
//  "a wire turns off part-way along it", which is not what is wrong)
{ const NET = 'g20.12-20.14 o17.11-17.15@6~0.5 r23.13-27.13@1000 l20.8-24.8@1 c20.18-24.18@10 a10.13-14.13 w17.11-20.11 w23.9-24.9 w17.18-20.18 w24.18-27.18 w18.12-20.12 w17.15-18.15 w20.8-20.11 w24.8-24.9 w23.9-23.13 w27.13-27.18 w17.15-17.18 w18.12-18.15';
  const b = load(NET), tool = new PointerTool(b), am = () => b.circuit.ofType(Ammeter)[0], span = (e) => [e.a, e.b].map((p) => p.c + '.' + p.r).sort().join(' ');
  drag(b, tool, P.of(12, 13), P.of(27, 15));
  ok(span(am()) === '27.13 27.17', 'F87: the ammeter turned and went into the upright wire: ' + span(am())); clean(b, 'F87: the circuit is whole');
  ok(b.notice && !b.notice.bad && /turned/i.test(b.notice.text), 'F87: and the turn is announced: ' + (b.notice && b.notice.text));
  run(b.sim, 0.5); ok(Math.abs(am().number(b.sol)) > 1e-4, 'F87: it reads the loop current: ' + am().number(b.sol));
  b.undo(); ok(span(am()) === '10.13 14.13', 'F87: one undo puts it back flat: ' + span(am()));
  // off-centre across the wire: it still goes in
  drag(b, tool, P.of(12, 13), P.of(28, 16)); ok(span(am()) === '27.14 27.18', 'F87: dropped a square off-centre it still goes in: ' + span(am())); clean(b, 'F87: whole again'); b.undo();
  // no room for all of it along the wire (the corner is in the way): this was refused; since F110 an ammeter goes in at half length
  drag(b, tool, P.of(12, 13), P.of(27, 14)); ok(span(am()) === '27.13 27.15' && b.notice && !b.notice.bad && /shortened/i.test(b.notice.text), 'F87: by the corner it goes in two squares long: ' + span(am()) + ' ' + (b.notice && b.notice.text)); clean(b, 'F87: by the corner'); b.undo();
  // arrow keys never turn a part
  b.select(am()); for (let i = 0; i < 13; i++) b.nudge(1, 0); ok(am().a.r === am().b.r, 'F87: nudged with the arrow keys it stays flat');
  // a part that is wired up is never turned by a drag
  const b2 = load(NET), t2 = new PointerTool(b2), r = b2.circuit.ofType(Resistor)[0], was = b2.circuit.encode(); drag(b2, t2, P.of(25, 13), P.of(25, 16)); ok(r.a.r === r.b.r, 'F87: a wired resistor keeps its direction'); clean(b2, 'F87: wired part moved'); }

// ---- F88: a wire joins only what its two ends touch ----
// (wires that cross on the grid are connected, so a wire laid straight ACROSS another one shorted
//  whatever lay between: a voltmeter's second lead, crossing its first, shorted the capacitor)
{ const comp = (b) => Circuit.components(b.circuit.wireEdges()).comp, joined = (b, p, q) => comp(b).has(p.c + ',' + p.r) && comp(b).get(p.c + ',' + p.r) === comp(b).get(q.c + ',' + q.r);
  // the real case: no way to the capacitor's far end without crossing the first lead -> refused, nothing changes
  const NET = 'g20.12-20.14 o17.11-17.15@6~0.5 r23.13-27.13@1000 l20.8-24.8@1 c20.18-24.18@10 a27.13-27.17* v27.9-31.9 w17.11-20.11 w23.9-24.9 w17.18-20.18 w24.18-27.18 w18.12-20.12 w17.15-18.15 w27.10-28.10 w20.19-28.19 w20.8-20.11 w20.18-20.19 w24.8-24.9 w23.9-23.13 w27.9-27.10 w27.17-27.18 w17.15-17.18 w18.12-18.15 w28.10-28.19';
  const b = load(NET), tool = new PointerTool(b), was = b.circuit.encode(); drag(b, tool, P.of(31, 9), P.of(24, 18));
  ok(b.circuit.encode() === was, 'F88: a lead that could only cross the other lead is not laid'); ok(b.notice && b.notice.bad && /cross/.test(b.notice.text), 'F88: and the refusal says why: ' + (b.notice && b.notice.text));
  ok(!joined(b, P.of(27, 9), P.of(24, 18)), 'F88: the capacitor is not shorted');
  // where there is a way round, the wire takes it and joins nothing on the way
  const b2 = load('w10.10-20.10'), t2 = new PointerTool(b2); drag(b2, t2, P.of(15, 6), P.of(18, 14));
  ok(comp(b2).has('15,6') && joined(b2, P.of(15, 6), P.of(18, 14)), 'F88: the wire is laid end to end'); ok(!joined(b2, P.of(15, 6), P.of(10, 10)), 'F88: and goes round the wire in its way instead of joining it: ' + b2.circuit.encode());
  // ending ON a wire is how a junction is made
  const b3 = load('w10.10-20.10'), t3 = new PointerTool(b3); drag(b3, t3, P.of(15, 6), P.of(15, 10)); ok(joined(b3, P.of(15, 6), P.of(10, 10)), 'F88: a wire ended on a wire joins it');
  // then on from that junction is fine too: the wire starts on that net
  drag(b3, t3, P.of(15, 10), P.of(15, 14)); ok(joined(b3, P.of(15, 14), P.of(10, 10)), 'F88: and a wire started on a wire is part of it');
  // a rail through the bare ends of parts in a row still joins them all
  const b4 = load('r10.8-10.12@1000 r14.8-14.12@1000 r18.8-18.12@1000'), t4 = new PointerTool(b4); drag(b4, t4, P.of(10, 8), P.of(18, 8));
  ok(joined(b4, P.of(10, 8), P.of(14, 8)) && joined(b4, P.of(14, 8), P.of(18, 8)), 'F88: a rail through three bare terminals joins all three: ' + b4.circuit.encode());
  // running back over its own net is not a crossing
  const b5 = load('w10.10-20.10 w15.10-15.14'), t5 = new PointerTool(b5); drag(b5, t5, P.of(10, 10), P.of(24, 10)); ok(joined(b5, P.of(24, 10), P.of(15, 14)), 'F88: a wire may run along its own net'); }

// ---- F89: a steep trace is a smooth line, not a staircase ----
// (30 V and 3 A at 1.59 Hz on the 8 s span: eight samples to the pixel, the trace climbing 7 px for each px across.
//  Every column of samples was drawn at the column's rounded x, so the line went up in steps half a pixel wide
//  and four tall -- visibly rough. The points kept for a column are now drawn where they really are.)
{ const { GraphPainter } = L, X = (t) => 52 + t / 8 * 470, Y = (v) => 60 - 45 * v, w = 2 * Math.PI * 1.59, s = []; for (let i = 0; i <= 4000; i++) s.push([i * 0.002, Math.sin(w * i * 0.002)]);
  const pts = []; GraphPainter.path({ moveTo(x, y) { pts.push([x, y]); }, lineTo(x, y) { pts.push([x, y]); } }, s, 0, X, Y);
  let off = 0; for (const [x, y] of pts) off = Math.max(off, Math.abs(y - Y(Math.sin(w * (x - 52) / 470 * 8))));
  ok(off < 0.05, 'F89: every point of the path lies on the curve (furthest is ' + off.toFixed(2) + ' px off)');
  let back = 0; for (let i = 1; i < pts.length; i++) if (pts[i][0] < pts[i - 1][0] - 1e-9) back++; ok(back === 0, 'F89: and the path never doubles back in time');
  ok(pts.length <= 4 * 2 * 470 + 8 && pts.length > 900, 'F89: still no more than four points to the half-pixel: ' + pts.length);
  const ys = pts.map((q) => q[1]); ok(Math.min(...ys) < 15.01 && Math.max(...ys) > 104.99, 'F89: with the peaks kept');
  // a trace far denser than the pixels (16 s of a 40 Hz swing) still shows its full height in every column
  const d = []; for (let i = 0; i <= 8000; i++) d.push([i * 0.002, Math.sin(2 * Math.PI * 40 * i * 0.002)]);
  const dp = []; GraphPainter.path({ moveTo(x, y) { dp.push([x, y]); }, lineTo(x, y) { dp.push([x, y]); } }, d, 0, (t) => 52 + t / 16 * 470, Y);
  const cols = new Map(); for (const [x, y] of dp) { const c = Math.round(x), e = cols.get(c) || [y, y]; cols.set(c, [Math.min(e[0], y), Math.max(e[1], y)]); }
  ok([...cols.entries()].every(([c, [a, z]]) => c <= 52 || c >= 522 || z - a > 80), 'F89: a dense trace fills its band in every pixel column'); }

// ---- F90: "Clean up circuit" takes a hook out by moving a part diagonally ----
// (a resistor turned upright beside an ammeter was left joined to it by a hook -- across one, up two, across one --
//  and tidying said "Nothing to tidy": it only slid parts along one axis, and neither slide alone helps.
//  Bringing the resistor's end onto the ammeter's puts the two end to end.)
{ const b = load('g20.12-20.14 o17.11-17.15@6~1.59 r25.11-25.15@2 l20.8-24.8@1 c20.18-24.18@10 a27.13-27.17* v20.20-24.20* w17.18-20.18 w24.18-27.18 w18.12-20.12 w17.15-18.15 w25.15-26.15 w26.13-27.13 w17.8-20.8 w24.8-25.8 w20.18-20.20 w24.18-24.20 w27.17-27.18 w17.8-17.11 w17.15-17.18 w18.12-18.15 w26.13-26.15 w25.8-25.11');
  const turns = () => b.circuit.turns(b.circuit.wireEdges()), was = turns(), R = () => b.circuit.ofType(Resistor)[0], A = () => b.circuit.ofType(Ammeter)[0], span = (e) => e.a.c + '.' + e.a.r + ' ' + e.b.c + '.' + e.b.r;
  b.tidyLayout(); ok(b.notice && b.notice.text === 'Circuit tidied', 'F90: the hook is something to tidy: ' + (b.notice && b.notice.text)); clean(b, 'F90: the circuit is whole afterwards');
  ok(turns() <= was - 3, 'F90: with at least three turns fewer: ' + was + ' -> ' + turns());
  ok(R().inLineWith(A()) && R().clearanceTo(A()) === 0, 'F90: the resistor is end to end with the ammeter: ' + span(R()) + ' / ' + span(A()));
  ok(span(A()) === '27.13 27.17', 'F90: the ammeter stayed where it was');
  run(b.sim, 12); let ip = 0; for (let i = 0; i < 500; i++) { b.sim.advance(Simulation.DT); ip = Math.max(ip, Math.abs(A().number(b.sol))); } near(ip, 2.99986, 0.003, 'F90: and it is the same circuit: peak current');
  b.undo(); ok(span(R()) === '25.11 25.15', 'F90: one undo puts the resistor back'); }

// ---- F91: two batteries that cancel are not "a gap in the loop" ----
{ const { Panel } = L, text = (b) => new Panel({ bench: b, state: { hide: false, peek: {} } }).summary().summaryText;
  const net = (e2) => 'b12.9-12.13@6 g12.14-12.16 r14.8-18.8@1200 r20.8-24.8@1800 b26.9-26.13@' + e2 + ' w12.8-14.8 w18.8-20.8 w24.8-26.8 w12.14-26.14 w12.8-12.9 w12.13-12.14 w26.8-26.9 w26.13-26.14';
  const even = load(net(6)); ok(/No current is flowing/.test(text(even)) && /cancel/.test(text(even)) && !/gap/.test(text(even)), 'equal batteries facing each other: ' + text(even));
  const uneven = load(net(4.5)); ok(!/No current/.test(text(uneven)), 'unequal batteries drive a current: ' + text(uneven)); near(Math.abs(uneven.sol.current(uneven.circuit.ofType(Resistor)[0])), 1.5 / 3000, 1e-9, 'and it is (6 - 4.5) V over 3 kOhm');
  const gap = load('b8.10-8.14@6 w8.10-12.10 r12.10-16.10@1000 w16.10-20.10 w20.14-8.14 g8.14-8.16'); ok(/gap in the loop/.test(text(gap)) && !/cancel/.test(text(gap)), 'one battery and a gap is still a gap: ' + text(gap));
  const both = load(net(6).replace(' w24.8-26.8', '')); ok(/gap in the loop/.test(text(both)) && !/cancel/.test(text(both)), 'two batteries and a gap is a gap: ' + text(both));
  const sw = load(net(6).replace('r20.8-24.8@1800', 's20.8-24.8@1')); ok(/cancel/.test(text(sw)), 'through a closed switch too: ' + text(sw)); }

// ---- F92: the Parallel preset has room to splice an ammeter into each branch (its worked example says to) ----
{ const reads = (drop, want, what) => { const b = bench('parallel'), tool = new PointerTool(b); b.add('amm'); const am = b.circuit.ofType(Ammeter)[0], mid = P.of((am.a.c + am.b.c) / 2, (am.a.r + am.b.r) / 2);
    drag(b, tool, mid, drop); clean(b, 'F92: ' + what + ' leaves a sound circuit'); near(Math.abs(am.number(b.sol)), want, 1e-9, 'F92: an ammeter dropped ' + what + ' reads that branch'); };
  const c = PRESETS.build('parallel'), R = c.ofType(Resistor), top = Math.min(R[0].a.r, R[0].b.r), rail = Math.min(...c.elements.filter((e) => e.type === 'wire').map((w) => Math.min(w.a.r, w.b.r)));
  ok(top - rail >= 4, 'F92: four squares of straight wire above each resistor: ' + (top - rail));
  reads(P.of(R[0].a.c, (rail + top) / 2), 6 / 1200, 'above R1'); reads(P.of(R[1].a.c, (rail + top) / 2), 6 / 3000, 'above R2'); reads(P.of(15, rail), 6 / 1200 + 6 / 3000, 'next to the battery'); }

// ---- F93: an ammeter that is in one branch can be dragged into another: it comes out of its wire, which closes up ----
{ const b = bench('parallel'), tool = new PointerTool(b), R = b.circuit.ofType(Resistor), edges0 = b.circuit.wireEdges().size; b.add('amm'); const am = b.circuit.ofType(Ammeter)[0], id = am.id, name = b.circuit.labels ? null : null;
  const mid = () => P.of((am.a.c + am.b.c) / 2, (am.a.r + am.b.r) / 2), order = () => b.circuit.elements.filter((e) => !e.isWire).map((e) => e.id).join(',');
  drag(b, tool, mid(), P.of(18, 6.5)); near(Math.abs(am.number(b.sol)), 6 / 1200, 1e-9, 'F93: first into the R1 branch'); const order0 = order(), steps0 = b.history.past.length;
  drag(b, tool, mid(), P.of(24, 6.5)); clean(b, 'F93: moved to the R2 branch'); near(Math.abs(b.circuit.byId(id).number(b.sol)), 6 / 3000, 1e-9, 'F93: dragged across, it reads the R2 branch');
  ok(b.circuit.byId(id) === am && order() === order0, 'F93: it is the same meter, in the same place in the list'); near(b.sol.current(R[0]), 6 / 1200, 1e-9, 'F93: the wire it left has closed up: R1 still carries its current');
  ok(b.circuit.wireEdges().size === edges0 - 4, 'F93: no wire added or lost: ' + b.circuit.wireEdges().size + ' against ' + (edges0 - 4)); ok(!b.notice.bad && /closed up/.test(b.notice.text), 'F93: and it says what happened: ' + b.notice.text);
  ok(b.history.past.length === steps0 + 1, 'F93: one step to undo');
  drag(b, tool, mid(), P.of(15, 4)); clean(b, 'F93: moved beside the battery'); near(Math.abs(am.number(b.sol)), 6 / 1200 + 6 / 3000, 1e-9, 'F93: dropped across the top rail, it turns and reads the total'); ok(am.a.r === am.b.r, 'F93: lying along the rail'); near(am.number(b.sol), 6 / 1200 + 6 / 3000, 1e-9, 'F93: turned back the way it came, so it still reads positive'); ok(am.a.c < am.b.c, 'F93: + lead on the left again, as it was before it was first turned');
  b.undo(); near(Math.abs(am.number(b.sol)), 6 / 3000, 1e-9, 'F93: undo puts it back in the R2 branch'); clean(b, 'F93: after undo');
  // the same drop from the nearer branch: the meter could reach by dragging its wires along and pushing the rail aside, but a drop ON a wire means "in this wire"
  { const n = bench('parallel'), tn = new PointerTool(n); n.add('amm'); const m = n.circuit.ofType(Ammeter)[0], at = () => P.of((m.a.c + m.b.c) / 2, (m.a.r + m.b.r) / 2), rail = n.circuit.wireEdges().size;
    drag(n, tn, at(), P.of(18, 6.5)); drag(n, tn, at(), P.of(15, 4)); clean(n, 'F93: from the R1 branch to the rail'); near(m.number(n.sol), 6 / 1200 + 6 / 3000, 1e-9, 'F93: from the R1 branch onto the rail it reads the total');
    ok(m.a.r === 4 && m.b.r === 4 && n.circuit.wireEdges().size === rail - 4, 'F93: in the rail, which has not been pushed aside: ' + n.circuit.encode());
    // sliding along the wire it is in, and stepping off it sideways, are what they always were
    n.notice = null; drag(n, tn, at(), P.of(at().c + 1, 4)); clean(n, 'F93: slid along the rail'); near(m.number(n.sol), 6 / 1200 + 6 / 3000, 1e-9, 'F93: slid along the rail, it still reads the total'); ok(n.circuit.wireEdges().size === rail - 4, 'F93: and the rail is still one straight run'); ok(!n.notice, 'F93: nothing is announced for a slide along its own wire: ' + (n.notice && n.notice.text));
    const c0 = at().c; drag(n, tn, at(), P.of(c0, 1)); clean(n, 'F93: lifted off the rail sideways'); ok(m.a.r === 1 && m.b.r === 1 && n.circuit.wireEdges().size > rail - 4, 'F93: dragged to empty space it takes its wires with it'); near(m.number(n.sol), 6 / 1200 + 6 / 3000, 1e-9, 'F93: and still reads the total'); }
  // only an ammeter does this: any other wired part would leave a gap behind it
  const s = bench('series'), ts = new PointerTool(s), r1 = s.circuit.ofType(Resistor)[0], was = s.circuit.encode(); drag(s, ts, P.of(16, 8), P.of(19, 14));
  ok(s.circuit.encode() === was && s.notice.bad, 'F93: a wired resistor dropped on another wire is still put back: ' + s.notice.text);
  // and only one that is really in a wire: with a lead hanging loose there is nothing to close up
  const h = load('b10.9-10.13@6 w10.8-10.9 w10.8-20.8 r20.8-20.12@1000 w20.12-20.14 w10.13-10.14 w10.14-20.14 a12.11-16.11 w16.11-18.11'), th = new PointerTool(h), wasH = h.circuit.encode(); drag(h, th, P.of(14, 11), P.of(15, 8));
  ok(h.circuit.encode() === wasH, 'F93: an ammeter with a loose lead is not lifted out of anything'); }

// ---- F94: a selected battery says whether it is supplying energy or being charged ----
{ const { Panel, AcSource } = L, card = (b, el, hide) => { b.select(el); return new Panel({ bench: b, state: { hide: !!hide, peek: {} }, run: (f) => f, typeField() {}, endField() {} }).inspector(); };
  const b = load('b12.9-12.13@6 g12.14-12.16 r14.8-18.8@1200 r20.8-24.8@1800 b26.9-26.13@2.5~50 w12.8-14.8 w18.8-20.8 w24.8-26.8 w12.14-26.14 w12.8-12.9 w12.13-12.14 w26.8-26.9 w26.13-26.14'), [big, small] = b.circuit.ofType(Battery), I = 3.5 / 3050;
  near(Math.abs(b.sol.current(big)), I, 1e-12, 'F94: opposing batteries drive (6 − 2.5) V through 3.05 kΩ'); near(Math.abs(b.sol.measure(small).dV), 2.5 + I * 50, 1e-9, 'F94: the battery being charged has a terminal voltage ABOVE its EMF');
  ok(/^Supplying energy/.test(card(b, big).selSourceNote), 'F94: the stronger battery is supplying: ' + card(b, big).selSourceNote); ok(/^Being charged/.test(card(b, small).selSourceNote), 'F94: the weaker one is being charged: ' + card(b, small).selSourceNote);
  ok(card(b, small).selHasSourceNote && card(b, small, true).selSourceNote === '' && !card(b, small, true).selHasSourceNote, 'F94: with the solution hidden it does not give the direction away');
  b.select(small); b.flip(); ok(/^Supplying energy/.test(card(b, small).selSourceNote) && /^Supplying energy/.test(card(b, big).selSourceNote), 'F94: flipped to help, both supply'); near(Math.abs(b.sol.current(big)), 8.5 / 3050, 1e-12, 'F94: and the EMFs add');
  const e = load('b12.9-12.13@6 r14.8-18.8@1200 b26.9-26.13@6 w12.8-14.8 w18.8-26.8 w12.14-26.14 w12.8-12.9 w12.13-12.14 w26.8-26.9 w26.13-26.14'); ok(card(e, e.circuit.ofType(Battery)[0]).selSourceNote === '', 'F94: no current, nothing to say');
  const a = bench('ac'), src = a.circuit.ofType(AcSource)[0]; run(a.sim, 0.3); ok(!card(a, src).selHasSourceNote, 'F94: an AC source (it swaps every half cycle) gets no such line');
  const r = bench('series'); ok(!card(r, r.circuit.ofType(Resistor)[0]).selHasSourceNote, 'F94: nor does a resistor');
  const f = new Panel({ bench: b, state: { hide: false, peek: {} } }).info().infoFormulas.map((x) => x.expr).join(' | ');
  for (const want of ['\\tau = RC', '\\tau = \\dfrac{L}{R}', '\\omega_0 = \\dfrac{1}{\\sqrt{LC}}', '\\Delta V_{\\text{loop}}']) ok(f.includes(want), 'F94: Info lists ' + want); }

// ---- F95: a selected capacitor or inductor shows the energy it stores ----
{ const { Panel, Fmt } = L, card = (b, el, hide) => { b.select(el); return new Panel({ bench: b, state: { hide: !!hide, peek: {} }, run: (f) => f, typeField() {}, endField() {} }).inspector(); };
  ok(Fmt.J(0) === '0 mJ' && Fmt.J(0.374) === '374 mJ' && Fmt.J(1.5) === '1.50 J' && Fmt.J(2.5e-5) === '25.0 µJ' && Fmt.J(4.2e-8) === '42.0 nJ' && Fmt.J(5000) === '5.00 kJ' && Fmt.J(NaN) === '—', 'F95: energies to three figures in nJ … kJ');
  const b = bench('rlc'), cap = b.circuit.ofType(Capacitor)[0], ind = b.circuit.ofType(Inductor)[0], sw = b.circuit.ofType(Switch)[0];
  ok(card(b, cap).selHasEnergy && card(b, cap).selEnergy === '0 mJ', 'F95: an uncharged capacitor stores nothing: ' + card(b, cap).selEnergy);
  b.toggle(sw); run(b.sim, 0.3178);
  const V = b.sol.measure(cap).dV, I = b.sol.measure(ind).I, c = card(b, cap), l = card(b, ind);
  ok(Math.abs(V) > 9.5, 'F95: near the first voltage peak (' + V.toFixed(2) + ' V)');
  ok(c.selEnergy === Fmt.J(0.5 * 0.01 * V * V) && /^4\d\d mJ$/.test(c.selEnergy), 'F95: U_C = ½ C ΔV² = ' + c.selEnergy); ok(/U_C/.test(c.selEnergyTex) && /\\Delta V/.test(c.selEnergyTex), 'F95: with its formula: ' + c.selEnergyTex);
  ok(l.selHasEnergy && l.selEnergy === Fmt.J(0.5 * 1 * I * I) && /U_L/.test(l.selEnergyTex) && /L\\,I\^2/.test(l.selEnergyTex), 'F95: U_L = ½ L I² = ' + l.selEnergy + ' (' + l.selEnergyTex + ')');
  run(b.sim, 0.16); const I2 = b.sol.measure(ind).I; ok(Math.abs(I2) > 0.25 && card(b, ind).selEnergy === Fmt.J(0.5 * I2 * I2), 'F95: a quarter cycle on the inductor holds it: ' + card(b, ind).selEnergy);
  ok(card(b, cap, true).selEnergy === '?' && card(b, ind, true).selEnergy === '?', 'F95: hidden with the solution');
  ok(!card(b, b.circuit.ofType(Resistor)[0]).selHasEnergy && !card(b, b.circuit.ofType(Battery)[0]).selHasEnergy && !card(b, sw).selHasEnergy, 'F95: a resistor, battery or switch stores none');
  // energy is conserved: what the battery has delivered = what R has dissipated + what C and L hold
  const e = bench('rlc'), ec = e.circuit.ofType(Capacitor)[0], ei = e.circuit.ofType(Inductor)[0], er = e.circuit.ofType(Resistor)[0]; e.toggle(e.circuit.ofType(Switch)[0]);
  let burnt = 0; for (let k = 0; k < 1500; k++) { e.sim.advance(0.001); const i = e.sol.measure(ei).I; burnt += i * i * er.value * 0.001; }
  const q = ec.charge, held = 0.5 * ec.farads * ec.vc * ec.vc + 0.5 * ei.henries * e.sol.measure(ei).I ** 2; near(6 * q, burnt + held, 6 * q * 0.01, 'F95: ε·Q delivered = I²R dissipated + ½CΔV² + ½LI² held (within 1%)'); }

// ---- F96: a selected AC source shows the angular frequency and period that go with its frequency ----
{ const { Panel, AcSource } = L, card = (b, el, hide) => { b.select(el); return new Panel({ bench: b, state: { hide: !!hide, peek: {} }, run: (f) => f, typeField() {}, endField() {} }).inspector(); };
  const a = bench('ac'), src = a.circuit.ofType(AcSource)[0], d = card(a, src);
  ok(d.selHasDerived && d.selDerivedTex === '\\omega = 5.03\\ \\text{rad/s}' && d.selDerived2Tex === 'T = 1.25\\ \\text{s}', 'F96: 0.8 Hz is ω = 5.03 rad/s, T = 1.25 s: ' + d.selDerivedTex + ' | ' + d.selDerived2Tex);
  src.setFreq(1.59); const d2 = card(a, src); ok(/= 9\.99\\ /.test(d2.selDerivedTex) && /= 0\.629\\ /.test(d2.selDerived2Tex), 'F96: 1.59 Hz is ω = 9.99 rad/s (the preset’s ω₀ = 10), T = 0.629 s: ' + d2.selDerivedTex);
  src.setFreq(20); ok(/= 126\\ /.test(card(a, src).selDerivedTex) && /= 0\.05\\ /.test(card(a, src).selDerived2Tex), 'F96: 20 Hz: ' + card(a, src).selDerivedTex);
  ok(card(a, src, true).selHasDerived, 'F96: it is given data, so it stays with the solution hidden');
  const s = bench('series'); ok(!card(a, a.circuit.ofType(Resistor)[0]).selHasDerived && !card(s, s.circuit.ofType(Battery)[0]).selHasDerived, 'F96: only an AC source has it'); }

// ---- F97: the AC preset opens with both meters on the graph (the two traces are the point of it) ----
{ const a = bench('ac'), v = a.circuit.ofType(Voltmeter)[0], am = a.circuit.ofType(Ammeter)[0];
  ok(v.graph && am.graph, 'F97: AC-driven RLC opens graphing its voltmeter and ammeter');
  for (const k of ['rc', 'rl', 'rlc']) { const p = bench(k); ok(!p.circuit.ofType(Voltmeter)[0].graph && !p.circuit.ofType(Ammeter)[0].graph, 'F97: ' + k + ' (nothing happens until its switch is thrown) still opens with the graph closed'); }
  ok(/a16\.10-20\.10\*/.test(a.circuit.encode()) && /v13\.11-13\.15\*/.test(a.circuit.encode()), 'F97: and says so in its share link'); }

// ---- F98: an edit that brings a dead circuit to life starts the clock face at zero, as throwing a switch does ----
{ const open = 'b12.9-12.13@6 r14.8-18.8@1000 c22.9-22.13@2 w12.8-12.9 w12.8-14.8 w18.8-22.8 w22.8-22.9 w22.13-22.14 w12.13-12.14 w12.14-20.14';
  const b = load(open), tool = new PointerTool(b), cap = b.circuit.ofType(Capacitor)[0], res = b.circuit.ofType(Resistor)[0];
  run(b.sim, 3); ok(!b.sim.timed && b.sim.shown === 0, 'F98: an open string of parts has no clock to run (F112)'); near(cap.vc, 0, 1e-12, 'F98: and nothing charges');
  drag(b, tool, P.of(20, 14), P.of(22, 14)); ok(b.circuit.problems().length === 0 && Math.abs(b.sol.current(res)) > 5e-3, 'F98: the last wire closes the loop (' + Fmt.A(b.sol.current(res)) + ')');
  near(b.sim.shown, 0, 1e-9, 'F98: and the clock face reads 0 at that instant'); 
  run(b.sim, 1); near(Math.abs(cap.vc), 6 * (1 - Math.exp(-0.5)), 2e-3, 'F98: so after 1.00 s on the clock (τ = 2 s) the capacitor is at ε(1 − e^−½) = ' + Math.abs(cap.vc).toFixed(3) + ' V'); near(b.sim.shown, 1, 1e-9, 'F98: the clock reads 1.00 s');
  // edits to a circuit that is already live leave the clock alone
  const o1 = b.sim.origin; b.select(res); b.type('value', 2000); b.endTyping(); ok(b.sim.origin === o1, 'F98: typing a new resistance does not restart the clock');
  b.add('volt'); ok(b.sim.origin === o1, 'F98: nor does adding a meter'); b.select(res); b.nudge(0, -1); ok(b.sim.origin === o1 && Math.abs(b.sol.current(res)) > 1e-4, 'F98: nor does moving a wired part');
  // breaking the circuit does not restart it either; mending it again does
  run(b.sim, 0.5); b.undo(); b.undo(); b.undo(); b.undo(); ok(Math.abs(b.sol.current(res)) < 1e-9 && b.sim.origin === o1, 'F98: undoing back to the open loop does not restart the clock (' + b.sim.shown.toFixed(2) + ' s)');
  run(b.sim, 0.5); b.redo(); near(b.sim.shown, 0, 1e-9, 'F98: redoing the wire lets the capacitor go on charging, from zero on the clock');
  // a dead circuit that an edit leaves dead still has no clock
  const d = load(open); run(d.sim, 2); d.add('resistor'); ok(!d.sim.timed && d.sim.shown === 0, 'F98: a part added to a dead circuit starts no clock');
  // a battery dragged into the gap of a loop
  const g = load('r14.8-18.8@1200 w12.8-14.8 w18.8-22.8 w22.8-22.14 w12.14-22.14 w12.8-12.9 w12.13-12.14 b6.9-6.13@6'), gt = new PointerTool(g); run(g.sim, 2);
  drag(g, gt, P.of(6, 11), P.of(12, 11)); ok(g.circuit.encode().includes('b12.9-12.13') && Math.abs(g.sol.current(g.circuit.ofType(Resistor)[0]) - 0.005) < 1e-9, 'F98: a battery dropped into the gap drives 5.00 mA'); near(g.sim.shown, 0, 1e-9, 'F98: and the clock starts there');
  // a switch still does what it did
  const r = bench('rlc'); run(r.sim, 1.5); r.toggle(r.circuit.ofType(Switch)[0]); near(r.sim.shown, 0, 1e-9, 'F98: throwing a switch is still t = 0');
  // an AC circuit passing through zero is not "dead": nothing restarts on its own
  const a = load('o12.9-12.13@6~0.5 r14.8-18.8@1200 w12.8-14.8 w18.8-22.8 w22.8-22.14 w12.14-22.14 w12.8-12.9 w12.13-12.14'); run(a.sim, 5.3); ok(a.sim.origin === 0, 'F98: an AC source crossing zero does not restart the clock');
  a.sim.t = 6; a.sim.refresh(); a.select(a.circuit.ofType(Resistor)[0]); a.type('value', 1500); a.endTyping(); ok(a.sim.origin === 0, 'F98: nor does an edit made at the instant of a zero crossing'); }

// ---- F99: the RC worked example's "at one τ" is ε(1 − 1/e), not 0.632 ε rounded twice (12 V: 7.59 V, not 7.58) ----
{ const ex = new WorkedExample('rc');
  for (let emf = 3; emf <= 12; emf++) { ex.vals = { emf, R: 1000, C: 1.8 }; const tex = ex.model().steps[3].tex, want = (emf * (1 - Math.exp(-1))).toFixed(2);
    ok(tex.includes('= ' + want + '\\text{ V}'), 'F99: at one τ a ' + emf + ' V source has charged the capacitor to ' + want + ' V: ' + tex); } }

// ---- F100: an open switch with nothing flowing is not "running"; once it closes, it is ----
{ const b = bench('rlc'), panel = new L.Panel({ bench: b, state: { hide: false, peek: {} }, run: (f) => f, typeField() {}, endField() {} });
  const sw = b.circuit.parts.find((e) => e.type === 'switch'); run(b.sim, 0.2);
  let t = panel.summary().summaryText; ok(/^Switch open/.test(t) && !/running/.test(t), 'F100: with the switch open and no current the summary does not say "running": ' + t);
  b.toggle(sw); run(b.sim, 0.2); t = panel.summary().summaryText; ok(/running/.test(t) && !/Switch open/.test(t), 'F100: with the switch closed it is running: ' + t); }

// ---- F101: a loop with an inductor in it starts with no current at all -- closing it is still t = 0 on the clock ----
{ for (const [what, net] of [['a battery, a resistor and an inductor', 'b12.9-12.13@6 r14.8-18.8@1200 l22.9-22.13@2 w12.8-14.8 w18.8-20.8 w22.8-22.9 w22.13-22.14 w12.14-22.14 w12.8-12.9 w12.13-12.14'],
                             ['an AC source and an inductor', 'o12.9-12.13@6~0.5 l22.9-22.13@2 w12.8-20.8 w22.8-22.9 w22.13-22.14 w12.14-22.14 w12.8-12.9 w12.13-12.14']]) {
    const b = load(net), ind = b.circuit.ofType(Inductor)[0], tool = new PointerTool(b); run(b.sim, 3.3); ok(!b.sim.timed && b.sim.shown === 0, 'F101: ' + what + ', loop open: no clock yet (F112)');
    drag(b, tool, P.of(20, 8), P.of(22, 8)); ok(b.circuit.problems().length === 0 && Math.abs(b.sol.current(ind)) < 1e-9, 'F101: ' + what + ': the last wire closes the loop, and the current is still zero');
    // (the battery's whole 6 V; the AC source is only now starting, from 0 V -- its sine begins when the loop closes)
    ok(/^an AC/.test(what) ? Math.abs(b.sol.measure(ind).dV) < 1e-9 : Math.abs(b.sol.measure(ind).dV) > 5.9, 'F101: ' + what + ': the whole source voltage is across the inductor (' + Fmt.V(b.sol.measure(ind).dV) + ')');
    near(b.sim.shown, 0, 1e-9, 'F101: ' + what + ': the clock face reads 0 at that instant');
    const o = b.sim.origin; run(b.sim, 0.4); ok(Math.abs(b.sol.current(ind)) > 1e-4 && b.sim.origin === o, 'F101: ' + what + ': the current grows from there (' + Fmt.A(b.sol.current(ind)) + ') and the clock is not restarted again'); }
  // a charged capacitor and a resting inductor wired together: nothing flows yet, but the loop has come to life
  const b = load('c12.9-12.13@10 l22.9-22.13@2 w12.8-20.8 w22.8-22.9 w22.13-22.14 w12.14-22.14 w12.8-12.9 w12.13-12.14'), tool = new PointerTool(b); b.circuit.ofType(Capacitor)[0].vc = 4; b.sim.refresh();
  run(b.sim, 1.1); drag(b, tool, P.of(20, 8), P.of(22, 8)); near(b.sim.shown, 0, 1e-9, 'F101: a charged capacitor joined to an inductor starts the clock too'); }

// ---- F102: a wire is not laid along a wire that belongs to neither of its ends (that would join a third node, and here short the resistor) ----
{ const net = 'g20.12-20.14 b17.11-17.15@6 b23.11-23.15@6 r10.13-14.13@1000 w14.11-17.11 w17.15-23.15 w14.11-14.13';
  const b = load(net), tool = new PointerTool(b), R = b.circuit.ofType(Resistor)[0], [b1, b2] = b.circuit.ofType(Battery);
  ok(b.circuit.crossings([P.of(23, 11), P.of(10, 11), P.of(10, 13)]).length > 0, 'F102: the elbow that runs along the wire from battery 1 to the resistor counts as touching a third wire');
  ok(/run along/.test(b.circuit.addWire([P.of(23, 11), P.of(10, 11), P.of(10, 13)]).why || ''), 'F102: laid directly, it is refused, and the reason says "run along"');
  drag(b, tool, P.of(23, 11), P.of(10, 13));
  ok(b.circuit.problems().length === 0 && b.sol.node(R.a) !== b.sol.node(R.b), 'F102: battery 2 to the far end of the resistor goes round: the resistor is not shorted');
  ok(b.sol.node(b2.a) === b.sol.node(R.a) && b.sol.node(b1.a) === b.sol.node(R.b) && b.sol.node(b1.a) !== b.sol.node(b2.a), 'F102: each battery is on its own end of the resistor');
  ok(b.sol.ok !== false && Math.abs(b.sol.current(R)) < 1e-9, 'F102: two equal batteries facing each other: solvable, and no current');
  b2.value = 9; b.sim.refresh(); near(Math.abs(b.sol.current(R)), 3e-3, 1e-9, 'F102: 9 V against 6 V through 1 kΩ is 3 mA');
  // its own wire is still fair game: a wire may run along the wire one of its ends is already on
  const c = load(net); ok(c.circuit.crossings([P.of(17, 11), P.of(10, 11), P.of(10, 13)]).length === 0 && c.circuit.addWire([P.of(17, 11), P.of(10, 11), P.of(10, 13)]).ok, 'F102: from battery 1 itself, the same route is its own wire, and is laid');
  // and a rail still picks up the bare ends it passes
  const d = load('r10.12-10.16@1000 r14.12-14.16@2000 r18.12-18.16@3000'), [r1, r2, r3] = d.circuit.ofType(Resistor); ok(d.circuit.addWire([P.of(10, 12), P.of(18, 12)]).ok, 'F102: a rail over three bare ends is laid');
  d.sim.refresh(); ok(d.sol.node(r1.a) === d.sol.node(r2.a) && d.sol.node(r2.a) === d.sol.node(r3.a), 'F102: ...and joins all three'); }

// ---- F103: a lone battery is "ε"; with two of them they are ε₁ and ε₂ (never "ε" and "ε₂") ----
{ const one = load('b17.11-17.15@6 r10.13-14.13@1000'), n1 = one.circuit.labels(), b1 = one.circuit.ofType(Battery)[0];
  ok(n1.get(b1.id).text === 'ε' && n1.get(b1.id).tex === '\\varepsilon', 'F103: one battery is plain ε');
  const two = load('b17.11-17.15@6 b23.11-23.15@6 r10.13-14.13@1000'), n2 = two.circuit.labels(), [p, q] = two.circuit.ofType(Battery);
  ok(n2.get(p.id).text === 'ε₁' && n2.get(q.id).text === 'ε₂', 'F103: two batteries are ε₁ and ε₂ (got ' + n2.get(p.id).text + ', ' + n2.get(q.id).text + ')');
  ok(n2.get(p.id).tex === '\\varepsilon_{1}' && n2.get(q.id).tex === '\\varepsilon_{2}', 'F103: ...in the panel\'s typeset names too');
  ok(n2.get(two.circuit.ofType(Resistor)[0].id).text === 'R₁', 'F103: a lone resistor is still R₁'); }

// ---- F104: an oscillation keeps its true frequency (a sharp resonance shows a frequency error of one part in ten thousand as a 13 % error in the current) ----
{ // an ideal LC loop rings at 1 / (2 pi sqrt(LC)), and goes on ringing at the amplitude it began with
  const b = load('c12.9-12.13@10 l22.9-22.13@1 w12.8-22.8 w22.8-22.9 w22.13-22.14 w12.14-22.14 w12.8-12.9 w12.13-12.14'), C = b.circuit.ofType(Capacitor)[0]; C.vc = 5; b.sim.jolt();
  const up = []; let was = C.vc, peak = 0; for (let i = 0; i < 7200 && up.length < 22; i++) { b.sim.advance(Simulation.DT); if (was < 0 && C.vc >= 0) up.push(b.sim.t - Simulation.DT * C.vc / (C.vc - was)); was = C.vc; if (up.length >= 20) peak = Math.max(peak, Math.abs(C.vc)); }
  const T = (up[20] - up[0]) / 20, T0 = 2 * Math.PI * Math.sqrt(1 * 0.01);
  ok(Math.abs(T / T0 - 1) < 2e-6, 'F104: an LC loop of 1 H and 10 mF rings with a period of ' + T0.toFixed(6) + ' s (got ' + T.toFixed(6) + ', off by ' + (T / T0 - 1).toExponential(2) + ')');
  ok(Math.abs(peak / 5 - 1) < 1e-3, 'F104: ...and twenty periods on it still swings to 5 V (got ' + peak.toFixed(5) + ')');
  ok(b.sim.env().order === Simulation.ORDER && Simulation.ORDER >= 4, 'F104: once it is under way the step formula is the high-order one');
  // a tank driven through a resistor, a thousandth off its resonance: the source current is what the phasors say
  const d = load('o17.11-17.15@6~1.59 r20.9-24.9@200 l27.11-27.15@1 c31.11-31.15@10 w17.11-20.11 w24.9-27.9 w27.9-31.9 w17.15-27.15 w27.15-31.15 w20.9-20.11 w31.9-31.11 w27.9-27.11'), R = d.circuit.ofType(Resistor)[0];
  run(d.sim, 80); let amp = 0; for (let i = 0; i < 700; i++) { d.sim.advance(Simulation.DT); amp = Math.max(amp, Math.abs(d.sol.current(R))); }
  const w = 2 * Math.PI * 1.59, XL = w * 1, XC = 1 / (w * 0.01), X = XL * XC / (XC - XL), I0 = 6 / Math.hypot(200, X);
  ok(Math.abs(amp / I0 - 1) < 3e-3, 'F104: 6 V at 1.59 Hz through 200 Ω into 1 H ∥ 10 mF drives ' + Fmt.A(I0) + ' (got ' + Fmt.A(amp) + ', off by ' + (100 * (amp / I0 - 1)).toFixed(2) + ' %)');
  // a jump (a thrown switch, an edit) starts the formula again from first order
  d.sim.jolt(); ok(d.sim.env().first && !(d.sim.env().order > 1), 'F104: after a jolt the next step is first order again');
  let orders = []; for (let i = 0; i < 6; i++) { orders.push(d.sim.env().order); d.sim.advance(Simulation.DT); } ok(orders.join() === '1,1,2,3,4,4', 'F104: ...and the order climbs back a step at a time (' + orders.join() + ')');
  // the steps straight after a jump are first order, so each is taken as many short ones: a step response is right from its first instant
  for (const R of [3, 12, 30, 100]) { const s = bench('rlc'), res = s.circuit.ofType(Resistor)[0], sw = s.circuit.ofType(Switch)[0], vm = s.circuit.ofType(Voltmeter)[0], am = s.circuit.ofType(L.Ammeter)[0]; res.setValue(R); s.sim.refresh();
    const a = R / 2, w0 = 10, wd = Math.sqrt(Math.abs(w0 * w0 - a * a)), vc = a < w0 ? (t) => 6 * (1 - Math.exp(-a * t) * (Math.cos(wd * t) + a / wd * Math.sin(wd * t))) : (t) => 6 * (1 - ((-a - wd) * Math.exp((-a + wd) * t) - (-a + wd) * Math.exp((-a - wd) * t)) / (-2 * wd));
    const cur = a < w0 ? (t) => 6 / wd * Math.exp(-a * t) * Math.sin(wd * t) : (t) => 6 / (2 * wd) * (Math.exp((-a + wd) * t) - Math.exp((-a - wd) * t));
    s.toggle(sw); const t0 = s.sim.t; let wv = 0, wi = 0, pk = 0; for (let k = 0; k < 1500; k++) { s.sim.advance(Simulation.DT); const t = s.sim.t - t0, I = Math.abs(am.number(s.sol)); pk = Math.max(pk, I); wv = Math.max(wv, Math.abs(Math.abs(vm.number(s.sol)) - Math.abs(vc(t)))); wi = Math.max(wi, Math.abs(I - Math.abs(cur(t)))); }
    ok(wv < 3e-4, 'F104: RLC step, R = ' + R + ' Ω: the capacitor voltage is within 0.3 mV of the exact curve at every step (' + (1e3 * wv).toFixed(3) + ' mV)');
    ok(wi < 2.5e-3 * pk, 'F104: RLC step, R = ' + R + ' Ω: the current within 0.25 % of its peak at every step, the first included (' + (100 * wi / pk).toFixed(3) + ' %)'); }
  // ...and a charging far too fast for the step to follow still never overshoots
  const q = load('b12.9-12.13@6 r14.8-18.8@1.7 c22.9-22.13@0.1 w12.8-14.8 w18.8-22.8 w22.8-22.9 w22.13-22.14 w12.14-22.14 w12.8-12.9 w12.13-12.14'), qc = q.circuit.ofType(Capacitor)[0];
  let over = 0; for (let k = 0; k < 40; k++) { q.sim.advance(Simulation.DT); over = Math.max(over, Math.abs(qc.vc) - 6); }
  ok(over < 1e-4 && Math.abs(Math.abs(qc.vc) - 6) < 1e-6, 'F104: 0.1 mF through 1.7 Ω (a time constant a twelfth of a step) charges to 6 V and not past it by a tenth of a millivolt (over by ' + over.toExponential(1) + ' V; it was 12 mV)');
  // a circuit that can swing faster than the step can follow keeps to the second-order formula, which nothing can set ringing
  const f = load('l14.8-18.8@0.05 c20.8-24.8@0.1 l26.9-26.13@0.05 c24.14-20.14@0.1 l18.14-14.14@0.05 c12.13-12.9@0.1 w12.8-14.8 w18.8-20.8 w24.8-26.8 w26.8-26.9 w26.13-26.14 w24.14-26.14 w18.14-20.14 w12.14-14.14 w12.8-12.9 w12.13-12.14');
  const cs = f.circuit.ofType(Capacitor); cs[0].vc = 3; f.sim.jolt(); const e0 = Math.max(...cs.map((c) => Math.abs(c.vc))); run(f.sim, 0.02); ok(f.sim.cuts === Simulation.FINEST && f.sim.env().order === 2, 'F104: three small coils and three small capacitors: the step is as short as it gets, and the formula stays second order (cuts ' + f.sim.cuts + ', order ' + f.sim.env().order + ')');
  let top = 0; for (let i = 0; i < 1500; i++) { f.sim.advance(Simulation.DT); top = Math.max(top, ...cs.map((c) => Math.abs(c.vc))); } ok(top <= 3 * (1 + 1e-6) && top > 0.5, 'F104: ...and its ringing never grows (largest ' + top.toFixed(4) + ' V from ' + e0.toFixed(2) + ' V)'); }

// ---- F105: the clock chip never gets longer than "t = 999.99 s", so the buttons beside it never move (and the toolbar never wraps) ----
{ ok(Fmt.clock(0) === 't = 0.00 s' && Fmt.clock(12.344) === 't = 12.34 s' && Fmt.clock(999.99) === 't = 999.99 s', 'F105: under 1000 s the clock shows hundredths (' + Fmt.clock(12.344) + ')');
  ok(Fmt.clock(999.996) === 't = 1000.0 s' && Fmt.clock(1234.56) === 't = 1234.6 s', 'F105: from 1000 s it shows tenths (' + Fmt.clock(1234.56) + ')');
  ok(Fmt.clock(9999.96) === 't = 10000 s' && Fmt.clock(54321.2) === 't = 54321 s', 'F105: from 10 000 s, whole seconds (' + Fmt.clock(54321.2) + ')');
  let longest = 0; for (let t = 0; t < 2e5; t += 7.3137) longest = Math.max(longest, Fmt.clock(t).length); ok(longest <= 12, 'F105: never more than 12 characters in a two-day run (' + longest + ')'); }

// ---- F106: a part turned back is the circuit drawn as it was ----
// Four quarter turns, or one and then the other way, used to leave the same circuit wired by another route (the
// RLC preset's inductor came back with a one-square step in the bottom rail). The picture is now the one before.
{ const lay = (c) => [...c.wireEdges()].sort().join(' ') + ' | ' + c.parts.map((e) => e.id + ':' + e.terminals().map((t) => P.key(t.p)).join('-')).join(' ');
  let full = 0, back = 0;
  for (const name of ['single', 'series', 'parallel', 'bridge', 'rc', 'rl', 'rlc', 'ac']) { const ids = bench(name).circuit.parts.filter((e) => e.info.rotatable).map((e) => e.id);
    for (const id of ids) for (const dir of [1, -1]) {
      { const b = bench(name), c = b.circuit, was = lay(c); let turned = 0; b.selId = id; for (let i = 0; i < 4; i++) if (b.rotate(dir).ok) turned++; else break;
        if (turned === 4) { full++; ok(lay(c) === was, name + ', ' + c.byId(id).type + ' ' + id + ' turned right round (' + dir + '): the wiring is as it was'); clean(b, name + ' after a full turn'); } }
      { const b = bench(name), c = b.circuit, was = lay(c); b.selId = id; if (b.rotate(dir).ok && b.rotate(-dir).ok) { back++; ok(lay(c) === was, name + ', ' + c.byId(id).type + ' ' + id + ' turned ' + dir + ' and back: the wiring is as it was'); } } } }
  ok(full > 60 && back > 60, 'most preset parts can be turned right round: ' + full + ', ' + back);
  // the memory is of one uninterrupted run of turns: any other edit in between and the wiring is laid afresh
  { const b = bench('rlc'), c = b.circuit, ind = c.ofType(Inductor)[0]; b.selId = ind.id; b.rotate(1); const one = lay(c); b.rotate(1); b.rotate(-1); ok(lay(c) === one, 'half turn and a quarter back: as after the first quarter');
    b.undo(); b.undo(); ok(lay(c) === one, 'undo steps back through the turns one at a time'); }
  // whichever way a battery ends up, every turn that reverses it says so (and no other turn does): the current
  // it drives is the one the notices add up to
  for (const name of ['single', 'series', 'rl']) for (let seed = 1; seed <= 12; seed++) { const b = bench(name), c = b.circuit, bat = c.ofType(Battery)[0], r = c.ofType(Resistor)[0];
    if (name === 'rl') b.toggle(c.ofType(Switch)[0]); const I = () => { const s = Solver.solve(c, { mode: 'dc' }); return s.current(r); }, i0 = I(); let flip = 1, x = seed * 7919, said = '';
    b.selId = bat.id; for (let k = 0; k < 9; k++) { x = (x * 1103515245 + 12345) % 2147483648; const dir = x & 4096 ? 1 : -1, res = b.rotate(dir); if (!res.ok) continue; if (res.reversed) flip = -flip; said += dir > 0 ? 'r' : 'l';
      const i = I(); if (Math.abs(i - flip * i0) > 1e-9 * Math.abs(i0)) { ok(false, name + ': battery turned ' + said + ' drives ' + i + ' A, should drive ' + flip * i0); break; } }
    ok(true, name + ' battery, turns ' + said); }
  // A lead that went straight to the part goes straight to it afterwards too. Loaded from a link the wires are
  // nobody's leads, and the lead to the turned inductor used to be hung on the end of the old wire: a staircase.
  { const b = load('b10.11-10.15@6 s11.10-15.10@0 a16.10-20.10 r21.10-25.10@3 l28.13-24.13@1 c20.16-16.16@10 g10.16-10.18 v20.18-16.18 w10.10-11.10 w15.10-16.10 w20.10-21.10 w25.10-28.10 w10.16-16.16 w20.13-24.13 w10.10-10.11 w10.15-10.16 w20.13-20.16 w20.16-20.18 w16.16-16.18 w28.10-28.13');
    const c = b.circuit, ind = c.ofType(Inductor)[0], t0 = c.turns(c.wireEdges()); b.selId = ind.id; ok(b.rotate(-1).ok, 'the inductor turns upright'); const E = c.wireEdges(), has = (a, z) => P.edgesOf(a, z).every((e) => E.has(e));
    ok(has({ c: 26, r: 15 }, { c: 26, r: 16 }) && has({ c: 26, r: 16 }, { c: 20, r: 16 }), 'its lower lead runs down and along the bottom rail: ' + c.encode().split('_').filter((w) => w[0] === 'w').join(' '));
    ok(!has({ c: 20, r: 13 }, { c: 24, r: 13 }), 'and the old lead is not left as a staircase'); ok(c.turns(E) <= t0, 'no more corners than before: ' + c.turns(E) + ' <= ' + t0); clean(b, 'turned upright'); }
  // where two elbows are the same length, the one that leaves the part in line with it is the one laid
  { const b = bench('rlc'), c = b.circuit, ind = c.ofType(Inductor)[0]; b.selId = ind.id; b.rotate(1); b.rotate(1); const E = c.wireEdges(), has = (a, z) => P.edgesOf(a, z).every((e) => E.has(e));
    ok(has({ c: 26, r: 15 }, { c: 26, r: 16 }) && has({ c: 26, r: 16 }, { c: 20, r: 16 }), 'half turn: the lower lead leaves the inductor in line, not sideways'); } }

// (F106, continued) what the parts are doing is turned with them: a charged capacitor keeps its charge the same
// way round in the circuit, a coil its current, and a meter goes on reading what its leads are across
{ for (let seed = 1; seed <= 10; seed++) { const b = bench('rc'), c = b.circuit, cap = c.ofType(Capacitor)[0], vm = c.ofType(Voltmeter)[0], sw = c.ofType(ThrowSwitch)[0];
    run(b.sim, 3); const v0 = vm.number(b.sol); ok(Math.abs(v0) > 1, 'the capacitor has charged: ' + v0); let x = seed * 104729, said = '';
    b.selId = cap.id; for (let k = 0; k < 8; k++) { x = (x * 1103515245 + 12345) % 2147483648; const dir = x & 4096 ? 1 : -1, res = b.rotate(dir); if (!res.ok) continue; said += dir > 0 ? 'r' : 'l';
      const v = vm.number(b.sol); if (!(Math.abs(v - v0) < 0.02 * Math.abs(v0))) { ok(false, 'capacitor turned ' + said + ': the meter across it reads ' + v + ' V, read ' + v0); break; } }
    ok(true, 'rc capacitor, turns ' + said); }
  for (let seed = 1; seed <= 10; seed++) { const b = bench('rlc'), c = b.circuit, ind = c.ofType(Inductor)[0], am = c.ofType(Ammeter)[0]; b.toggle(c.ofType(Switch)[0]); run(b.sim, 0.1);
    const i0 = am.number(b.sol); ok(Math.abs(i0) > 0.1, 'current is flowing: ' + i0); let x = seed * 15485863, said = '';
    b.selId = ind.id; for (let k = 0; k < 8; k++) { x = (x * 1103515245 + 12345) % 2147483648; const dir = x & 4096 ? 1 : -1, res = b.rotate(dir); if (!res.ok) continue; said += dir > 0 ? 'r' : 'l';
      const i = am.number(b.sol); if (!(Math.abs(i - i0) < 0.02 * Math.abs(i0))) { ok(false, 'inductor turned ' + said + ': the ammeter reads ' + i + ' A, read ' + i0); break; } }
    ok(true, 'rlc inductor, turns ' + said); }
  // a voltmeter turned right round reads what it read, and its trace has no step in it
  for (const dir of [1, -1]) { const b = bench('single'), c = b.circuit, vm = c.ofType(Voltmeter)[0]; run(b.sim, 0.05); const v0 = vm.number(b.sol); let sign = 1; b.selId = vm.id;
    for (let k = 0; k < 4; k++) { const res = b.rotate(dir); if (!res.ok) break; if (res.reversed) sign = -sign; near(vm.number(b.sol), sign * v0, 1e-9, 'single: voltmeter turn ' + (k + 1) + ' (' + dir + ') reads ' + (sign > 0 ? 'the same' : 'the opposite')); }
    near(vm.number(b.sol), v0, 1e-9, 'and right round, what it read at first'); run(b.sim, 0.05); const tr = vm.trace(); ok(tr.every((s) => Math.abs(s[1] - v0) < 1e-6), 'its trace is one level line'); } }

// (F106, continued) "now connected the other way round" is about the turn just made: the next turn takes it down
{ const b = bench('rlc'), c = b.circuit; b.selId = c.ofType(Battery)[0].id; b.rotate(1); const r2 = b.rotate(1); ok(r2.reversed && b.notice && /other way round/.test(b.notice.text), 'half turn in line: the battery is reversed and says so');
  const r3 = b.rotate(1); ok(r3.ok && !r3.reversed && !b.notice, 'the next quarter turn does not reverse it, and the notice has gone: ' + (b.notice && b.notice.text));
  const r4 = b.rotate(1); ok(r4.reversed && b.notice && /other way round/.test(b.notice.text), 'right round: it is the way it started, which is the other way round from a moment ago, and says so'); }

// ---- F107 a wire that is refused because of a part says WHICH part (as a refused move does) ----
{ const b = load('g20.12-20.14_b17.11-17.15@6_x23.13-26.12-26.14@0_r20.8-24.8@1000_l20.18-24.18@1_w17.11-26.11_w26.11-26.12'), t = new PointerTool(b), sig = b.circuit.encode();
  drag(b, t, P.of(23, 13), P.of(20, 8)); ok(b.circuit.encode() === sig && b.notice && b.notice.bad, 'F107 the wire is refused');
  ok(b.notice && /through (R₁|the ground)/.test(b.notice.text) && !/a part/.test(b.notice.text), 'F107 and the notice names the part it would run through: ' + (b.notice && b.notice.text));
  const c2 = load('r14.10-18.10@10_b14.14-18.14@6_b22.10-22.14@6').circuit, why = (a, z) => c2.checkPath([a, z]).why;
  ok(why(P.of(16, 6), P.of(16, 12)) === 'it would run through R₁', 'F107 straight through a resistor: ' + why(P.of(16, 6), P.of(16, 12)));
  ok(why(P.of(12, 10), P.of(20, 10)) === 'it would run along R₁', 'F107 along a resistor: ' + why(P.of(12, 10), P.of(20, 10)));
  ok(why(P.of(16, 12), P.of(16, 16)) === 'it would run through battery ε₁', 'F107 one of two batteries: ' + why(P.of(16, 12), P.of(16, 16)));
  const c3 = load('b14.14-18.14@6_g10.10-10.12').circuit;
  ok(c3.checkPath([P.of(16, 12), P.of(16, 16)]).why === 'it would run through the battery', 'F107 a lone battery is "the battery", not its symbol: ' + c3.checkPath([P.of(16, 12), P.of(16, 16)]).why);
  ok(c3.checkPath([P.of(8, 11), P.of(12, 11)]).why === 'it would run through the ground', 'F107 a part with no label: ' + c3.checkPath([P.of(8, 11), P.of(12, 11)]).why); }

// ---- F108 a wire drawn corner-wise from a part's end leaves it in line with the part, and arrives in line too ----
// (it used to take whichever way the pointer happened to set off: sideways out of the top of a battery as often as not)
{ const net = 'g20.14-20.16_b17.11-17.15@6_x23.13-26.12-26.14@0_r20.8-24.8@1000_l20.18-24.18@1', has = (b, a, z) => { const E = b.circuit.wireEdges(); return P.edgesOf(a, z).every((e) => E.has(e)); };
  const walk = (b, t, pts) => { t.down(at(b, pts[0])); for (let i = 1; i < pts.length; i++) for (let j = 1; j <= 4; j++) t.move(at(b, { c: pts[i - 1].c + (pts[i].c - pts[i - 1].c) * j / 4, r: pts[i - 1].r + (pts[i].r - pts[i - 1].r) * j / 4 })); t.up(at(b, pts[pts.length - 1])); };
  // the top of an upright battery to the left end of a resistor lying above and to the right: up, then along
  for (const way of [[P.of(17, 11), P.of(20, 8)], [P.of(17, 11), P.of(20, 11), P.of(20, 8)], [P.of(17, 11), P.of(17, 8), P.of(20, 8)]]) { const b = load(net), t = new PointerTool(b); walk(b, t, way);
    ok(has(b, P.of(17, 11), P.of(17, 8)) && has(b, P.of(17, 8), P.of(20, 8)), 'F108 battery to resistor, pointer going ' + way.map(P.key).join(' > ') + ': up out of the battery and into the end of the resistor: ' + b.circuit.encode().split('_').filter((w) => w[0] === 'w').join(' ')); clean(b, 'F108 battery to resistor'); }
  // ... and the same wire drawn from the other end
  { const b = load(net), t = new PointerTool(b); walk(b, t, [P.of(20, 8), P.of(17, 11)]); ok(has(b, P.of(17, 11), P.of(17, 8)) && has(b, P.of(17, 8), P.of(20, 8)), 'F108 drawn from the resistor end: the same wire'); }
  // the right end of the resistor to a throw of the switch: along, then down (the other way would run through the switch)
  { const b = load(net), t = new PointerTool(b); walk(b, t, [P.of(24, 8), P.of(26, 12)]); ok(has(b, P.of(24, 8), P.of(26, 8)) && has(b, P.of(26, 8), P.of(26, 12)), 'F108 resistor to switch'); }
  // one end in line either way: the corner that is in line at BOTH ends is not on offer, so the pointer decides as before
  { const b = load('r10.10-14.10@1000_r20.14-24.14@1000'), t = new PointerTool(b); walk(b, t, [P.of(14, 10), P.of(17, 10), P.of(20, 14)]); ok(has(b, P.of(14, 10), P.of(20, 10)) && has(b, P.of(20, 10), P.of(20, 14)), 'F108 a tie: along first when the pointer sets off along');
    const b2 = load('r10.10-14.10@1000_r20.14-24.14@1000'), t2 = new PointerTool(b2); walk(b2, t2, [P.of(14, 10), P.of(14, 12), P.of(20, 14)]); ok(has(b2, P.of(14, 10), P.of(14, 14)) && has(b2, P.of(14, 14), P.of(20, 14)), 'F108 a tie: down first when the pointer sets off down'); }
  // between two bare grid points nothing is in line with anything: the pointer decides
  { const b = load('r10.10-14.10@1000'), t = new PointerTool(b); walk(b, t, [P.of(4, 4), P.of(4, 6), P.of(8, 8)]); ok(has(b, P.of(4, 4), P.of(4, 8)) && has(b, P.of(4, 8), P.of(8, 8)), 'F108 bare points: the way the pointer set off'); }
  // a part's end that already has another part on it has no one direction: the pointer decides
  { const b = load('r10.10-14.10@1000_r14.10-14.14@1000'), c = b.circuit; ok(c.inLine(P.of(14, 10), P.of(15, 10)) === 0 && c.inLine(P.of(10, 10), P.of(9, 10)) === 1 && c.inLine(P.of(10, 10), P.of(10, 9)) === 0 && c.inLine(P.of(5, 5), P.of(5, 6)) === 0, 'F108 inLine'); } }

// ---- F109 batteries in parallel: identical ones share the current, different ones are called a clash ----
{ const { Panel } = L, sum = (b) => new Panel({ bench: b, state: { hide: false, peek: {} } }).summary();
  const pair = load('b10.10-10.14@6_b14.10-14.14@6_r18.10-18.14@2000_w10.10-18.10_w10.14-18.14'), [b1, b2] = pair.circuit.ofType(Battery), r = pair.circuit.ofType(Resistor)[0];
  ok(pair.sol.solved && !/no solution|clash|short/.test(sum(pair).statusText), 'F109 identical batteries in parallel are solved: ' + sum(pair).statusText); near(pair.sol.current(r), 3e-3, 1e-12, 'F109 the resistor carries E / R'); near(pair.sol.current(b1), 1.5e-3, 1e-12, 'F109 half from one battery'); near(pair.sol.current(b2), 1.5e-3, 1e-12, 'F109 half from the other');
  const odd = load('b10.10-10.14@6_b14.10-14.14@9_r18.10-18.14@2000_w10.10-18.10_w10.14-18.14'); ok(sum(odd).statusText === 'sources clash' && /disagree about the voltage/.test(sum(odd).summaryText), 'F109 different batteries in parallel: ' + sum(odd).statusText);
  // changing one battery's EMF by hand takes the pair from sharing to a clash, and back
  pair.edit(() => { b2.setValue(9); }, 'emf'); ok(pair.sol.clash && sum(pair).statusText === 'sources clash', 'F109 now they differ'); ok(!isFinite(pair.sol.current(b1)) && !isFinite(pair.sol.current(r)), 'F109 a clash has no currents to report, not 0: ' + pair.sol.current(b1) + ' ' + pair.sol.current(r)); ok(pair.sol.flow(r) === 0, 'F109 and nothing drifts along its wires');
  { const m = load('b12.9-12.13@6_g12.14-12.16_r14.8-18.8@1200_r20.8-24.8@1800_b9.10-9.14@9_a21.14-23.14_v14.5-18.5_w14.5-14.8_w18.5-18.8_w9.8-12.8_w12.8-14.8_w18.8-20.8_w24.8-26.8_w9.14-12.14_w12.14-21.14_w23.14-26.14_w12.8-12.9_w12.13-12.14_w26.8-26.14_w9.8-9.10'), am = m.circuit.ofType(Ammeter)[0], vm = m.circuit.ofType(Voltmeter)[0];
    ok(m.sol.clash && !!am.reading(m.sol).err && !isFinite(am.number(m.sol)), 'F109 an ammeter in a clashing circuit reads nothing, not 0 mA: ' + JSON.stringify(am.reading(m.sol))); ok(!!vm.reading(m.sol).err, 'F109 nor does a voltmeter');
    ok(PAINTERS.amm.value(am, m.sol) === Fmt.none, 'F109 and its tag on the canvas is a dash: ' + PAINTERS.amm.value(am, m.sol));
    m.edit(() => { m.circuit.ofType(Battery)[1].setValue(6); }, 'emf'); near(Math.abs(am.reading(m.sol).I), 2e-3, 1e-12, 'F109 it reads again once the batteries agree'); }
  { const lone = load('b10.10-10.14@6_l14.10-14.14@1_w10.10-14.10_w10.14-14.14_b20.10-20.14@6_r24.10-24.14@2000_w20.10-24.10_w20.14-24.14'), [ba, bb] = lone.circuit.ofType(Battery); lone.sim.playing = false;
    const dc = Solver.solve(lone.circuit, { mode: 'dc', dt: 0.002, t: 0 }); ok(!dc.solved && !isFinite(dc.current(ba)), 'F109 an unsolvable loop reports no current either: ' + dc.current(ba)); near(dc.current(bb), 3e-3, 1e-12, 'F109 while a separate circuit beside it is still read'); } pair.undo(); ok(pair.sol.solved && !pair.sol.clash, 'F109 undo: sharing again'); }

// ---- F110 an ammeter goes into a wire too short for it, at half its length ----
// A circuit built by hand from the menu has leads three squares long, and the menu's ammeter is four: there was
// nowhere at all to put it ("it needs 4 squares of straight wire").
{ const net = 'g18.18-18.20 o17.11-17.15@6~1 r25.11-25.15@10 l20.8-24.8@5 c20.18-24.18@20 a10.9-14.9 w17.8-20.8 w24.8-25.8 w17.18-18.18 w18.18-20.18 w24.18-25.18 w17.8-17.11 w17.15-17.18 w25.8-25.11 w25.15-25.18';
  // dropped across the three-square lead above the AC source
  { const b = load(net), tool = new PointerTool(b), am = () => b.circuit.ofType(Ammeter)[0], res = b.circuit.ofType(Resistor)[0];
    drag(b, tool, { c: 12, r: 9 }, { c: 17, r: 9 }); const a = am(), len = Math.abs(a.a.c - a.b.c) + Math.abs(a.a.r - a.b.r);
    ok(a.a.c === 17 && a.b.c === 17 && len === 2, 'F110 the ammeter is in the lead, two squares long: ' + a.encode()); ok(a.a.r < a.b.r, 'F110 its left end became its top end'); clean(b, 'F110 in the lead');
    ok(!b.notice || !b.notice.bad, 'F110 and nothing is refused: ' + (b.notice && b.notice.text)); run(b.sim, 0.3); near(Math.abs(a.reading(b.sol).I), Math.abs(b.sol.current(res)), 1e-12, 'F110 it reads the loop current'); ok(Math.abs(a.reading(b.sol).I) > 1e-3, 'F110 which is flowing');
    b.undo(); ok(am().encode() === 'a10.9-14.9' && b.circuit.encode() === Circuit.decode(net.replace(/ /g, '_'), Workbench.NC, Workbench.NR).encode(), 'F110 undo: full length, back where it was');
    // dragged on from there to empty board: it is its own length again
    drag(b, tool, { c: 12, r: 9 }, { c: 17, r: 9 }); b.undo(); drag(b, tool, { c: 12, r: 9 }, { c: 12, r: 4 }); ok(am().encode() === 'a10.4-14.4', 'F110 on empty board it keeps its length: ' + am().encode()); }
  // dropped along the one-square bit of wire at the corner: not even two squares there
  { const b = load(net), tool = new PointerTool(b); drag(b, tool, { c: 12, r: 9 }, { c: 24, r: 18 }); ok(b.circuit.ofType(Ammeter)[0].encode() === 'a10.9-14.9' && b.notice && b.notice.bad, 'F110 no room at all is still refused: ' + (b.notice && b.notice.text)); }
  // a wire long enough takes it whole, as before
  { const b = load('b10.10-10.14@6 r20.10-20.14@1000 w10.10-20.10 w10.14-20.14 a12.4-16.4'), tool = new PointerTool(b); drag(b, tool, { c: 14, r: 4 }, { c: 15, r: 10 }); ok(b.circuit.ofType(Ammeter)[0].encode() === 'a13.10-17.10', 'F110 a long wire takes it at full length: ' + b.circuit.ofType(Ammeter)[0].encode()); clean(b, 'F110 long wire'); }
  // an ammeter already in a wire, dragged to a short lead elsewhere: lifted out and squeezed in
  { const b = load('b10.10-10.14@6 r20.10-20.14@1000 r24.10-24.14@1000 a13.10-17.10 w10.10-13.10 w17.10-24.10 w10.14-20.14 w20.14-24.14 w20.14-20.17 w20.17-23.17'), tool = new PointerTool(b);
    drag(b, tool, { c: 15, r: 10 }, { c: 21, r: 17 }); const a = b.circuit.ofType(Ammeter)[0]; ok(a.a.r === 17 && a.b.r === 17 && Math.abs(a.a.c - a.b.c) === 2, 'F110 lifted into a short stub at half length: ' + a.encode()); clean(b, 'F110 lifted'); }
  // only an ammeter: a resistor dropped on the short lead is refused as before
  { const b = load(net.replace('a10.9-14.9', 'r10.9-14.9@1000')), tool = new PointerTool(b); drag(b, tool, { c: 12, r: 9 }, { c: 17, r: 9 }); ok(b.notice && b.notice.bad && /4 squares/.test(b.notice.text), 'F110 a resistor still needs its four squares: ' + (b.notice && b.notice.text)); } }

// ---- F111 a part is not dropped right up against another one, side by side ----
// A voltmeter dropped on the row just under a capacitor sat with the plates stuck into its dial and the two "+" signs
// on top of each other. Two parts lying the same way need a clear row between them wherever they overlap.
{ const net = 'g18.18-18.20 o17.11-17.15@6~1 r25.11-25.15@10 l20.8-24.8@5 c20.18-24.18@20 v10.13-14.13 w17.8-20.8 w24.8-25.8 w17.18-18.18 w18.18-20.18 w24.18-25.18 w17.8-17.11 w17.15-17.18 w25.8-25.11 w25.15-25.18';
  const b = load(net), tool = new PointerTool(b), vm = () => b.circuit.ofType(Voltmeter)[0];
  drag(b, tool, { c: 12, r: 13 }, { c: 22, r: 19 }); ok(vm().encode() === 'v10.13-14.13' && b.notice && b.notice.bad && /C₁ would be right beside it/.test(b.notice.text), 'F111 right under the capacitor is refused, and says why: ' + vm().encode() + ' ' + (b.notice && b.notice.text));
  drag(b, tool, { c: 12, r: 13 }, { c: 24, r: 19 }); ok(vm().encode() === 'v10.13-14.13' && b.notice && b.notice.bad, 'F111 half overlapping it is refused too: ' + vm().encode());
  drag(b, tool, { c: 12, r: 13 }, { c: 22, r: 17 }); ok(vm().encode() === 'v10.13-14.13' && b.notice && b.notice.bad, 'F111 and right above it: ' + vm().encode());
  drag(b, tool, { c: 12, r: 13 }, { c: 27, r: 19 }); ok(vm().encode() === 'v25.19-29.19', 'F111 past its end, not overlapping, is fine: ' + vm().encode()); clean(b, 'F111 past the end'); b.undo();
  drag(b, tool, { c: 12, r: 13 }, { c: 22, r: 20 }); ok(vm().encode() === 'v20.20-24.20' && (!b.notice || !b.notice.bad), 'F111 a clear row between them is fine: ' + vm().encode()); clean(b, 'F111 two rows down');
  // arrow keys the same
  b.select(vm()); b.nudge(0, -1); ok(vm().encode() === 'v20.20-24.20' && b.notice && b.notice.bad && /right beside/.test(b.notice.text), 'F111 an arrow key does not push it up against the capacitor either: ' + vm().encode() + ' ' + (b.notice && b.notice.text));
  // upright parts: a column between them
  { const u = load('b10.10-10.14@6 r20.10-20.14@1000 w10.10-20.10 w10.14-20.14 v4.4-8.4'), t = new PointerTool(u), r = u.circuit.ofType(Resistor)[0]; u.select(u.circuit.ofType(Voltmeter)[0]); u.rotate(1); const v = u.circuit.ofType(Voltmeter)[0], mid = { c: v.a.c, r: (v.a.r + v.b.r) / 2 };
    drag(u, t, mid, { c: 21, r: 12 }); ok(u.circuit.ofType(Voltmeter)[0].a.c !== 21 && u.notice && u.notice.bad && /R₁ would be right beside it/.test(u.notice.text), 'F111 upright beside an upright resistor is refused: ' + u.circuit.ofType(Voltmeter)[0].encode() + ' ' + (u.notice && u.notice.text));
    drag(u, t, mid, { c: 22, r: 12 }); ok(u.circuit.ofType(Voltmeter)[0].a.c === 22, 'F111 a column away is fine: ' + u.circuit.ofType(Voltmeter)[0].encode()); }
  // a part that is already side by side (an old link) can still be slid along and taken away
  { const o = load(net.replace('v10.13-14.13', 'v20.19-24.19')), t = new PointerTool(o), v = () => o.circuit.ofType(Voltmeter)[0];
    drag(o, t, { c: 22, r: 19 }, { c: 23, r: 19 }); ok(v().encode() === 'v21.19-25.19', 'F111 already beside it: it may slide along: ' + v().encode()); drag(o, t, { c: 23, r: 19 }, { c: 23, r: 21 }); ok(v().encode() === 'v21.21-25.21', 'F111 and move away: ' + v().encode()); }
  // parts that meet round a corner are not "side by side": every preset still loads and nothing in one is crowded
  for (const name of Object.keys(PRESETS.nets)) { const q = bench(name), ps = q.circuit.parts; ok(ps.every((x) => !q.circuit.crowdedBy(x, x.geometry(), true)), 'F111 nothing side by side in the ' + name + ' preset'); } }

// F112: a capacitor, inductor or AC source lying loose on the bench does not start the clock. (It used to: the
// toolbar showed "Pause" and a ticking "t = 3.17 s" over a summary that said "nothing is wired up yet".)
{ const { Panel } = L, sum = (b) => new Panel({ bench: b, state: { hide: false, peek: {} } }).summary();
  const b = new Workbench(); b.view.resize(560, 400); b.add('cap');
  ok(!b.sim.timed, 'F112 a loose capacitor: no clock'); const t0 = b.sim.t; b.sim.advance(0.05); ok(b.sim.t === t0, 'F112 ...and time stands still');
  ok(sum(b).statusText === 'DC solved' && /nothing is wired up yet/.test(sum(b).summaryText), 'F112 ...and the summary agrees: ' + sum(b).statusText);
  b.add('ind'); b.add('ac'); ok(!b.sim.timed, 'F112 loose inductor and AC source: still no clock');
  // a DC loop with a capacitor lying beside it is a DC circuit
  const dc = load('b10.10-10.14@6 r10.10-14.10@1000 w14.10-14.14 w10.14-14.14 c18.10-18.14@10');
  ok(!dc.sim.timed, 'F112 a loose capacitor beside a DC loop: no clock'); ok(!/running|t=0/.test(sum(dc).summaryText), 'F112 ...and nothing about a transient: ' + sum(dc).summaryText);
  near(dc.sol.current(dc.circuit.ofType(Resistor)[0]), 0.006, 1e-9, 'F112 ...the loop still solves');
  // half wired is still not wired; both ends joined is
  const half = load('c18.10-18.14@10 w18.10-20.10'); ok(!half.sim.timed, 'F112 one end wired: no clock');
  const full = load('c18.10-18.14@10 r20.10-20.14@1000 w18.10-20.10 w18.14-20.14'); ok(full.sim.timed, 'F112 both ends wired: the clock is there');
  const t1 = full.sim.t; full.sim.advance(0.05); ok(full.sim.t > t1, 'F112 ...and runs');
  // ...and so is a string of parts that does not yet come round into a loop: the clock arrives with the wire that closes it
  const open = load('g20.12-20.14 c13.13-17.13@10 b23.11-23.15@6 l16.8-20.8@1 r16.18-20.18@1000 w13.8-16.8 w20.8-23.8 w23.8-23.11 w13.8-13.13');
  ok(!open.sim.timed, 'F112 an inductor wired at both ends but in no loop: no clock'); ok(!/running/.test(sum(open).summaryText), 'F112 ...and not "running": ' + sum(open).summaryText);
  const shut = load('c13.13-17.13@10 b23.11-23.15@6 l16.8-20.8@1 r16.18-20.18@1000 w13.8-16.8 w20.8-23.8 w23.8-23.11 w13.8-13.13 w17.13-17.16 w14.16-17.16 w14.16-14.18 w14.18-16.18 w20.18-23.18 w23.15-23.18');
  ok(shut.sim.timed, 'F112 the loop closed: the clock is there');
  // a loop that is only waiting for its switch is a circuit with a clock (the preset RC opens this way); one closed only by a voltmeter is not
  const sw = load('c13.13-17.13@10 b23.11-23.15@6 s16.8-20.8@0 r16.18-20.18@1000 w13.8-16.8 w20.8-23.8 w23.8-23.11 w13.8-13.13 w17.13-17.16 w14.16-17.16 w14.16-14.18 w14.18-16.18 w20.18-23.18 w23.15-23.18');
  ok(sw.sim.timed, 'F112 a loop with its switch open has a clock');
  const vm0 = load('c13.13-17.13@10 v13.10-17.10 w13.10-13.13 w17.10-17.13'); ok(!vm0.sim.timed, 'F112 a capacitor with only a voltmeter across it: no clock');
  const acOpen = load('o12.9-12.13@6~0.5 l22.9-22.13@2 w12.8-20.8 w22.8-22.9 w22.13-22.14 w12.14-22.14 w12.8-12.9 w12.13-12.14');
  ok(/look for a gap in the loop/.test(sum(acOpen).summaryText), 'F112 an AC source in an open string: the summary points at the gap: ' + sum(acOpen).summaryText);
  // a graph switched on always has a clock, loose parts or not
  const g = new Workbench(); g.view.resize(560, 400); g.add('cap'); const vm = g.add('volt'); g.toggleGraph(vm); ok(g.sim.timed, 'F112 a graph keeps the clock');
  // every preset that had a clock still has one
  for (const name of ['rc', 'rl', 'rlc', 'ac']) ok(bench(name).sim.timed, 'F112 preset ' + name + ' is timed');
  for (const name of ['single', 'series', 'parallel', 'bridge']) ok(!bench(name).sim.timed, 'F112 preset ' + name + ' is not'); }

// F113: a refusal names the part it is about ("Can’t rotate S₁ — ..."), not "it"
{ const b = load('g23.18-23.20 x23.13-26.12-26.14@1 c19.13-19.17@10 r26.12-30.12@1000 b30.12-30.16@6 r26.14-26.18@470 w19.13-23.13 w19.18-23.18 w23.18-26.18 w26.18-30.18 w19.17-19.18 w30.16-30.18');
  const sw = b.circuit.ofType(ThrowSwitch)[0], net = b.circuit.encode(); b.select(sw); const r = b.rotate(1);
  if (!r.ok) ok(/^Can’t rotate S₁ — /.test(b.notice.text) && b.notice.bad, 'F113 a refused turn names the switch: ' + b.notice.text);
  if (!r.ok) ok(b.circuit.encode() === net, 'F113 ...and leaves the circuit alone'); else clean(b, 'F113 the switch turned');
  const two = load('b8.10-8.14@6 b12.10-12.14@6 g8.14-8.16'), bat = two.circuit.ofType(Battery)[0]; two.select(bat); const m = two.nudge(0, 1);
  ok(!m.ok && /^Can’t move battery ε₁ there — /.test(two.notice.text), 'F113 one of two batteries is named: ' + two.notice.text); }

// F114: an AC source that is not part of any loop is not running. Its sine starts, from zero, at the instant its
// loop is closed -- so v = V sin(2 pi f t) holds on the clock face of a circuit built by hand, whatever else was
// running on the bench meanwhile. (It used to carry on from wherever the bench clock had got to: a source dropped
// into the gap a battery had left started mid-cycle, and one lying loose read a frozen "4.88 V".)
{ const { AcSource } = L, V = (b) => b.sol.measure(b.circuit.ofType(AcSource)[0]).dV;
  // an RC loop running beside an AC string with a gap in it
  const b = load('o12.9-12.13@6~0.5 l22.9-22.13@2 w12.8-20.8 w22.8-22.9 w22.13-22.14 w12.14-22.14 w12.8-12.9 w12.13-12.14 b4.20-4.24@6 r4.20-8.20@1000 c8.20-8.24@10 w4.24-8.24'), tool = new PointerTool(b);
  ok(b.sim.timed, 'F114 the RC loop has a clock'); run(b.sim, 0.7); near(b.sim.t, 0.7, 1e-9, 'F114 ...which runs');
  near(V(b), 0, 1e-12, 'F114 the AC source in its open string reads 0 V meanwhile');
  drag(b, tool, P.of(20, 8), P.of(22, 8)); clean(b, 'F114 gap closed'); ok(b.circuit.looped(b.circuit.ofType(AcSource)[0]), 'F114 the wire closes the AC loop');
  near(V(b), 0, 1e-9, 'F114 the source starts from 0 V at that instant'); run(b.sim, 0.5);
  near(Math.abs(V(b)), 6, 1e-6, 'F114 ...and a quarter period (0.5 s at 0.5 Hz) later is at its peak');
  near(Math.abs(b.circuit.ofType(Inductor)[0].il), 6 / (Math.PI * 2) * (1 - Math.cos(Math.PI * 0.5)), 2e-4, 'F114 ...the inductor current is (V/ωL)(1 − cos ωt)');
  // undo opens the loop again: the source rests; redo closes it: it starts again from zero
  run(b.sim, 0.3); b.undo(); near(V(b), 0, 1e-12, 'F114 undo: the source rests again'); run(b.sim, 0.4); near(V(b), 0, 1e-12, 'F114 ...and stays at rest while the clock runs');
  b.redo(); near(V(b), 0, 1e-9, 'F114 redo: it starts from zero again'); run(b.sim, 0.5); near(Math.abs(V(b)), 6, 1e-6, 'F114 ...peak a quarter period on');
  // a source swapped in for a battery after the circuit has been running
  const s = load('b12.9-12.13@6 r14.8-18.8@1200 c22.9-22.13@2 w12.8-14.8 w18.8-22.8 w22.8-22.9 w22.13-22.14 w12.14-22.14 w12.8-12.9 w12.13-12.14'); run(s.sim, 7.4);
  s.select(s.circuit.ofType(Battery)[0]); s.remove(); const ac = s.add('ac'); near(s.sol.measure(ac).dV, 0, 1e-12, 'F114 a loose AC source reads 0 V, not where the bench clock happens to be');
  // a loop that is only waiting for its switch is a running source, as before (the AC preset: phase carries through the throw)
  const p = bench('ac'), sw = p.circuit.ofType(Switch)[0]; if (sw) { if (sw.closed) p.toggle(sw); run(p.sim, 0.3); ok(Math.abs(V(p)) > 0.1, 'F114 behind an open switch the source runs on'); }
  // a change of frequency still carries the swing on from where it is
  const f = load('o12.9-12.13@6~0.5 r14.8-18.8@1200 w12.8-14.8 w18.8-22.8 w22.8-22.14 w12.14-22.14 w12.8-12.9 w12.13-12.14'); run(f.sim, 0.3); const v0 = V(f);
  f.select(f.circuit.ofType(AcSource)[0]); f.type('freq', 2); f.endTyping(); near(V(f), v0, 1e-9, 'F114 a new frequency does not jump the voltage'); }

// F115: a charged capacitor left in a string that no longer comes round leaks a fraction of a nanoamp through the
// solver's own leak conductance. That is "no current" on every readout, and the summary has to say so too (it said
// "add meters to read any branch", since one branch current was not exactly zero).
{ const { Panel } = L, b = load('g20.12-20.14 c13.13-17.13@10 b23.11-23.15@6 l16.8-20.8@1 r16.18-20.18@4 w13.8-16.8 w20.8-23.8 w16.14-17.14 w20.18-23.18 w23.8-23.11 w23.15-23.18 w13.8-13.13 w17.13-17.14 w16.14-16.18');
  run(b.sim, 1.5); b.select(b.circuit.ofType(Battery)[0]); b.remove(); b.add('ac'); const cap = b.circuit.ofType(Capacitor)[0];
  ok(Math.abs(cap.vc) > 1, 'F115 the capacitor is left charged'); ok(!b.sim.timed, 'F115 no loop, no clock');
  const t = new Panel({ bench: b, state: { hide: false, peek: {} } }).summary().summaryText;
  ok(/No current is flowing — look for a gap in the loop\./.test(t), 'F115 the summary says no current is flowing: ' + t); }

// F116: an ammeter lying loose on the bench has nothing to record. (It wrote down 0 mA at every step, so when it
// was dropped into a running loop its graph showed a flat line and then a cliff that the circuit never did.)
// One wired into a string that carries no current is reading that string, and records its true zero.
{ const b = load('o12.9-12.13@6~0.5 r14.8-18.8@100 w12.8-12.9 w12.8-14.8 w18.8-22.8 w22.8-22.14 w12.14-22.14 w12.13-12.14 a14.18-18.18'), tool = new PointerTool(b), am = () => b.circuit.ofType(Ammeter)[0];
  run(b.sim, 0.6); ok(am().samples.length === 0, 'F116 a loose ammeter records nothing: ' + am().samples.length + ' samples');
  drag(b, tool, P.of(16, 18), P.of(16, 14)); clean(b, 'F116 ammeter dropped into the loop'); ok(b.circuit.looped(am()), 'F116 it is spliced into the loop: ' + b.circuit.encode());
  run(b.sim, 0.2); const tr = am().trace(); ok(tr.length > 50 && tr[0][0] >= 0.6 - 1e-9, 'F116 its trace starts where it joined the circuit: ' + (tr[0] && tr[0][0]));
  ok(tr.every((q) => Math.abs(Math.abs(q[1]) - 0.06 * Math.abs(Math.sin(Math.PI * q[0]))) < 1e-6), 'F116 ...and every sample is the loop current');
  b.undo(); run(b.sim, 0.2); const n = am().samples.length; run(b.sim, 0.2); ok(am().samples.length === n, 'F116 undo: loose again, it stops recording');
  // one end joined, the other free: still not in the circuit
  const h = load('b12.9-12.13@6 r14.8-18.8@1000 c22.9-22.13@2 w12.8-12.9 w12.8-14.8 w18.8-22.8 w22.8-22.9 w22.13-22.14 w12.14-22.14 w12.13-12.14 a22.14-26.14'); run(h.sim, 0.3);
  ok(h.circuit.ofType(Ammeter)[0].samples.length === 0, 'F116 an ammeter hanging by one lead records nothing');
  // both ends wired, in a string with a gap: a true zero, recorded
  const z = load('b12.9-12.13@6 r14.8-18.8@1000 c22.9-22.13@2 w12.8-12.9 w12.8-14.8 w18.8-22.8 w22.8-22.9 w22.13-22.14 w12.14-22.14 w12.13-12.14 a24.10-28.10* w22.8-24.8 w24.8-24.10 w28.10-28.14 w28.14-30.14'); run(z.sim, 0.3);
  const zs = z.circuit.ofType(Ammeter)[0].samples; ok(zs.length > 0 && zs.every((q) => q[1] === 0), 'F116 an ammeter wired into a dead-end branch records its zero'); }

// F117: a part moved to where a wire crosses its body, or ends under it, is refused because that wire is in the
// way. (The reason given was the one for a part dropped ALONG a wire that branches under it: "a wire turns off
// part-way along it (it needs 4 squares of straight wire)" -- which is not what the reader is looking at.)
{ const net = 'b12.9-12.13@6 r14.8-18.8@1000 w12.8-12.9 w12.8-14.8 w18.8-22.8 w22.8-22.14 w12.14-22.14 w12.13-12.14 w16.14-16.15 ';
  // (across a short run of wire: on a long straight one a loose part is turned to go in line with it instead)
  const b = load(net + 'w20.14-20.16 w20.16-24.16 v24.20-28.20'), tool = new PointerTool(b), before = b.circuit.encode();
  drag(b, tool, P.of(26, 20), P.of(20, 15)); ok(b.circuit.encode() === before, 'F117 a voltmeter dropped across a wire is put back');
  ok(b.notice && b.notice.text === 'Put back where it was — can’t go there: a wire is in the way', 'F117 ...because the wire is in the way: ' + (b.notice && b.notice.text));
  // a resistor dropped the same way might have been meant to go INTO the wire: it is told what that takes
  const e = load(net + 'w20.14-20.16 w20.16-24.16 r24.20-28.20@500'), et = new PointerTool(e); drag(e, et, P.of(26, 20), P.of(20, 15));
  ok(e.notice && e.notice.text === 'Put back where it was — can’t go there: a wire is in the way (to go into a wire, it needs 4 squares of straight wire)', 'F117 a resistor across a short wire: ' + (e.notice && e.notice.text));
  // a wire that ends under the body
  const c = load(net + 'r14.17-18.17@500'); c.select(c.circuit.ofType(Resistor)[1]); c.nudge(0, -1); const r = c.nudge(0, -1);
  ok(!r.ok && r.why === 'a wire is in the way', 'F117 a wire end under the body: ' + r.why); ok(c.notice.text === 'Can’t move R₂ there — a wire is in the way', 'F117 the notice: ' + c.notice.text);
  // along a wire that branches under the part, the old reason stands
  const d = load(net + 'r14.17-18.17@500'), dt = new PointerTool(d); drag(d, dt, P.of(16, 17), P.of(16, 14));
  ok(d.notice && d.notice.text === 'Put back where it was — can’t go there: a wire turns off part-way along it (it needs 4 squares of straight wire)', 'F117 along a branching wire: ' + (d.notice && d.notice.text)); }

// F118 -- a graph turned on for a meter that is joined to nothing was an empty grid with a 0-10 mA axis: nothing
// said why there was no line. It says so, naming the meter; a meter with a trace beside it needs no such note.
{ const { GraphPainter } = L, texts = [], grad = { addColorStop() {} };
  const g = new Proxy({}, { get: (t, k) => k === 'fillText' ? (s) => texts.push(String(s)) : k === 'measureText' ? () => ({ width: 10 }) : (k === 'createRadialGradient' || k === 'createLinearGradient') ? () => grad : (typeof k === 'string' && /^[a-z]/.test(k) && !(k in t) ? () => {} : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
  const draw = (traces) => { texts.length = 0; new GraphPainter().draw(g, { dpr: 1, w: 550, h: 150, top: 0, t: 2, origin: 0, hover: null, traces }); return texts.slice(); };
  const one = draw([{ kind: 'amm', name: 'A₂', shown: true, samples: [] }]); ok(one.includes('A₂ is not connected — nothing to plot yet.'), 'F118 a loose meter\'s empty graph says why: ' + one.join(' | '));
  const two = draw([{ kind: 'amm', name: 'A₂', shown: true, samples: [] }, { kind: 'volt', name: 'V₁', shown: true, samples: [] }]); ok(two.includes('These meters are not connected — nothing to plot yet.'), 'F118 two loose meters: ' + two.join(' | '));
  const mixed = draw([{ kind: 'amm', name: 'A₂', shown: true, samples: [] }, { kind: 'amm', name: 'A₁', shown: true, samples: [[0, 0], [1, 0.1], [2, 0.2]] }]); ok(!mixed.some((x) => /not connected/.test(x)), 'F118 with a live trace beside it there is no note');
  // on the bench: the menu's loose ammeter, graph on
  const b = bench('rlc'); b.add('amm'); const am = b.circuit.ofType(Ammeter).pop(); b.toggleGraph(am); run(b.sim, 0.5);
  const tr = b.traces().find((t) => t.id === am.id); ok(tr && tr.samples.length === 0, 'F118 the loose ammeter has no samples to draw');
  const seen = draw(b.traces().map((t) => ({ ...t, name: 'A₁', shown: true }))); ok(seen.some((x) => /not connected/.test(x)), 'F118 and its graph says so'); }

// F119 -- with a graph docked the canvas is a wide strip. A meter's tag under the zoom control then sent the whole
// circuit up into the canvas ABOVE the control: a fifth of the strip's height given up, the circuit at 55 %
// with empty board all down its right-hand side. A circuit that the strip's height already limits is put
// BESIDE the control instead, at the size it had.
{ const net = 'g20.12-20.14 c13.13-17.13@10 l16.8-20.8@1 r16.18-20.18@4 o23.11-23.15@6~0.5 a13.8-13.12 v9.17-13.17 a23.16-23.18* w13.8-16.8 w20.8-23.8 w16.14-17.14 w20.18-23.18 w13.12-13.13 w17.13-17.14 w16.14-16.18 w23.8-23.11 w23.15-23.16';
  const b = load(net), V = b.view, inView = () => { const box = Renderer.fitBox(b.circuit, V.labelScale), a = V.toWorld(0, 0), z = V.toWorld(V.w, V.h); return box.x0 >= a.x - 1e-6 && box.y0 >= a.y - 1e-6 && box.x1 <= z.x + 1e-6 && box.y1 <= z.y + 1e-6; };
  V.resize(560, 248); b.fit(); ok(V.scale > 0.68, 'F119 beside the control, not above it: ' + V.percent); ok(!b.covered(), 'F119 nothing under the control'); ok(inView(), 'F119 and all of it on the canvas'); ok(V.auto, 'F119 the view is still the sim\'s own');
  // the full canvas, where height is not what limits: as before, and nothing lost
  V.resize(560, 400); b.fit(); ok(!b.covered() && inView() && V.scale > 0.95, 'F119 on the full canvas: ' + V.percent);
  // every preset, on the strip and on the full canvas: never under the control, never off the canvas, never smaller than before
  for (const name of PRESETS.names || ['single', 'series', 'parallel', 'bridge', 'rc', 'rl', 'rlc', 'ac']) for (const h of [248, 400]) { const p = bench(name); p.view.resize(560, h); p.fit(); const P2 = p.view, box = Renderer.fitBox(p.circuit, P2.labelScale), a = P2.toWorld(0, 0), z = P2.toWorld(P2.w, P2.h);
    ok(!p.covered() && box.x0 >= a.x - 1e-6 && box.y0 >= a.y - 1e-6 && box.x1 <= z.x + 1e-6 && box.y1 <= z.y + 1e-6, 'F119 ' + name + ' at ' + h + ' px: clear and in view (' + P2.percent + ')'); } }

// ---- F120: a 2-position switch throws on a click anywhere between its pole and its throws; a zoomed-out lever is no smaller a target ----
{ const net = 'g12.16-12.18 b12.10-12.14@6 x18.9-15.8-15.10@0 r19.9-23.9@10 a23.9-27.9 l27.10-27.14@15 w12.8-12.10 w12.8-15.8 w15.10-15.16 w18.9-19.9 w27.9-27.10 w27.14-27.16 w12.16-27.16 w12.14-12.16';
  const click = (b, c, r) => { const t = new PointerTool(b); t.down(at(b, { c, r })); t.up(at(b, { c, r })); };
  for (const scale of [1, 0.74, 0.5]) { const b = load(net), sw = b.circuit.ofType(ThrowSwitch)[0]; b.view.scale = scale; b.view.auto = false;
    click(b, 16.35, 9); ok(sw.position === 2, 'a click in the mouth of the switch throws it (scale ' + scale + '): position ' + sw.position);
    click(b, 16.35, 9); ok(sw.position === 1, 'and again throws it back (scale ' + scale + ')');
    click(b, 16, 10); ok(sw.position === 2, 'a click on contact 2 goes to 2 (scale ' + scale + ')'); click(b, 16, 10); ok(sw.position === 2, 'and a second click there stays on 2');
    click(b, 16, 8); ok(sw.position === 1, 'a click on contact 1 goes to 1 (scale ' + scale + ')');
    click(b, 17.5, 9); ok(sw.position === 1 && b.selId === sw.id, 'the pole lead selects the switch without throwing it (scale ' + scale + ')');
    click(b, 15.5, 8); ok(sw.position === 1 && b.selId === sw.id, 'so does a throw lead (scale ' + scale + ')'); }
  // the plain switch: its lever is as easy to hit at 50 % as at 100 %
  for (const scale of [1, 0.5]) { const b = bench('rl'), sw = b.circuit.ofType(Switch)[0]; b.view.scale = scale; b.view.auto = false; const t = new PointerTool(b), m = View.xy({ c: 12, r: 10 }), q = (dy) => { const s = b.view.toCanvas(m.x, m.y); return { x: m.x, y: m.y + dy / scale, sx: s.x, sy: s.y + dy }; };
    t.down(q(10)); t.up(q(10)); ok(sw.closed, 'a click 10 screen px below the middle of the switch throws it (scale ' + scale + ')'); } }

// ---- F121: with no resistance in its loop a capacitor charges at once -- at t = 0 just as when a switch closes -- and the bench says so ----
{ const said = (b) => (b.notice && b.notice.text) || '';
  // a battery straight across a capacitor, through an ammeter: no million-amp reading at t = 0, and none on the graph
  { const b = load('g10.16-10.18 b10.11-10.15@6 a11.10-15.10* c18.11-18.15@10 w10.10-10.11 w10.10-11.10 w15.10-18.10 w18.10-18.11 w18.15-18.16 w10.16-18.16 w10.15-10.16'), am = b.circuit.ofType(Ammeter)[0], c1 = b.circuit.ofType(Capacitor)[0];
    near(Math.abs(c1.vc), 6, 1e-6, 'a battery straight across a capacitor has charged it at t = 0'); ok(Math.abs(am.number(b.sol)) < 1e-6, 'and the ammeter does not read a million amps: ' + Fmt.A(am.number(b.sol)));
    ok(am.trace().every(([, i]) => Math.abs(i) < 1e-6), 'nor does its trace start with one'); ok(said(b) === 'C₁ charged at once — no resistance in its loop to limit the current', 'the bench says why it is already charged: ' + said(b));
    run(b.sim, 0.3); ok(am.trace().every(([, i]) => Math.abs(i) < 1e-6), 'the trace stays at zero'); b.notice = null; b.restart(); near(Math.abs(c1.vc), 6, 1e-6, 'the same after "t = 0"'); ok(Math.abs(am.number(b.sol)) < 1e-6, 'and no spike then either');
    ok(/^C₁ charged at once/.test(said(b)), 'and it says so again: ' + said(b)); }
  // a switch closed on it
  { const b = load('g10.16-10.18 b10.11-10.15@6 s11.10-15.10@0 a15.10-18.10* c18.11-18.15@10 w10.10-10.11 w10.10-11.10 w18.10-18.11 w18.15-18.16 w10.16-18.16 w10.15-10.16'), sw = b.circuit.ofType(Switch)[0], c1 = b.circuit.ofType(Capacitor)[0];
    ok(said(b) === '', 'nothing to say while the switch is open: ' + said(b)); run(b.sim, 0.1); b.toggle(sw); near(Math.abs(c1.vc), 6, 1e-6, 'closing the switch charges it at once');
    ok(said(b) === 'C₁ charged at once — no resistance in its loop to limit the current', 'and the bench says so: ' + said(b)); }
  // two capacitors joined by bare wire share their charge
  { const b = load('g10.16-10.18 b10.11-10.15@6 x15.10-12.9-12.11@0 c18.11-18.15@10 c12.12-12.16@10 w10.9-10.11 w10.9-12.9 w15.10-18.10 w18.10-18.11 w18.15-18.16 w10.16-12.16 w12.16-18.16 w10.15-10.16 w12.11-12.12'), sw = b.circuit.ofType(ThrowSwitch)[0], [c1, c2] = b.circuit.ofType(Capacitor);
    run(b.sim, 0.1); b.toggle(sw); near(Math.abs(c1.vc), 3, 1e-6, 'C₁ shares'); near(Math.abs(c2.vc), 3, 1e-6, 'C₂ takes half');
    ok(said(b) === 'C₁ and C₂ shared their charge at once — no resistance between them to limit the current', 'and the bench says so: ' + said(b));
    run(b.sim, 0.1); b.toggle(sw); ok(/^C₁ charged at once/.test(said(b)), 'back on the battery, C₁ alone is topped up: ' + said(b)); }
  // a charged capacitor shorted by a switch
  { const b = load('g10.16-10.18 b10.11-10.15@6 r11.10-15.10@100 c18.11-18.15@10 s22.11-22.15@0 w10.10-10.11 w10.10-11.10 w15.10-18.10 w18.10-22.10 w18.10-18.11 w22.10-22.11 w18.15-18.16 w22.15-22.16 w10.16-18.16 w18.16-22.16 w10.15-10.16'), sw = b.circuit.ofType(Switch)[0], c1 = b.circuit.ofType(Capacitor)[0];
    run(b.sim, 3); ok(Math.abs(c1.vc) > 5.5, 'charged through its resistor: ' + c1.vc.toFixed(3)); ok(said(b) === '', 'with nothing said: ' + said(b)); b.toggle(sw); near(c1.vc, 0, 1e-6, 'shorted: empty at once');
    ok(said(b) === 'C₁ discharged at once — no resistance in its loop to limit the current', 'and the bench says so: ' + said(b)); }
  // nothing of the kind where there is resistance: every preset, every switch, thrown while running
  for (const [name] of PRESETS.list) { const b = bench(name), seen = [];
    if (/at once/.test(said(b))) seen.push('load: ' + said(b));
    for (let k = 0; k < 4; k++) for (const sw of [...b.circuit.ofType(Switch), ...b.circuit.ofType(ThrowSwitch)]) { run(b.sim, 0.37); b.notice = null; b.toggle(sw); if (/charged|shared/.test(said(b))) seen.push(said(b)); }
    b.notice = null; b.restart(); if (/at once/.test(said(b))) seen.push('restart: ' + said(b));
    ok(!seen.length, name + ': no capacitor is said to jump: ' + seen.join(' | ')); }
  // and the inductor's spark is still what is said when a coil is cut off
  { const b = bench('rl'), sw = b.circuit.ofType(Switch)[0]; b.toggle(sw); run(b.sim, 1); b.toggle(sw); ok(/cut off at once/.test(said(b)), 'the spark notice: ' + said(b)); } }

// ---- F122: a meter's boxed reading keeps a little air between itself and the next label (they used to be allowed to touch) ----
{ const gaps = (b) => { const lay = [...Renderer.layout(null, { circuit: b.circuit, names: b.circuit.labels(), sol: b.sol, hide: false, revealed: () => true, view: b.view })], ls = b.view.labelScale, out = [];
    for (const [i, A] of lay) for (const [j, B] of lay) { if (i >= j || !(A.spec.boxed || B.spec.boxed)) continue;
      const dx = Math.max(A.x0 - B.x1, B.x0 - A.x1), dy = Math.max(A.y0 - B.y1, B.y0 - A.y1), gap = Math.max(dx, dy); if (gap < 3 * ls - 1e-6) out.push(b.circuit.nameOf(b.circuit.byId(i)) + '/' + b.circuit.nameOf(b.circuit.byId(j)) + ' ' + (gap / ls).toFixed(1)); }
    return out; };
  // the AC-driven RLC preset with a resistor added below it: the view drops to 72 %, and C₁'s name ended up against V₁'s reading
  const b = load('o10.11-10.15@6~1.59 a16.10-20.10* r21.10-25.10@3 l26.11-26.15@1 c20.16-16.16@10 g10.16-10.18 v13.11-13.15* r16.19-20.19@10 w10.10-13.10 w13.10-16.10 w20.10-21.10 w25.10-26.10 w10.16-13.16 w13.16-16.16 w20.16-26.16 w10.10-10.11 w10.15-10.16 w26.10-26.11 w26.15-26.16 w13.10-13.11 w13.15-13.16 w16.16-16.19 w20.16-20.19');
  // (and the reading does not go off to find room: it stays beside its meter, within the meter's own length -- it is the names that give way)
  const beside = (b) => { const lay = Renderer.layout(null, { circuit: b.circuit, names: b.circuit.labels(), sol: b.sol, hide: false, revealed: () => true, view: b.view }), out = [];
    for (const m of b.circuit.ofType(Meter)) { const L = lay.get(m.id), p = View.xy(m.a), q = View.xy(m.b), c = View.xy(m.center()), hz = m.horizontal();
      const along = hz ? L.x0 < Math.max(p.x, q.x) && L.x1 > Math.min(p.x, q.x) : L.y0 < Math.max(p.y, q.y) && L.y1 > Math.min(p.y, q.y), off = hz ? Math.min(Math.abs(L.y0 - c.y), Math.abs(L.y1 - c.y)) : Math.min(Math.abs(L.x0 - c.x), Math.abs(L.x1 - c.x));
      if (!along || off > 1.5 * View.G) out.push(b.circuit.nameOf(m) + (along ? ' ' + off.toFixed(0) + ' px off' : ' past its end')); }
    return out; };
  for (const scale of [1, 0.87, 0.79, 0.72, 0.6]) { b.view.scale = scale; b.view.auto = false; for (const t of [0.05, 0.31, 0.7]) { run(b.sim, t); const g = gaps(b); ok(!g.length, 'at ' + scale + ': no label against a boxed reading: ' + g.join(', '));
    const f = beside(b); ok(!f.length, 'at ' + scale + ': each reading is beside its meter: ' + f.join(', ')); } }
  for (const [name] of PRESETS.list) { const p = bench(name); for (const scale of [1, 0.8, 0.65]) { p.view.scale = scale; p.view.auto = false; run(p.sim, 0.21); const g = gaps(p); ok(!g.length, name + ' at ' + scale + ': no label against a boxed reading: ' + g.join(', ')); } } }

// ---- F123: a new part from the menu does not land on another part's label (it used to be dropped three columns from a source, on its "6 V peak") ----
{ const { ELEMENTS } = L, hit = (a, o) => a.x0 < o.x1 && a.x1 > o.x0 && a.y0 < o.y1 && a.y1 > o.y0;
  const onLabels = (b, type) => { const before = [...Renderer.layout(null, { circuit: b.circuit, names: b.circuit.labels(), sol: b.sol, hide: false, revealed: () => true, view: b.view })].map(([id, o]) => ({ id, ...o }));
    const el = b.add(type); if (!el) return ['not placed']; const box = PAINTERS[el.type].box(el);
    return before.filter((o) => hit(box, o)).map((o) => b.circuit.nameOf(b.circuit.byId(o.id)) + ' (new part at ' + el.a.c + '.' + el.a.r + '-' + el.b.c + '.' + el.b.r + ')'); };
  const net = 'o10.11-10.15@6~1.59 a16.10-20.10* r21.10-25.10@3 l26.11-26.15@1 c20.16-16.16@10 g10.16-10.18 v13.11-13.15* r16.19-20.19@10 w10.10-13.10 w13.10-16.10 w20.10-21.10 w25.10-26.10 w10.16-13.16 w13.16-16.16 w20.16-26.16 w10.10-10.11 w10.15-10.16 w26.10-26.11 w26.15-26.16 w13.10-13.11 w13.15-13.16 w16.16-16.19 w20.16-20.19';
  for (const type of Object.keys(ELEMENTS)) { if (type === 'wire') continue; const b = load(net); run(b.sim, 0.2); const on = onLabels(b, type); ok(!on.length, 'a new ' + type + ' beside the AC circuit lands clear of the labels: ' + on.join(', ')); }
  for (const [name] of PRESETS.list) for (const type of ['battery', 'ac', 'resistor', 'cap', 'ind', 'amm', 'volt']) { if (!ELEMENTS[type]) { ok(false, 'no such type ' + type); continue; } const b = bench(name); run(b.sim, 0.2);
    const on = onLabels(b, type); ok(!on.length, name + ': a new ' + type + ' lands clear of the labels: ' + on.join(', '));
    const again = onLabels(b, type); ok(!again.length, name + ': and so does a second: ' + again.join(', ')); } }

// ---- F124: turns in a tight spot -- a source beside a voltmeter, a resistor under a capacitor -- are still the quarter turn
// asked for about the part's middle, leave the same circuit, and come back (there and back; four the same way) ----
// (A step aside to keep a square of air was tried and taken out: it breaks "a turn is the turn asked for", F-rotate above.)
{ const net = 'o10.11-10.15@6~1.59 a16.10-20.10* r21.10-25.10@3 l26.11-26.15@1 c20.16-16.16@10 g10.16-10.18 v13.11-13.15* r16.19-20.19@10 w10.10-13.10 w13.10-16.10 w20.10-21.10 w25.10-26.10 w10.16-13.16 w13.16-16.16 w20.16-26.16 w10.10-10.11 w10.15-10.16 w26.10-26.11 w26.15-26.16 w13.10-13.11 w13.15-13.16 w16.16-16.19 w20.16-20.19';
  const tight = (b, el) => b.circuit.parts.filter((o) => o !== el && el.clearanceTo(o) < 2 && !el.inLineWith(o)).map((o) => b.circuit.nameOf(o));
  const amps = (b) => { run(b.sim, 3); return Math.abs(b.circuit.ofType(Ammeter)[0].number(b.sol)); };
  for (const [pick, what] of [[(b) => b.circuit.elements.find((e) => e.type === 'ac'), 'the AC source'], [(b) => b.circuit.ofType(Resistor)[1], 'R₂']]) for (const dir of [1, -1]) {
    const b = load(net), i0 = amps(load(net)), el = pick(b), want = JSON.stringify(el.rotated(dir)); b.selId = el.id; const r = b.rotate(dir);
    ok(r && r.ok && JSON.stringify(b.circuit.byId(el.id).geometry()) === want, what + ' turned ' + dir + ' about its middle');
    clean(b, what + ' turned ' + dir); near(amps(b), i0, 1e-9, what + ' turned ' + dir + ': the circuit is the same circuit'); }
  // a turn with room about its middle is still a turn about its middle, and there and back is where it began
  for (const [name] of PRESETS.list) { const b = bench(name); for (const el of b.circuit.parts.filter((e) => e.info.rotatable)) { const was = b.circuit.encode(), lie = (g) => Object.values(g).map(P.key).sort().join(' '), want = lie(el.rotated(1)); b.selId = el.id; b.rotate(1); const now = b.circuit.byId(el.id);
    if (!now || b.circuit.encode() === was) continue;
    if (lie(now.geometry()) !== want) ok(!tight(b, now).length, name + ': ' + b.circuit.nameOf(now) + ' stepped aside only to clear a neighbour');
    b.rotate(-1); ok(b.circuit.encode() === was, name + ': ' + b.circuit.nameOf(now) + ' turned there and back is where it began'); b.undo(); b.undo(); ok(b.circuit.encode() === was, name + ': undo takes the turns back'); } }
  // and so it is for the two that step aside; four turns the same way come home too
  for (const pick of [(b) => b.circuit.elements.find((e) => e.type === 'ac'), (b) => b.circuit.ofType(Resistor)[1]]) for (const dir of [1, -1]) { const b = load(net), was = b.circuit.encode(), el = pick(b), name = b.circuit.nameOf(el); b.selId = el.id;
    b.rotate(dir); ok(b.circuit.encode() !== was, name + ' turns'); b.rotate(-dir); ok(b.circuit.encode() === was, name + ' turned ' + dir + ' and back is where it began');
    for (let i = 0; i < 4; i++) { b.rotate(dir); clean(b, name + ' after turn ' + (i + 1)); } const home = b.circuit.byId(el.id); ok(P.key(home.a) === P.key(el.a) && P.key(home.b) === P.key(el.b), name + ': four turns ' + dir + ' bring it home (' + P.key(home.a) + '-' + P.key(home.b) + ')'); } }

// ---- F125: a fully charged capacitor is still two plates. (The glow between them went up to 85 % of the plates' own gold:
// at 11 V the symbol was one solid block.) The glow still deepens with the voltage, but never past half strength. ----
{ const fills = []; const g = new Proxy({}, { get: (t, k) => k === 'fill' ? () => fills.push(String(t.fillStyle)) : k === 'measureText' ? () => ({ width: 10 }) : (typeof k === 'string' && /^[a-z]/.test(k) && !(k in t) ? () => {} : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
  const glow = (v) => { fills.length = 0; const c = new Capacitor({ c: 10, r: 10 }, { c: 14, r: 10 }, 0.01); c.vc = v; PAINTERS.cap.paint(g, c, { sel: false, hide: false }); const m = fills.map((f) => /^rgba\(224,184,90,([\d.]+)\)$/.exec(f)).find(Boolean); return m ? +m[1] : 0; };
  for (const v of [3, 6, 12, -12, 24, 120]) ok(glow(v) > 0 && glow(v) <= 0.5, 'at ' + v + ' V the glow leaves the plates standing: alpha ' + glow(v));
  ok(glow(1) < glow(3) && glow(3) < glow(6) && glow(6) < glow(12), 'and it still deepens with the voltage: ' + [1, 3, 6, 12].map(glow).join(' < ')); ok(glow(0) === 0, 'an uncharged capacitor has none'); }

// F126 (2026-11-17): the "t = 0" button threw "bench is not defined" -- its handler named a variable the toolbar never
// had, and nothing here had ever pressed it. Every button on the strip above the canvas is pressed, and does its job.
{ const { Panel } = L, b = bench('rc'), cap = b.circuit.ofType(Capacitor)[0]; let set = 0;
  const app = { bench: b, state: { hide: false, peek: {} }, run: (f) => () => f(), setState() { set++; }, typeField() {}, endField() {}, setCanvas() {}, big: false };
  const bar = () => new Panel(app).toolbar(), press = (what, f) => { try { f(); return true; } catch (e) { ok(false, 'F126: ' + what + ' threw: ' + e.message); return false; } };
  run(b.sim, 1.5); ok(b.sim.shown > 1.4 && Math.abs(cap.vc) > 1, 'F126: the RC preset has been charging for 1.5 s (' + b.sim.shown.toFixed(2) + ' s, ' + cap.vc.toFixed(2) + ' V)');
  if (press('"t = 0"', () => bar().onResetTime())) { ok(Math.abs(b.sim.shown) < 1e-9, 'F126: "t = 0" puts the clock back to zero (' + b.sim.shown.toFixed(3) + ' s)'); ok(Math.abs(cap.vc) < 1e-9, 'F126: and the capacitor starts again uncharged (' + cap.vc.toFixed(3) + ' V)'); }
  const was = b.sim.playing; if (press('Run / Pause', () => bar().onPlay())) ok(b.sim.playing === !was, 'F126: Run / Pause toggles'); if (press('Run / Pause again', () => bar().onPlay())) ok(b.sim.playing === was, 'F126: and back');
  ok(bar().playLabel === (b.sim.playing ? '❚❚ Pause' : '▶ Run'), 'F126: the button is labelled for what it will do (' + bar().playLabel + ')');
  const enc = b.circuit.encode(); b.select(b.circuit.ofType(Resistor)[0]); b.type('value', 2200); b.endTyping(); const enc2 = b.circuit.encode(); ok(enc2 !== enc, 'F126: an edit to undo');
  if (press('Undo', () => bar().onUndo())) ok(b.circuit.encode() === enc, 'F126: Undo takes the edit back'); if (press('Redo', () => bar().onRedo())) ok(b.circuit.encode() === enc2, 'F126: Redo puts it back');
  const z0 = b.view.scale; for (const z of bar().zoomBtns) press('zoom "' + z.title + '"', () => z.onClick()); ok(b.view.scale > 0 && isFinite(b.view.scale), 'F126: the zoom buttons leave a sane scale (' + z0 + ' -> ' + b.view.scale + ')');
  for (const it of bar().addItems) if (it.isBtn) { const n = b.circuit.parts.length; if (press('Add ' + it.label, () => it.onClick())) ok(b.circuit.parts.length === n + 1, 'F126: "' + it.label + '" adds one part'); }
  for (const it of bar().presetItems) if (press('preset ' + it.label, () => it.onClick())) ok(b.circuit.parts.length > 0, 'F126: preset "' + it.label + '" loads');
  if (press('New', () => bar().onNewCircuit())) ok(b.circuit.parts.every((e) => e.type === 'ground'), 'F126: New clears the bench down to its ground (' + b.circuit.encode() + ')');
  press('menus', () => { const t = bar(); t.onToggleAdd(); t.onCloseAdd(); t.onTogglePreset(); t.onClosePreset(); }); ok(set > 0, 'F126: the menus open and close through the app state'); }
// (and no handler anywhere in the panel names a variable its method does not have)
{ const src = require('fs').readFileSync(require('path').join(__dirname, '../src/70-panel.js'), 'utf8'), stray = [];
  src.split('\n').forEach((line, n) => { if (/^\s*\/\//.test(line)) return; if (/(^|[^.\w$])bench\.(?!$)/.test(line) && !/\b(const|let)\b[^;]*\bbench\b\s*=|\(bench[,)]|bench\) =>/.test(line)) stray.push(n + 1); });
  ok(stray.length === 0, 'F126: 70-panel.js names a bare `bench` on line(s) ' + stray.join(', ')); }

// F127 (2026-11-17): ...so every handler the panel hands the page is pressed once, with each kind of part selected, with
// the solution hidden and shown, and with each dialog open. None may throw (a throw in the page is a red error bar).
{ const { Panel } = L, ev = () => ({ target: { value: '3', checked: true, select() {}, blur() {} }, currentTarget: { value: '3' }, key: 'Enter', stopPropagation() {}, preventDefault() {} });
  const mkApp = (b, st) => { const app = { bench: b, state: { hide: false, peek: {}, ...st }, big: false, example: new WorkedExample('series'), graphs: { span: 8, shorter() {} },
    get dock() { return { on: b.sim.graphing, big: false, h: b.sim.graphing ? 150 : 0, full: 400 }; }, run: (f) => () => f(), refresh() {}, setCanvas() {}, setGraphCanvas() {}, copyShare() {}, submitBug() {},
    setState(q) { Object.assign(app.state, typeof q === 'function' ? q(app.state) : q); }, typeField(f, t) { b.type(f, parseFloat(t)); }, endField(c) { b.endTyping(!!c); } }; return app; };
  const walk = (o, path, out, depth) => { if (depth > 4 || !o) return out; if (typeof o === 'function') { out.push(path); return out; } if (typeof o !== 'object') return out;
    for (const k of Object.keys(o)) walk(o[k], path.concat(k), out, depth + 1); return out; };
  const at = (o, path) => path.reduce((x, k) => x == null ? x : x[k], o);
  const setups = []; for (const name of ['rc', 'rlc', 'ac', 'bridge']) { const n = bench(name).circuit.parts.length; for (let i = -1; i < n; i++) setups.push({ name, i, st: {} }); }
  for (const st of [{ hide: true }, { showInfo: true }, { showShare: true, shareHide: false }, { showExample: true, showSol: true }, { showBug: true, bugText: 'x', bugEmail: '', bugResult: '' }, { menuOpen: true }, { addOpen: true }, { presetOpen: true }]) { setups.push({ name: 'rlc', i: 0, st }); setups.push({ name: 'ac', i: 1, st }); }
  let pressed = 0, threw = 0; const seen = new Set();
  const hadLoc = 'location' in globalThis; if (!hadLoc) globalThis.location = { href: 'http://localhost/circuit-lab/', origin: 'http://localhost', pathname: '/circuit-lab/', search: '', hash: '' };   // (the share box reads the page's address)
  for (const su of setups) { const make = () => { const b = bench(su.name); if (su.i >= 0) b.select(b.circuit.parts[su.i]); if (su.name !== 'bridge') { for (const m of b.circuit.ofType(Meter)) b.toggleGraph ? b.toggleGraph(m) : (m.graph = true); run(b.sim, 0.3); } return b; };
    const what = su.name + (su.i >= 0 ? ' / ' + bench(su.name).circuit.parts[su.i].type : '') + (Object.keys(su.st).length ? ' / ' + Object.keys(su.st)[0] : '');
    let paths; try { paths = walk(new Panel(mkApp(make(), su.st)).all(), [], [], 0); } catch (e) { ok(false, 'F127: the panel itself threw with ' + what + ': ' + e.message); threw++; continue; }
    for (const path of paths) { const key = path.join('.'); seen.add(key.replace(/\.\d+\./g, '.#.')); const b = make(), f = at(new Panel(mkApp(b, su.st)).all(), path); if (typeof f !== 'function') continue;
      try { f(ev()); pressed++; } catch (e) { threw++; ok(false, 'F127: ' + key + ' threw with ' + what + ': ' + e.message); } } }
  if (!hadLoc) delete globalThis.location;
  ok(threw === 0, 'F127: no handler in the panel throws (' + pressed + ' presses of ' + seen.size + ' different handlers)');
  ok(pressed > 500 && seen.size > 40, 'F127: the sweep really pressed the panel (' + pressed + ' presses, ' + seen.size + ' handlers)');
  for (const k of ['onResetTime', 'onPlay', 'onUndo', 'onRedo', 'onNewCircuit', 'onToggleHide']) ok(seen.has(k), 'F127: ' + k + ' was among them'); }

// ---- F128 a trace has a gap where there was nothing to read: the graph never draws a line across it ----
{ const { Trace, GraphPainter, Panel, AcSource } = L;
  { const s = []; Trace.put(s, 0, NaN, 100); ok(s.length === 0, 'F128 nothing is kept before the first reading'); Trace.put(s, 0, 1, 100); Trace.put(s, 1, 2, 100); Trace.put(s, 2, NaN, 100); Trace.put(s, 3, NaN, 100); Trace.put(s, 4, 5, 100);
    ok(s.length === 4 && s[2][0] === 2 && s[2][1] !== s[2][1] && s[3][1] === 5, 'F128 one break is kept where the readings stopped: ' + JSON.stringify(s)); }
  { const s = [[0, 1], [1, 1], [1.5, NaN], [3, 2], [4, 2]], X = (t) => 100 * t, Y = (v) => 50 - 10 * v, ops = [];
    GraphPainter.path({ moveTo(x, y) { ops.push(['M', x, y]); }, lineTo(x, y) { ops.push(['L', x, y]); } }, s, 0, X, Y);
    ok(ops.filter((o) => o[0] === 'M').length === 2, 'F128 the trace is drawn as two pieces: ' + JSON.stringify(ops)); ok(ops.every((o) => isFinite(o[1]) && isFinite(o[2])), 'F128 and nothing is drawn at the break itself');
    let bridge = false; for (let i = 1; i < ops.length; i++) if (ops[i][0] === 'L' && ops[i - 1][1] <= 100 && ops[i][1] >= 300) bridge = true; ok(!bridge, 'F128 no line from before the gap to after it'); }
  { const texts = [], grad = { addColorStop() {} };
    const g = new Proxy({}, { get: (t, k) => k === 'fillText' ? (x) => texts.push(String(x)) : k === 'measureText' ? () => ({ width: 10 }) : (k === 'createRadialGradient' || k === 'createLinearGradient') ? () => grad : (typeof k === 'string' && /^[a-z]/.test(k) && !(k in t) ? () => {} : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
    const tr = [{ kind: 'volt', name: 'V1', shown: true, samples: [[0, 1], [0.5, 4], [0.6, NaN], [1.5, 2], [2, 2]] }];
    new GraphPainter().draw(g, { dpr: 1, w: 550, h: 150, top: 0, t: 2, origin: 0, hover: null, traces: tr });
    ok(!texts.some((x) => /NaN/.test(x)) && texts.includes('4'), 'F128 the axis is scaled by the readings, not the break: ' + texts.join(' '));
    texts.length = 0; new GraphPainter().draw(g, { dpr: 1, w: 550, h: 150, top: 0, t: 2, origin: 0, hover: { t: 1 }, traces: tr }); const key = texts.filter((x) => /V1/.test(x));
    ok(!texts.some((x) => /NaN/.test(x)), 'F128 under the pointer, in the gap, no reading is invented: ' + key.join(' | ')); }
  // two batteries that agree, then do not, then do again: the voltmeter's trace has a hole, not a ramp
  { const b = load('b10.10-10.14@6_b14.10-14.14@6_r18.10-18.14@2000_v22.10-22.14*_w10.10-22.10_w10.14-22.14'), b2 = b.circuit.ofType(Battery)[1], vm = b.circuit.ofType(Voltmeter)[0];
    run(b.sim, 0.5); b.select(b2); b.type('value', 9); b.endTyping(); ok(b.sol.clash, 'F128 the batteries now clash'); run(b.sim, 0.5); b.select(b2); b.type('value', 6); b.endTyping(); ok(!b.sol.clash, 'F128 and agree again'); run(b.sim, 0.5);
    const s = vm.trace(), gaps = s.filter((x) => x[1] !== x[1]); ok(gaps.length === 1, 'F128 one break in the voltmeter trace: ' + gaps.length + ' of ' + s.length);
    const i = s.indexOf(gaps[0]); ok(i > 0 && i < s.length - 1 && s[i + 1][0] - s[i - 1][0] > 0.45, 'F128 with half a second of nothing either side of it: ' + (i > 0 && i < s.length - 1 ? (s[i + 1][0] - s[i - 1][0]).toFixed(3) : i));
    ok(s.every((x) => x[1] !== x[1] || Math.abs(Math.abs(x[1]) - 6) < 1e-9), 'F128 every reading that was taken is the 6 V'); }
  // an ammeter pulled out of its loop and put back: the same
  { const b = bench('rl'), am = b.circuit.ofType(Ammeter)[0], sw = b.circuit.ofType(Switch)[0]; b.toggle(sw); am.graph = true; run(b.sim, 0.3); const before = am.trace().length; ok(before > 100, 'F128 the ammeter was recording: ' + before);
    const lead = b.circuit.ofType(L.Wire).find((w) => P.eq(w.a, am.b) || P.eq(w.b, am.b)); ok(!!lead, 'F128 (the wire on its far end)'); b.select(lead); b.remove(); ok(b.sim.unplugged.has(am.id), 'F128 pulled out of the loop'); run(b.sim, 0.3); b.undo(); ok(!b.sim.unplugged.has(am.id), 'F128 and put back'); run(b.sim, 0.3);
    const s = am.trace(), gaps = s.filter((x) => x[1] !== x[1]), k = s.indexOf(gaps[0]); ok(gaps.length === 1 && s.length > before + 100, 'F128 an unplugged ammeter leaves a hole in its trace, not a bridge: ' + gaps.length + ' breaks, ' + before + ' -> ' + s.length);
    ok(k > 0 && k < s.length - 1 && s[k + 1][0] - s[k - 1][0] > 0.25, 'F128 the hole is as long as it was out: ' + (k > 0 && k < s.length - 1 ? (s[k + 1][0] - s[k - 1][0]).toFixed(3) : k)); }
  // the words fit the sources
  { const sum = (b) => new Panel({ bench: b, state: { hide: false, peek: {} } }).summary().summaryText;
    const bat = load('b10.10-10.14@6_b14.10-14.14@9_r18.10-18.14@2000_w10.10-18.10_w10.14-18.14'); ok(/different EMFs/.test(sum(bat)) && /internal resistance/.test(sum(bat)) && !/frequenc/.test(sum(bat)), 'F128 two batteries: EMFs and internal resistance');
    const ac = load('o10.10-10.14@6~0.8_o14.10-14.14@6~0.5_r18.10-18.14@2000_w10.10-18.10_w10.14-18.14'); run(ac.sim, 0.3); ok(ac.sol.clash, 'F128 two AC sources of different frequency clash');
    ok(/frequenc/.test(sum(ac)) && !/battery/.test(sum(ac)) && /resistor between them/.test(sum(ac)), 'F128 two AC sources: frequencies, and no battery to give internal resistance to: ' + sum(ac));
    const mix = load('o10.10-10.14@6~0.8_b14.10-14.14@6_r18.10-18.14@2000_w10.10-18.10_w10.14-18.14'); run(mix.sim, 0.3); ok(mix.sol.clash && /battery some internal resistance/.test(sum(mix)) && /AC source/.test(sum(mix)), 'F128 a battery across an AC source: ' + sum(mix)); } }

// ---- F129 a clock that comes up comes up at zero ----
// (seen on screen: a part deleted from a quiet loop took the clock face away; the part dropped back in brought
//  it back reading 37 s -- the age of a run that was over -- because nothing was flowing to call the instant zero)
{ const net = 'g14.16-14.18 b17.11-17.15@6 x26.13-23.12-23.14@1 r20.8-24.8@1000 c20.18-24.18@10 w17.11-23.11 w16.8-20.8 w24.8-26.8 w16.18-20.18 w17.15-23.15 w23.15-24.15 w23.11-23.12 w23.14-23.15 w26.8-26.13 w16.8-16.18 w24.15-24.18';
  { const b = load(net), tool = new PointerTool(b); run(b.sim, 3); near(b.sim.shown, 3, 1e-6, 'F129 the clock runs on a quiet RC loop'); ok(!b.sim.alive, 'F129 nothing flows: the switch is on the side without the battery');
    b.select(b.circuit.ofType(Capacitor)[0]); b.remove(); ok(!b.sim.timed, 'F129 no capacitor, no clock'); b.sim.advance(0.5);
    b.undo(); ok(b.sim.timed && !b.sim.alive, 'F129 the capacitor is back and the loop is still quiet'); near(b.sim.shown, 0, 1e-9, 'F129 the clock comes back at zero after an undo');
    run(b.sim, 2); const w = b.circuit.wires.find((x) => x.a.c === 16 && x.b.c === 16);
    ok(!!w, 'F129 found the left-hand wire'); b.select(w); b.remove(); ok(!b.sim.timed, 'F129 a wire out: no loop, no clock'); b.sim.advance(0.5);
    drag(b, tool, P.of(16, 8), P.of(16, 18)); ok(b.sim.timed && !b.sim.alive, 'F129 the wire is drawn back and the loop is whole: ' + b.circuit.encode()); near(b.sim.shown, 0, 1e-9, 'F129 the clock comes back at zero when the loop is redrawn'); clean(b, 'F129'); }
  // an edit that leaves the clock up does not touch it
  { const b = load(net); run(b.sim, 3); b.select(b.circuit.ofType(Resistor)[0]); b.type('value', '2000'); b.endTyping(); near(b.sim.shown, 3, 1e-6, 'F129 a new value on a quiet loop leaves the clock alone');
    b.nudge(0, -1); near(b.sim.shown, 3, 1e-6, 'F129 so does moving a part'); }
  // a graph switched on over a steady circuit starts its own clock at zero as well
  { const b = load('b10.11-10.15@6 r14.11-14.15@2000 w10.11-14.11 w10.15-14.15 g10.15-10.17 v17.11-17.15 w14.11-17.11 w14.15-17.15'); b.sim.t = 7; b.sim.origin = 2; ok(!b.sim.timed, 'F129 a DC circuit has no clock'); const m = b.circuit.ofType(Meter)[0]; ok(!!m && !m.graph, 'F129 a voltmeter, not graphed'); b.toggleGraph(m); ok(b.sim.timed, 'F129 a graph brings the clock up'); near(b.sim.shown, 0, 1e-9, 'F129 at zero');
    run(b.sim, 1); b.toggleGraph(m); b.toggleGraph(m); near(b.sim.shown, 0, 1e-9, 'F129 and again when it is switched off and on');
    const rc = bench('rc'), v = rc.circuit.ofType(Meter)[0]; rc.toggle(rc.circuit.ofType(Switch)[0]); run(rc.sim, 2); rc.toggleGraph(v); near(rc.sim.shown, 2, 1e-6, 'F129 a graph switched on while the clock is already up leaves it alone'); } }

// ---- F130 Seth's answers of 2026-11-18: a loose ammeter has nothing to read; an ammeter is directional; no flow while hidden ----
{ const loop = 'b10.11-10.15@6 r14.11-14.15@2000 w10.11-12.11 a12.11-14.11 w10.15-14.15';
  { const b = load(loop); run(b.sim, 0.2); const am = b.circuit.ofType(Ammeter)[0]; near(am.number(b.sol), 3e-3, 1e-9, 'F130 an ammeter in the loop reads 3 mA');
    ok(PAINTERS.amm.value(am, b.sol) === '3.00 mA', 'F130 shown as 3.00 mA: ' + PAINTERS.amm.value(am, b.sol));
    // turned round, the same meter reads minus: current goes in at its minus side
    const back = load(loop.replace('a12.11-14.11', 'a14.11-12.11')); run(back.sim, 0.2); const ab = back.circuit.ofType(Ammeter)[0]; near(ab.number(back.sol), -3e-3, 1e-9, 'F130 the ammeter in backwards reads minus');
    ok(PAINTERS.amm.value(ab, back.sol) === '−3.00 mA', 'F130 with a true minus sign: ' + PAINTERS.amm.value(ab, back.sol)); }
  // hanging off the circuit by one end, or lying on the bench with no wires at all: no reading
  for (const [what, net] of [['by one end', 'b10.11-10.15@6 r14.11-14.15@2000 w10.11-14.11 w10.15-14.15 a14.11-17.11'], ['on its own', 'b10.11-10.15@6 r14.11-14.15@2000 w10.11-14.11 w10.15-14.15 a20.8-22.8'],
    ['by one end, on the far side of a wire', 'b10.11-10.15@6 r14.11-14.15@2000 w10.11-14.11 w10.15-14.15 w14.11-16.11 a16.11-18.11']]) {
    const b = load(net); run(b.sim, 0.2); const am = b.circuit.ofType(Ammeter)[0]; ok(b.sol.loose.has(am.id) && am.reading(b.sol).err === 'loose', 'F130 a loose ammeter (' + what + ') has nothing to read');
    ok(PAINTERS.amm.value(am, b.sol) === Fmt.none, 'F130 it reads – – – (' + what + '), as a loose voltmeter does: ' + PAINTERS.amm.value(am, b.sol)); ok(am.number(b.sol) !== am.number(b.sol), 'F130 and its graph has a gap (' + what + ')'); }
  // both leads wired, into a stub that goes nowhere: in the circuit, a true zero (as F116)
  { const b = load('b10.11-10.15@6 r14.11-14.15@2000 w10.11-14.11 w10.15-14.15 a14.11-17.11 w17.11-17.13'); run(b.sim, 0.2); const am = b.circuit.ofType(Ammeter)[0]; ok(!b.sol.loose.has(am.id) && am.number(b.sol) === 0, 'F130 an ammeter on a dead-end stub reads a true 0'); }
  // in the loop but behind an open switch: a true zero
  { const b = load('b10.11-10.15@6 r14.11-14.15@2000 w10.11-11.11 s11.11-12.11@0 a12.11-14.11 w10.15-14.15'); run(b.sim, 0.2); const am = b.circuit.ofType(Ammeter)[0];
    ok(!b.sol.loose.has(am.id) && am.number(b.sol) === 0, 'F130 behind an open switch an ammeter is in the circuit and reads 0'); ok(PAINTERS.amm.value(am, b.sol) === '0 mA', 'F130 shown as 0 mA'); }
  // the moving current is not drawn while the solution is hidden
  { const b = load(loop); run(b.sim, 0.2); const grad = { addColorStop() {} }, calls = [];
    const g = new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createRadialGradient' || k === 'createLinearGradient') ? () => grad : (typeof k === 'string' && /^[a-z]/.test(k) && !(k in t) ? () => {} : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
    const saved = {}; for (const k of Object.keys(PAINTERS)) { saved[k] = PAINTERS[k].current; PAINTERS[k].current = function () { calls.push(k); }; }
    const scene = (hide) => ({ circuit: b.circuit, view: b.view, sol: b.sol, dpr: 1, names: b.circuit.labels(), selId: 0, hide, revealed: () => false, flowing: true, probe: null, probeV: null, turn: null, message: null, flash: null });
    try { new Renderer().draw(g, scene(false)); const shown = calls.length; calls.length = 0; new Renderer().draw(g, scene(true));
      ok(shown > 0, 'F130 the current moves when the solution is showing (' + shown + ' parts)'); ok(calls.length === 0, 'F130 and not at all in Hide-solution mode (' + calls.length + ')'); }
    finally { for (const k of Object.keys(PAINTERS)) PAINTERS[k].current = saved[k]; } } }

console.log(bad ? bad + ' of ' + n + ' FAILED' : 'fixes: all ' + n + ' checks passed');
process.exit(bad ? 1 : 0);
