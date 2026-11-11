const M = require('./load.js');
const { P, Circuit, Solver, Resistor, Battery, AcSource, ThrowSwitch, Ground, Switch, Capacitor, Inductor, Ammeter, Voltmeter } = M;
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FAIL', msg); } };
const near = (x, y, tol, msg) => ok(Math.abs(x - y) <= (tol || 1e-9), msg + ': got ' + x + ', want ' + y);
const pt = (c, r) => ({ c, r });
const put = (c, el) => { const r = c.insert(el); if (!r.ok) throw new Error('insert ' + el.type + ': ' + r.why); return el; };
const wire = (c, ...pts) => { const r = c.addWire(pts); if (!r.ok) throw new Error('wire ' + JSON.stringify(pts) + ': ' + r.why); };
const DC = { mode: 'dc', dt: 0.002, t: 0 };

// A loop: battery on the left (+ on top), parts along the top row, return along the bottom.
// top row r=4 from c=4..., bottom row r=12.
function frame(c, emf, ground) {
  const b = put(c, new Battery(pt(4, 6), pt(4, 10), emf));
  wire(c, pt(4, 6), pt(4, 4)); wire(c, pt(4, 10), pt(4, 12));
  if (ground !== false) put(c, new Ground(pt(4, 12), pt(4, 14)));
  return b;
}

// ---- S1 series divider ----
{
  const c = new Circuit(); const b = frame(c, 6);
  const r1 = put(c, new Resistor(pt(8, 4), pt(12, 4), 10)), am = put(c, new Ammeter(pt(14, 4), pt(18, 4))), r2 = put(c, new Resistor(pt(20, 4), pt(24, 4), 20));
  wire(c, pt(4, 4), pt(8, 4)); wire(c, pt(12, 4), pt(14, 4)); wire(c, pt(18, 4), pt(20, 4)); wire(c, pt(24, 4), pt(28, 4), pt(28, 12), pt(4, 12));
  const vm = put(c, new Voltmeter(pt(20, 8), pt(24, 8))); wire(c, pt(20, 4), pt(20, 8)); wire(c, pt(24, 4), pt(24, 8));
  ok(c.problems().length === 0, 'S1 problems ' + c.problems());
  const s = Solver.solve(c, DC);
  near(s.measure(r1).dV, 2, 1e-9, 'S1 V1'); near(s.measure(r2).dV, 4, 1e-9, 'S1 V2');
  near(s.measure(r1).I, 0.2, 1e-9, 'S1 I1'); near(s.current(b), 0.2, 1e-9, 'S1 battery delivers');
  near(am.reading(s).I, 0.2, 1e-9, 'S1 ammeter a->b'); near(vm.reading(s).dV, 4, 1e-9, 'S1 voltmeter');
  near(s.potential(pt(4, 4)), 6, 1e-9, 'S1 probe top'); near(s.potential(pt(18, 4)), 4, 1e-9, 'S1 probe mid'); near(s.potential(pt(28, 12)), 0, 1e-9, 'S1 probe bottom');
  ok(!s.shorted && s.solved, 'S1 flags');
  // every wire in the single loop carries 0.2 A in magnitude
  for (const w of c.wires) { const f = Math.abs(s.flow(w)); ok(Math.abs(f - 0.2) < 1e-9 || f < 1e-12, 'S1 wire flow ' + w.encode() + ' = ' + f); }
  // flipped meters read negative
  c.flip(am); c.flip(vm); const s2 = Solver.solve(c, DC);
  near(am.reading(s2).I, -0.2, 1e-9, 'S1 flipped ammeter'); near(vm.reading(s2).dV, -4, 1e-9, 'S1 flipped voltmeter');
  // flipped battery reverses everything
  c.flip(b); const s3 = Solver.solve(c, DC); near(s3.measure(r1).dV, -2, 1e-9, 'S1 flipped battery');
  near(s3.current(b), 0.2, 1e-9, 'S1 flipped battery still delivers +');
}

// ---- S2 parallel + internal resistance ----
function parallel(ground) {
  const c = new Circuit(); const b = frame(c, 6, ground);
  wire(c, pt(4, 4), pt(16, 4)); wire(c, pt(4, 12), pt(16, 12));
  const r1 = put(c, new Resistor(pt(10, 6), pt(10, 10), 10)), r2 = put(c, new Resistor(pt(16, 6), pt(16, 10), 20));
  wire(c, pt(10, 4), pt(10, 6)); wire(c, pt(10, 10), pt(10, 12)); wire(c, pt(16, 4), pt(16, 6)); wire(c, pt(16, 10), pt(16, 12));
  return { c, b, r1, r2 };
}
{
  const { c, b, r1, r2 } = parallel();
  let s = Solver.solve(c, DC);
  near(s.current(r1), 0.6, 1e-9, 'S2 I1'); near(s.current(r2), 0.3, 1e-9, 'S2 I2'); near(s.current(b), 0.9, 1e-9, 'S2 total');
  // wire flows obey KCL: the top rail left of the first branch carries 0.9, right of it 0.3
  const at = (a, bb) => c.wires.find((w) => (P.eq(w.a, a) && P.eq(w.b, bb)) || (P.eq(w.a, bb) && P.eq(w.b, a)));
  const wl = at(pt(4, 4), pt(10, 4)), wr = at(pt(10, 4), pt(16, 4));
  ok(wl && wr, 'S2 rail split at the junction: ' + c.wires.map((w) => w.encode()).join(' '));
  if (wl && wr) { near(Math.abs(s.flow(wl)), 0.9, 1e-9, 'S2 rail before junction'); near(Math.abs(s.flow(wr)), 0.3, 1e-9, 'S2 rail after junction'); }
  b.setRi(2); s = Solver.solve(c, DC); const Req = 20 / 3, I = 6 / (Req + 2);
  near(s.current(b), I, 1e-9, 'S2 internal r current'); near(s.measure(b).dV, I * Req, 1e-9, 'S2 terminal voltage');
}
// ---- S3 no ground: voltmeter and dV still work, the probe does not ----
{
  const { c, r1, b } = parallel(false); const vm = put(c, new Voltmeter(pt(22, 6), pt(22, 10)));
  wire(c, pt(16, 4), pt(22, 4), pt(22, 6)); wire(c, pt(16, 12), pt(22, 12), pt(22, 10));
  const s = Solver.solve(c, DC);
  near(vm.reading(s).dV, 6, 1e-9, 'S3 ungrounded voltmeter'); near(s.measure(r1).dV, 6, 1e-9, 'S3 ungrounded dV'); near(s.current(b), 0.9, 1e-9, 'S3 ungrounded current');
  ok(isNaN(s.potential(pt(4, 4))), 'S3 probe needs a ground');
  const lone = put(c, new Voltmeter(pt(30, 6), pt(30, 10))); ok(Solver.solve(c, DC) && lone.reading(Solver.solve(c, DC)).err, 'S3 floating voltmeter reports an error');
}
// ---- S4 short circuit, open circuit ----
{
  const c = new Circuit(); const b = frame(c, 6); wire(c, pt(4, 4), pt(10, 4), pt(10, 12), pt(4, 12));
  let s = Solver.solve(c, DC); ok(s.shorted, 'S4 dead short flagged');
  b.setRi(2); s = Solver.solve(c, DC); ok(!s.shorted, 'S4 internal r: not an ideal short'); near(s.current(b), 3, 1e-9, 'S4 short-circuit current = emf/r');
  const c2 = new Circuit(); const b2 = frame(c2, 6); const r = put(c2, new Resistor(pt(8, 4), pt(12, 4), 10)); wire(c2, pt(4, 4), pt(8, 4));
  s = Solver.solve(c2, DC); near(s.current(r), 0, 1e-12, 'S4 open circuit I'); near(s.current(b2), 0, 1e-12, 'S4 open battery I');
}
// ---- S5 switches ----
{
  const c = new Circuit(); frame(c, 6);
  const sw = put(c, new Switch(pt(6, 4), pt(10, 4), 0)), r = put(c, new Resistor(pt(12, 4), pt(16, 4), 12));
  wire(c, pt(4, 4), pt(6, 4)); wire(c, pt(10, 4), pt(12, 4)); wire(c, pt(16, 4), pt(20, 4), pt(20, 12), pt(4, 12));
  near(Solver.solve(c, DC).current(r), 0, 1e-12, 'S5 open switch'); sw.toggle(); near(Solver.solve(c, DC).current(r), 0.5, 1e-9, 'S5 closed switch');
  near(Math.abs(Solver.solve(c, DC).flow(sw)), 0.5, 1e-9, 'S5 switch carries the current');
  // throw switch: pole at (14,8); throw 1 -> charging side, throw 2 -> discharge
  const c2 = new Circuit(); frame(c2, 6); const x = put(c2, ThrowSwitch.at(pt(8, 5), 1));
  const ra = put(c2, new Resistor(pt(13, 4), pt(17, 4), 10)), rb = put(c2, new Resistor(pt(13, 6), pt(17, 6), 30));
  wire(c2, pt(4, 4), pt(4, 5), pt(8, 5)); wire(c2, x.b1, pt(13, 4)); wire(c2, x.b2, pt(13, 6)); wire(c2, pt(17, 4), pt(20, 4), pt(20, 12), pt(4, 12)); wire(c2, pt(17, 6), pt(20, 6));
  ok(c2.problems().length === 0, 'S5 throw problems ' + c2.problems());
  let s = Solver.solve(c2, DC); const first = x.position === 2 ? rb : ra, second = first === ra ? rb : ra;
  ok(Math.abs(s.current(first)) > 0.1 && Math.abs(s.current(second)) < 1e-12, 'S5 throw selects one branch: ' + s.current(ra) + ' ' + s.current(rb));
  x.toggle(); s = Solver.solve(c2, DC); ok(Math.abs(s.current(second)) > 0.1 && Math.abs(s.current(first)) < 1e-12, 'S5 throw toggled: ' + s.current(ra) + ' ' + s.current(rb));
}
// ---- S6 RC charging, then discharge ----
{
  const c = new Circuit(); frame(c, 6);
  const r = put(c, new Resistor(pt(8, 4), pt(12, 4), 100)), cap = put(c, new Capacitor(pt(16, 6), pt(16, 10), 10)); // tau = 100 * 0.010 = 1 s
  wire(c, pt(4, 4), pt(8, 4)); wire(c, pt(12, 4), pt(16, 4), pt(16, 6)); wire(c, pt(16, 10), pt(16, 12), pt(4, 12));
  const dt = 0.002; let t = 0, s = Solver.solve(c, { mode: 'tran', dt, t: 0 });
  near(s.current(r), 0.06, 1e-3, 'S6 initial current emf/R');
  for (let i = 0; i < 500; i++) { t += dt; s = Solver.step(c, { mode: 'tran', dt, t }); }
  near(cap.vc, 6 * (1 - Math.exp(-1)), 0.01, 'S6 vc at one tau'); near(s.current(r), 0.06 * Math.exp(-1), 2e-4, 'S6 I at one tau');
  near(cap.charge, 0.010 * cap.vc, 1e-12, 'S6 Q = C V');
  for (let i = 0; i < 5000; i++) { t += dt; s = Solver.step(c, { mode: 'tran', dt, t }); }
  near(cap.vc, 6, 1e-3, 'S6 fully charged'); near(s.current(r), 0, 1e-5, 'S6 no current when charged');
  const before = cap.vc; Solver.solve(c, { mode: 'tran', dt, t }); ok(cap.vc === before, 'S6 solve() is pure');
  c.resetState(); ok(cap.vc === 0, 'S6 resetState');
}
// ---- S7 RL ramp ----
{
  const c = new Circuit(); frame(c, 6);
  const r = put(c, new Resistor(pt(8, 4), pt(12, 4), 5)), L = put(c, new Inductor(pt(16, 6), pt(16, 10), 10)); // tau = 2 s
  wire(c, pt(4, 4), pt(8, 4)); wire(c, pt(12, 4), pt(16, 4), pt(16, 6)); wire(c, pt(16, 10), pt(16, 12), pt(4, 12));
  const dt = 0.002; let t = 0, s = Solver.solve(c, { mode: 'tran', dt, t: 0 });
  near(s.measure(L).dV, 6, 0.02, 'S7 all emf across L at t=0');
  for (let i = 0; i < 1000; i++) { t += dt; s = Solver.step(c, { mode: 'tran', dt, t }); }
  near(L.il, 1.2 * (1 - Math.exp(-1)), 2e-3, 'S7 I at one tau'); near(s.current(r), L.il, 1e-9, 'S7 series current matches');
  near(Solver.solve(c, DC).current(r), 1.2, 1e-9, 'S7 dc: inductor is a wire');
}
// ---- S8 AC source ----
{
  const c = new Circuit(); const src = put(c, new AcSource(pt(4, 6), pt(4, 10), 5)); src.setFreq(0.5);
  put(c, new Ground(pt(4, 12), pt(4, 14))); const r = put(c, new Resistor(pt(8, 4), pt(12, 4), 10));
  wire(c, pt(4, 6), pt(4, 4), pt(8, 4)); wire(c, pt(12, 4), pt(16, 4), pt(16, 12), pt(4, 12), pt(4, 10));
  near(Solver.solve(c, { mode: 'tran', dt: 0.002, t: 0.5 }).measure(r).dV, 5, 1e-9, 'S8 peak at quarter period');
  near(Solver.solve(c, { mode: 'tran', dt: 0.002, t: 1.5 }).measure(r).dV, -5, 1e-9, 'S8 trough');
  ok(c.reactive, 'S8 an AC source makes the circuit time-dependent');
}
// ---- S9 two sources, bridge ----
{
  const c = new Circuit(); frame(c, 6); // 6 V left, 3 V right, both + up, joined through 10 and 20 ohm to a 30 ohm leg
  const r1 = put(c, new Resistor(pt(6, 4), pt(10, 4), 10)), r2 = put(c, new Resistor(pt(14, 4), pt(18, 4), 20)), r3 = put(c, new Resistor(pt(12, 6), pt(12, 10), 30));
  const b2 = put(c, new Battery(pt(20, 6), pt(20, 10), 3));
  wire(c, pt(4, 4), pt(6, 4)); wire(c, pt(10, 4), pt(14, 4)); wire(c, pt(12, 4), pt(12, 6)); wire(c, pt(12, 10), pt(12, 12)); wire(c, pt(18, 4), pt(20, 4), pt(20, 6)); wire(c, pt(20, 10), pt(20, 12), pt(4, 12));
  const s = Solver.solve(c, DC); const Vm = (6 / 10 + 3 / 20) / (1 / 10 + 1 / 20 + 1 / 30);
  near(s.potential(pt(12, 4)), Vm, 1e-9, 'S9 node voltage'); near(s.current(r1), (6 - Vm) / 10, 1e-9, 'S9 I1'); near(s.current(r2), (Vm - 3) / 20, 1e-9, 'S9 I2 (a->b)');
  near(s.current(r3), Vm / 30, 1e-9, 'S9 I3'); near(s.current(b2), (3 - Vm) / 20, 1e-9, 'S9 second battery is being charged (negative)');
}
console.log(fails ? fails + ' FAILED of ' + checks : 'solver: all ' + checks + ' checks passed');
process.exit(fails ? 1 : 0);
