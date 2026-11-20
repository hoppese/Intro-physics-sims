const M = require('./load.js');
const { P, Circuit, Solver, Resistor, Battery, AcSource, ThrowSwitch, Ground, Switch, Capacitor, Inductor, Ammeter, Voltmeter, Simulation } = M;
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
// =====================================================================
// The clock (Simulation), against closed forms. These run the circuit the way
// the page does -- advance() a frame at a time -- so they test the step that
// is actually taken, not just the solver at a step handed to it.
// =====================================================================
// a series loop: source on the left, then R, L, C (any of them left out with 0) and an ammeter along the top
function loop(src, R, L, CmF) { const c = new Circuit(); put(c, src); put(c, new Ground(pt(4, 12), pt(4, 14)));
  wire(c, pt(4, 6), pt(4, 4), pt(8, 4)); wire(c, pt(4, 10), pt(4, 12)); const o = { c }; let x = 8;
  const add = (key, el) => { o[key] = put(c, el); wire(c, pt(x + 4, 4), pt(x + 6, 4)); x += 6; };
  if (R) add('r', new Resistor(pt(x, 4), pt(x + 4, 4), R)); if (L) add('l', new Inductor(pt(x, 4), pt(x + 4, 4), L)); if (CmF) add('cap', new Capacitor(pt(x, 4), pt(x + 4, 4), CmF));
  add('am', new Ammeter(pt(x, 4), pt(x + 4, 4)));
  wire(c, pt(x, 4), pt(x, 12), pt(4, 12)); if (c.problems().length) throw new Error('loop: ' + c.problems()); return o; }
const play = (c, T, frame, each) => { const sim = new Simulation(c); sim.reset(); for (let i = 0, n = Math.round(T / frame); i < n; i++) { sim.advance(frame); if (each) each(sim); } return sim; };

// ---- S10 AC through R, L and C: the current is I0 sin(wt - phi), I0 = A/|Z|, tan(phi) = X/R ----
for (const [R, L, CmF, f, A] of [[10, 1, 10, 0.5, 6], [10, 1, 10, 1.5915, 6], [3, 1, 10, 1.5915, 6], [50, 2, 5, 3, 12], [1000, 0, 0.47, 0.5, 6], [10, 5, 0, 0.5, 6], [2, 1, 10, 20, 24], [4, 0.05, 0.1, 20, 6], [1000, 0, 0.1, 20, 6]]) {
  const src = new AcSource(pt(4, 6), pt(4, 10), A); src.setFreq(f); const { c, r } = loop(src, R, L, CmF), tag = 'S10 R=' + R + ' L=' + L + ' C=' + CmF + 'mF f=' + f;
  const w = 2 * Math.PI * f, C = CmF / 1000, X = (L ? w * L : 0) - (C ? 1 / (w * C) : 0), I0 = A / Math.hypot(R, X), phi = Math.atan2(X, R);
  const tau = L ? 2 * L / R : R * C, T = Math.ceil(Math.max(9 * tau, 3 / f) * f) / f + 2 / f; let err = 0;
  play(c, T, 1 / 60, (sim) => { if (sim.t > T - 1 / f) err = Math.max(err, Math.abs(sim.sol.current(r) - I0 * Math.sin(w * sim.t - phi))); });
  ok(err < 0.004 * I0, tag + ': steady current within 0.4% of the phasor answer (off by ' + (100 * err / I0).toFixed(2) + '%)');
}
// ---- S11 a battery switched onto R, L, C: the capacitor's voltage against the closed form ----
// (the two loosest rows are the fastest corner of the ranges -- a 14 ms period ringing 45 times before it dies --
//  where what is left is a 0.05% error in the ringing frequency, adding up swing after swing)
for (const [R, L, CmF, tol] of [[3, 1, 10, 0.006], [0.5, 1, 10, 0.03], [20.001, 1, 10, 0.002], [200, 1, 10, 0.002], [3, 20, 200, 0.001], [0.5, 0.05, 0.1, 0.15], [2, 0.05, 0.1, 0.04], [1, 0.2, 1, 0.03]]) {
  const { c, cap } = loop(new Battery(pt(4, 6), pt(4, 10), 6), R, L, CmF), C = CmF / 1000, a = R / (2 * L), w0 = 1 / Math.sqrt(L * C), T = Math.min(20, 7 / a);
  const exact = (t) => { if (w0 > a) { const wd = Math.sqrt(w0 * w0 - a * a); return 6 * (1 - Math.exp(-a * t) * (Math.cos(wd * t) + a / wd * Math.sin(wd * t))); }
    const s = Math.sqrt(a * a - w0 * w0), s1 = -a + s, s2 = -a - s; return 6 * (1 - (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s2 - s1)); };
  let err = 0; play(c, T, 1 / 60, (sim) => { err = Math.max(err, Math.abs(cap.vc - exact(sim.t))); });
  ok(err < tol, 'S11 R=' + R + ' L=' + L + ' C=' + CmF + 'mF (w0 = ' + w0.toFixed(1) + ' rad/s): capacitor voltage within ' + tol + ' V of the closed form for ' + T.toFixed(1) + ' s (off by ' + err.toExponential(2) + ' V)');
}
// ---- S12 the step: plain circuits take the whole step; only a fast swing is cut finer ----
{
  const sim = play(loop(new Battery(pt(4, 6), pt(4, 10), 6), 3, 1, 10).c, 0.1, 1 / 60); near(sim.env().dt, Simulation.DT, 1e-15, 'S12 the RLC preset values step at the whole step');
  const slow = new AcSource(pt(4, 6), pt(4, 10), 6); near(play(loop(slow, 10, 1, 10).c, 0.1, 1 / 60).env().dt, Simulation.DT, 1e-15, 'S12 0.5 Hz steps at the whole step');
  const fast = new AcSource(pt(4, 6), pt(4, 10), 6); fast.setFreq(20); const o = loop(fast, 10, 0, 0), s2 = play(o.c, 0.1, 1 / 60);
  ok(s2.env().dt <= 1 / (20 * 90), 'S12 20 Hz gets at least 90 steps a period (dt = ' + s2.env().dt + ')');
  ok(Simulation.DT / s2.env().dt === Math.round(Simulation.DT / s2.env().dt), 'S12 the finer step divides the whole step exactly');
  // slowing the source down goes back to the whole step, and the integrator restarts for the change
  fast.setFreq(0.5); s2.advance(1 / 60); near(s2.env().dt, Simulation.DT, 1e-15, 'S12 back to the whole step when the source slows down');
  // the clock keeps wall time whatever the step: 3 s of frames is 3 s
  fast.setFreq(20); const s3 = play(o.c, 3, 1 / 60); near(s3.t, 3, 2 * Simulation.DT, 'S12 the clock keeps time while stepping finely');
}
// ---- S13 the graph does not depend on the frame rate: a meter is read every step, not every frame ----
for (const frame of [1 / 60, 1 / 15, 0.1]) {
  const src = new AcSource(pt(4, 6), pt(4, 10), 6); src.setFreq(5); const { c, am } = loop(src, 10, 0, 0), sim = play(c, 2, frame), s = am.samples; let gap = 0, err = 0;
  for (let i = 1; i < s.length; i++) gap = Math.max(gap, s[i][0] - s[i - 1][0]);
  for (const [t, v] of s) err = Math.max(err, Math.abs(Math.abs(v) - Math.abs(0.6 * Math.sin(2 * Math.PI * 5 * t))));
  ok(gap <= Simulation.DT * 1.001, 'S13 at ' + Math.round(1 / frame) + ' frames a second the ammeter trace has a sample every step (largest gap ' + gap.toFixed(4) + ' s)');
  ok(err < 1e-6, 'S13 each sample is the reading at its own time stamp (off by ' + err.toExponential(1) + ' A)');
  ok(s.length === Math.round(sim.t / Simulation.DT) || s.length === Math.round(sim.t / Simulation.DT) + 1, 'S13 one sample for each step, whatever the frame rate (' + s.length + ' samples in ' + sim.t.toFixed(2) + ' s)');
}
// ---- S14 turning the frequency knob does not make the source jump: the swing carries on from where it is ----
{ const src = new AcSource(pt(4, 6), pt(4, 10), 6); src.setFreq(0.8); const { c } = loop(src, 10, 0, 0), sim = new Simulation(c); sim.reset();
  const V = () => src.branch('tran', sim.env()).V, go = (T, each) => { for (let i = 0, n = Math.round(T * 60); i < n; i++) { sim.advance(1 / 60); if (each) each(); } };
  go(1.3); near(V(), 6 * Math.sin(2 * Math.PI * 0.8 * sim.t), 1e-9, 'S14 from t = 0 the source is A sin(2 pi f t)');
  const before = V(); src.setFreq(1.59); near(V(), before, 1e-9, 'S14 the voltage is the same the instant the frequency changes');
  // ... and from there it swings at the new frequency: upward zero crossings 1/1.59 s apart
  const ups = []; let last = V(), tl = sim.t; go(3, () => { const v = V(); if (last < 0 && v >= 0) ups.push(tl + (sim.t - tl) * (-last) / (v - last)); last = v; tl = sim.t; });
  ok(ups.length >= 4, 'S14 it keeps swinging (' + ups.length + ' crossings)'); for (let i = 1; i < ups.length; i++) near(ups[i] - ups[i - 1], 1 / 1.59, 1e-3, 'S14 a period at the new frequency');
  // undoing the change (the old layout put back over the live state) does not jump either
  const snap = c.snapshot(); src.setFreq(0.4); go(0.7); const v1 = V(); c.restoreLayout(snap); ok(src.freq === 1.59, 'S14 undo brings the frequency back'); near(V(), v1, 1e-9, 'S14 and the voltage does not jump when it does');
  // back at t = 0 the swing starts from zero again, rising
  sim.reset(); go(0.1); near(V(), 6 * Math.sin(2 * Math.PI * 1.59 * sim.t), 1e-9, 'S14 after a reset it is A sin(2 pi f t) again'); }
// ---- S15 ideal sources wired straight across each other ----
// Identical batteries in parallel are a textbook circuit: the voltage is one battery's and they share the current.
// (Two ideal sources across the same pair of nodes make the equations singular, so this used to be "no solution".)
{ const dec = (net) => Circuit.decode(net, 40, 30), mA = 1e-3;
  { const c = dec('b10.10-10.14@6_b14.10-14.14@6_a14.8-14.10_r18.10-18.14@1000_w10.10-10.8_w10.8-14.8_w14.8-18.8_w18.8-18.10_w10.14-18.14'), s = Solver.solve(c, DC), [b1, b2] = c.ofType(Battery), r = c.ofType(Resistor)[0], am = c.ofType(Ammeter)[0];
    ok(s.solved && !s.shorted && !s.clash, 'S15 two equal batteries in parallel: solved'); near(Math.abs(s.measure(r).dV), 6, 1e-9, 'S15 the resistor has one battery\'s voltage'); near(Math.abs(s.measure(r).I), 6 * mA, 1e-12, 'S15 and its current');
    near(s.current(b1), 3 * mA, 1e-12, 'S15 the first battery delivers half'); near(s.current(b2), 3 * mA, 1e-12, 'S15 the second the other half'); near(Math.abs(am.reading(s).I), 3 * mA, 1e-12, 'S15 an ammeter in one battery\'s lead reads half');
    for (const w of c.wires) ok(isFinite(s.flow(w)), 'S15 every wire has a current: ' + w.encode()); }
  { const c = dec('b10.10-10.14@6_b14.10-14.14@6_b18.10-18.14@6_r22.10-22.14@1000_w10.10-22.10_w10.14-22.14'), s = Solver.solve(c, DC);
    ok(s.solved, 'S15 three equal batteries'); for (const b of c.ofType(Battery)) near(s.current(b), 2 * mA, 1e-12, 'S15 each of three delivers a third'); }
  // different EMFs: a contradiction, and it is said to be one (not left as "no solution")
  { const c = dec('b10.10-10.14@6_b14.10-14.14@9_r18.10-18.14@1000_w10.10-18.10_w10.14-18.14'), s = Solver.solve(c, DC); ok(!s.solved && s.clash === true && !s.shorted, 'S15 unequal ideal batteries in parallel clash'); ok(!isFinite(s.measure(c.ofType(Resistor)[0]).dV), 'S15 and nothing is read off them'); }
  // the same EMF but back to back: also a clash
  { const c = dec('b10.10-10.14@6_b14.14-14.10@6_r18.10-18.14@1000_w10.10-18.10_w10.14-18.14'), s = Solver.solve(c, DC); ok(!s.solved && s.clash === true, 'S15 equal batteries back to back clash'); }
  // one with internal resistance: an ordinary circuit, the difference drives a current round the pair
  { const c = dec('b10.10-10.14@6_b14.10-14.14@9~2_w10.10-14.10_w10.14-14.14'), s = Solver.solve(c, DC), [b1, b2] = c.ofType(Battery); ok(s.solved && !s.clash, 'S15 internal resistance: solved'); near(s.current(b2), 1.5, 1e-9, 'S15 the 9 V battery drives 1.5 A'); near(s.current(b1), -1.5, 1e-9, 'S15 back through the 6 V one'); }
  // an AC source across a battery clashes; two alike across each other share
  { const c = dec('b10.10-10.14@6_o14.10-14.14@5~1_r18.10-18.14@1000_w10.10-18.10_w10.14-18.14'), s = Solver.solve(c, { mode: 'tran', dt: 0.002, t: 0.1 }); ok(!s.solved && s.clash === true, 'S15 a battery across an AC source clashes'); }
  { const c = dec('o10.10-10.14@5~1_o14.10-14.14@5~1_r18.10-18.14@1000_w10.10-18.10_w10.14-18.14'), s = Solver.solve(c, { mode: 'tran', dt: 0.002, t: 0.1 }), [o1, o2] = c.ofType(AcSource); ok(s.solved && !s.clash, 'S15 twin AC sources: solved'); near(s.current(o1), s.current(o2), 1e-12, 'S15 and they share'); near(Math.abs(s.measure(c.ofType(Resistor)[0]).dV), Math.abs(5 * Math.sin(2 * Math.PI * 0.1)), 1e-9, 'S15 at the source voltage'); }
  // the pair charging a capacitor through a resistor: the usual curve, each battery supplying half
  { const c = dec('b10.10-10.14@6_b14.10-14.14@6_r18.10-22.10@1000_c22.10-22.14@1_w10.10-18.10_w10.14-22.14'), sim = new Simulation(c); sim.reset(); for (let i = 0; i < 60; i++) sim.advance(1 / 60);
    const s = sim.sol, cap = c.ofType(Capacitor)[0], [b1, b2] = c.ofType(Battery); ok(s.solved, 'S15 RC from a pair: solved'); near(Math.abs(s.measure(cap).dV), 6 * (1 - Math.exp(-sim.t / 1)), 2e-4, 'S15 RC from a pair: the capacitor voltage'); near(s.current(b1), s.current(b2), 1e-12, 'S15 RC from a pair: equal shares'); near(s.current(b1) + s.current(b2), 6e-3 * Math.exp(-sim.t / 1), 2e-7, 'S15 RC from a pair: the total current'); } }

console.log(fails ? fails + ' FAILED of ' + checks : 'solver: all ' + checks + ' checks passed');
process.exit(fails ? 1 : 0);
