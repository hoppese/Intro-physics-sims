const M = require('./load.js'); const { Circuit, Solver, PRESETS, Resistor, Capacitor, Inductor, Ammeter, Voltmeter, Switch, ThrowSwitch, Battery, History } = M;
let fails = 0, n = 0; const ok = (c, m) => { n++; if (!c) { fails++; console.log('FAIL', m); } }; const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, m + ' got ' + a + ' want ' + b);
const run = (c, T) => { let t = 0, sol; const dt = 0.002; while (t < T - 1e-9) { t += dt; sol = Solver.step(c, { mode: 'tran', dt, t }); } return sol; };
for (const name of Object.keys(PRESETS.nets)) { const c = PRESETS.build(name);
  const toks = PRESETS.nets[name].split(' ').filter((t) => t[0] !== 'w').length; ok(c.parts.length === toks, name + ' kept every part ' + c.parts.length + '/' + toks);
  ok(c.problems().length === 0, name + ' problems: ' + c.problems().join('; '));
  const b = c.bounds(); ok(b.c1 - b.c0 <= 19 && b.r1 - b.r0 <= 12, name + ' compact ' + (b.c1 - b.c0) + 'x' + (b.r1 - b.r0));
  const c2 = Circuit.decode(c.encode()); ok(c2.encode() === c.encode(), name + ' round trip');
  // no loose wire ends
  const E = c.wireEdges(), adj = Circuit.adjacency(E), terms = c.terminalMap(null); for (const [k, nb] of adj) ok(nb.length > 1 || terms.has(k), name + ' loose end at ' + k); }
{ const c = PRESETS.build('series'), s = Solver.solve(c, { mode: 'dc' }); const R = c.ofType(Resistor); near(s.current(R[0]), 0.002, 1e-12, 'series I'); near(s.measure(R[1]).dV, 3.6, 1e-9, 'series V2'); near(s.current(c.ofType(Battery)[0]), 0.002, 1e-12, 'series Ibat'); }
{ const c = PRESETS.build('parallel'), s = Solver.solve(c, { mode: 'dc' }); const R = c.ofType(Resistor); near(s.current(R[0]), 0.005, 1e-12, 'par I1'); near(s.current(R[1]), 0.002, 1e-12, 'par I2'); near(s.current(c.ofType(Battery)[0]), 0.007, 1e-12, 'par Ibat'); }
{ const c = PRESETS.build('bridge'), s = Solver.solve(c, { mode: 'dc' }); const R = c.ofType(Resistor); ok(R[2].value === 2500, 'bridge R3 is the bridge'); near(Math.abs(s.current(R[2])), 0.00048, 1e-12, 'bridge I3: the preset is unbalanced, so the bridge carries current'); near(s.current(R[0]), 0.00232, 1e-12, 'bridge I1'); near(s.current(c.ofType(Battery)[0]), 0.00232 + 0.00352 / 3, 1e-12, 'bridge Ibat'); }
{ const c = PRESETS.build('rc'); const cap = c.ofType(Capacitor)[0], am = c.ofType(Ammeter)[0], vm = c.ofType(Voltmeter)[0], sw = c.ofType(ThrowSwitch)[0];
  const tau = 4700 * 0.47e-3, k = Math.exp(-2.2 / tau); ok(Math.abs(tau - 2.209) < 1e-9, 'rc tau = 2.2 s');
  let s = run(c, 2.2); near(cap.vc, 6 * (1 - k), 0.02, 'rc vc(2.2 s)'); near(vm.reading(s).dV, cap.vc, 1e-6, 'rc voltmeter = +vc'); ok(am.reading(s).I > 0, 'rc ammeter + while charging');
  sw.toggle(); s = run(c, 2.2); near(cap.vc, 6 * (1 - k) * k, 0.02, 'rc discharge'); ok(am.reading(s).I < 0, 'rc ammeter - while discharging'); }
{ const c = PRESETS.build('rl'); const L = c.ofType(Inductor)[0], am = c.ofType(Ammeter)[0], vm = c.ofType(Voltmeter)[0], sw = c.ofType(Switch)[0];
  let s = run(c, 0.5); near(L.il, 0, 1e-9, 'rl open: no current'); sw.toggle(); s = Solver.step(c, { mode: 'tran', dt: 0.002, t: 0 }); near(vm.reading(s).dV, 6, 0.02, 'rl V_L(0)=emf');
  s = run(c, 1.5); near(am.reading(s).I, 0.6 * (1 - Math.exp(-1)), 0.005, 'rl I(tau)'); ok(vm.reading(s).dV > 0, 'rl V_L positive'); }
{ const c = PRESETS.build('rlc'); const cap = c.ofType(Capacitor)[0], vm = c.ofType(Voltmeter)[0], sw = c.ofType(Switch)[0]; sw.toggle(); let peak = 0, s; let t = 0; while (t < 0.5) { t += 0.002; s = Solver.step(c, { mode: 'tran', dt: 0.002, t }); peak = Math.max(peak, vm.reading(s).dV); }
  ok(peak > 6.5 && peak < 12, 'rlc overshoots ' + peak); near(vm.reading(s).dV, cap.vc, 1e-6, 'rlc voltmeter = +vc'); s = run(c, 8); near(cap.vc, 6, 0.05, 'rlc settles'); }
// the AC preset: the RLC preset's own R, L and C, driven by a source below their resonance (f0 = 1.59 Hz)
{ const { AcSource } = M, c = PRESETS.build('ac'), src = c.ofType(AcSource)[0], am = c.ofType(Ammeter)[0], vm = c.ofType(Voltmeter)[0], R = c.ofType(Resistor)[0].value, Lh = c.ofType(Inductor)[0].value, C = c.ofType(Capacitor)[0].value * 1e-3;
  ok(PRESETS.list.some(([k]) => k === 'ac'), 'the AC preset is on the menu'); ok(c.ofType(Battery).length === 0 && c.ofType(Switch).length === 0, 'ac: a source and no battery or switch');
  const rlc = PRESETS.build('rlc'); ok(R === rlc.ofType(Resistor)[0].value && Lh === rlc.ofType(Inductor)[0].value && C === rlc.ofType(Capacitor)[0].value * 1e-3, 'ac: the same R, L and C as the RLC preset');
  const f0 = 1 / (2 * Math.PI * Math.sqrt(Lh * C)); ok(src.freq < 0.8 * f0 && src.freq > 0.4 * f0 && Math.abs(src.freq - 1) > 0.05, 'ac: opens below resonance, and not at exactly 1 Hz (' + src.freq + ' Hz, f0 = ' + f0.toFixed(2) + ' Hz)');
  const amp = (f) => { src.setFreq(f); for (const e of c.elements) e.resetState(); let t = 0, pk = 0, lead = 0, s; const dt = 0.0005, T = 12; while (t < T - 1e-9) { t += dt; s = Solver.step(c, { mode: 'tran', dt, t, first: t <= dt * 1.5 }); if (t > T - 1 / f) { pk = Math.max(pk, Math.abs(am.reading(s).I)); near(vm.reading(s).dV, src.value * Math.sin(2 * Math.PI * f * t), 1e-6, 'ac: the voltmeter reads the source'); } } return pk; };
  const w = 2 * Math.PI * src.freq, Z = Math.sqrt(R * R + Math.pow(w * Lh - 1 / (w * C), 2)); near(amp(src.freq), src.value / Z, 0.004 * src.value / Z, 'ac: current amplitude V/|Z| as it opens');
  near(amp(f0), src.value / R, 0.006 * src.value / R, 'ac: V/R at resonance'); }
// history keeps live state
{ const c = PRESETS.build('rc'), h = new History(); const cap = c.ofType(Capacitor)[0], r = c.ofType(Resistor)[0]; run(c, 1); const v = cap.vc; ok(v > 1, 'charged');
  h.record(c.snapshot()); r.setValue(100); h.record(c.snapshot()); ok(c.move(r, 0, -1).ok || true, ''); run(c, 0.1); const v2 = cap.vc;
  h.undo(c); near(cap.vc, v2, 1e-12, 'undo keeps charge'); ok(r.value === 100, 'undo 1 keeps value'); h.undo(c); ok(r.value === 4700, 'undo 2 restores value'); near(cap.vc, v2, 1e-12, 'still charged'); h.redo(c); ok(r.value === 100, 'redo'); ok(c.problems().length === 0, 'history clean'); }
console.log(fails ? fails + ' FAILED of ' + n : 'presets: all ' + n + ' checks passed');
process.exit(fails ? 1 : 0);
