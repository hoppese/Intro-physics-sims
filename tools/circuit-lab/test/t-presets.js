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
{ const c = PRESETS.build('series'), s = Solver.solve(c, { mode: 'dc' }); const R = c.ofType(Resistor); near(s.current(R[0]), 0.2, 1e-9, 'series I'); near(s.measure(R[1]).dV, 4, 1e-9, 'series V2'); near(s.current(c.ofType(Battery)[0]), 0.2, 1e-9, 'series Ibat'); }
{ const c = PRESETS.build('parallel'), s = Solver.solve(c, { mode: 'dc' }); const R = c.ofType(Resistor); near(s.current(R[0]), 0.6, 1e-9, 'par I1'); near(s.current(R[1]), 0.3, 1e-9, 'par I2'); near(s.current(c.ofType(Battery)[0]), 0.9, 1e-9, 'par Ibat'); }
{ const c = PRESETS.build('bridge'), s = Solver.solve(c, { mode: 'dc' }); const R = c.ofType(Resistor); ok(R[2].value === 25, 'bridge R3 is the bridge'); near(Math.abs(s.current(R[2])), 0.048, 1e-9, 'bridge I3: the preset is unbalanced, so the bridge carries current'); near(s.current(R[0]), 0.232, 1e-9, 'bridge I1'); near(s.current(c.ofType(Battery)[0]), 0.232 + 0.352 / 3, 1e-9, 'bridge Ibat'); }
{ const c = PRESETS.build('rc'); const cap = c.ofType(Capacitor)[0], am = c.ofType(Ammeter)[0], vm = c.ofType(Voltmeter)[0], sw = c.ofType(ThrowSwitch)[0];
  let s = run(c, 2.2); near(cap.vc, 6 * (1 - Math.exp(-1)), 0.02, 'rc vc(tau)'); near(vm.reading(s).dV, cap.vc, 1e-6, 'rc voltmeter = +vc'); ok(am.reading(s).I > 0, 'rc ammeter + while charging');
  sw.toggle(); s = run(c, 2.2); near(cap.vc, 6 * (1 - Math.exp(-1)) * Math.exp(-1), 0.02, 'rc discharge'); ok(am.reading(s).I < 0, 'rc ammeter - while discharging'); }
{ const c = PRESETS.build('rl'); const L = c.ofType(Inductor)[0], am = c.ofType(Ammeter)[0], vm = c.ofType(Voltmeter)[0], sw = c.ofType(Switch)[0];
  let s = run(c, 0.5); near(L.il, 0, 1e-9, 'rl open: no current'); sw.toggle(); s = Solver.step(c, { mode: 'tran', dt: 0.002, t: 0 }); near(vm.reading(s).dV, 6, 0.02, 'rl V_L(0)=emf');
  s = run(c, 1.5); near(am.reading(s).I, 0.6 * (1 - Math.exp(-1)), 0.005, 'rl I(tau)'); ok(vm.reading(s).dV > 0, 'rl V_L positive'); }
{ const c = PRESETS.build('rlc'); const cap = c.ofType(Capacitor)[0], vm = c.ofType(Voltmeter)[0], sw = c.ofType(Switch)[0]; sw.toggle(); let peak = 0, s; let t = 0; while (t < 0.5) { t += 0.002; s = Solver.step(c, { mode: 'tran', dt: 0.002, t }); peak = Math.max(peak, vm.reading(s).dV); }
  ok(peak > 6.5 && peak < 12, 'rlc overshoots ' + peak); near(vm.reading(s).dV, cap.vc, 1e-6, 'rlc voltmeter = +vc'); s = run(c, 8); near(cap.vc, 6, 0.05, 'rlc settles'); }
// history keeps live state
{ const c = PRESETS.build('rc'), h = new History(); const cap = c.ofType(Capacitor)[0], r = c.ofType(Resistor)[0]; run(c, 1); const v = cap.vc; ok(v > 1, 'charged');
  h.record(c.snapshot()); r.setValue(100); h.record(c.snapshot()); ok(c.move(r, 0, -1).ok || true, ''); run(c, 0.1); const v2 = cap.vc;
  h.undo(c); near(cap.vc, v2, 1e-12, 'undo keeps charge'); ok(r.value === 100, 'undo 1 keeps value'); h.undo(c); ok(r.value === 220, 'undo 2 restores value'); near(cap.vc, v2, 1e-12, 'still charged'); h.redo(c); ok(r.value === 100, 'redo'); ok(c.problems().length === 0, 'history clean'); }
console.log(fails ? fails + ' FAILED of ' + n : 'presets: all ' + n + ' checks passed');
