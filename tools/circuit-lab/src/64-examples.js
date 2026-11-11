// =====================================================================
// WorkedExample -- one randomised textbook problem: its numbers, its written
// solution, and how to build it on the bench. Each kind is one entry in
// KINDS; adding a problem type is adding an entry.
// =====================================================================
class WorkedExample {
  // is any of these answers exactly 1 (1 s, 1 A)? A factor of exactly one hides itself in the working.
  static one(...xs) { return xs.some((x) => Math.abs(x - 1) < 1e-9); }
  static rnd(a, b, step) { return a + step * Math.floor(Math.random() * (Math.round((b - a) / step) + 1)); }
  constructor(kind) { this.kind = WorkedExample.KINDS[kind] ? kind : 'series'; this.roll(); }
  get spec() { return WorkedExample.KINDS[this.kind]; }
  // fresh numbers (never ones that make an answer -- a time constant, a current -- land on exactly 1)
  roll() { let v, n = 0; do { v = this.spec.roll(WorkedExample.rnd); } while (this.spec.reject && this.spec.reject(v) && ++n < 50); this.vals = v; return this; }
  // { title, blurb, given: [{tex}], steps: [{n, title, tex, note}], tip }
  model() { const s = this.spec, m = s.solve(this.vals, WorkedExample.TEX); return { title: s.title, blurb: s.blurb, tip: s.tip, given: m.given.map((tex) => ({ tex })), steps: m.steps.map((x, i) => ({ n: i + 1, title: x[0], tex: x[1], note: x[2] || '' })) }; }
  // put this circuit on the bench with these numbers
  build(bench) { bench.loadPreset(this.spec.preset); const c = bench.circuit; this.spec.apply(this.vals, { bat: c.ofType(Battery)[0], rs: c.ofType(Resistor), cap: c.ofType(Capacitor)[0], ind: c.ofType(Inductor)[0] }); bench.sim.reset(); }
}
// the bits of LaTeX every solution is written with
// cur(): one unit for all of a problem's currents, set by the largest of them -- mA, as the meters
// read, unless one reaches 1 A (or none reaches 1 mA). R(): a resistance, in kΩ from 1000 Ω up.
WorkedExample.TEX = { f: (x, d) => x.toFixed(d == null ? 2 : d), sig: (x) => x.toPrecision(3), cur: (...all) => { const top = Math.max(...all.map(Math.abs)); return top >= 0.9995 ? (i) => i.toFixed(2) + '\\text{ A}' : top >= 0.9995e-3 ? (i) => Fmt.sig3(i * 1e3) + '\\text{ mA}' : (i) => Fmt.sig3(i * 1e6) + '\\,\\mu\\text{A}'; },
  R: (x) => x >= 999.5 ? +(x / 1000).toPrecision(3) + '\\text{ k}\\Omega' : +x.toPrecision(3) + '\\,\\Omega', O: '\\,\\Omega', V: '\\text{ V}', A: '\\text{ A}', mA: '\\text{ mA}', s: '\\text{ s}', eps: '\\varepsilon', DV: '\\Delta V', gap: ',\\quad ' };
WorkedExample.ORDER = [['series', 'Divider'], ['parallel', 'Parallel'], ['internal', 'Internal R'], ['rc', 'RC'], ['rl', 'RL']];
WorkedExample.KINDS = {
  series: { title: 'Series voltage divider', preset: 'series',
    blurb: 'A battery drives two resistors in series. Find the current and how the source voltage splits between them.',
    tip: 'Build it and drop a voltmeter across each resistor to confirm.',
    roll: (rnd) => { const R1 = rnd(1000, 6000, 500); let R2; do { R2 = rnd(1000, 6000, 500); } while (R2 === R1); return { emf: rnd(3, 12, 1), R1, R2 }; },
    reject: (v) => WorkedExample.one(v.emf / (v.R1 + v.R2) * 1000),
    apply: (v, p) => { p.bat.setValue(v.emf); p.rs[0].setValue(v.R1); p.rs[1].setValue(v.R2); },
    solve: (v, T) => { const Req = v.R1 + v.R2, I = v.emf / Req, V1 = I * v.R1, V2 = I * v.R2, A = T.cur(I); return {
      given: [T.eps + ' = ' + v.emf + T.V, 'R_1 = ' + T.R(v.R1), 'R_2 = ' + T.R(v.R2)],
      steps: [['Series adds', 'R_{\\text{eq}} = R_1 + R_2 = ' + T.R(Req)],
        ['Loop current', 'I = \\dfrac{' + T.eps + '}{R_{\\text{eq}}} = ' + A(I), 'same in both resistors'],
        ['Divider', T.DV + '_1 = I R_1 = ' + T.f(V1) + T.V + T.gap + T.DV + '_2 = I R_2 = ' + T.f(V2) + T.V],
        ['Check KVL', T.DV + '_1 + ' + T.DV + '_2 = ' + T.f(V1 + V2) + T.V + ' = ' + T.eps, 'the drops sum to the source']] }; } },
  parallel: { title: 'Parallel resistors', preset: 'parallel',
    blurb: 'Two resistors share the same voltage. Find each branch current and the total drawn from the battery.',
    tip: 'Build it and put the ammeter in each branch, then next to the battery.',
    roll: (rnd) => { const R1 = rnd(1000, 6000, 500); let R2; do { R2 = rnd(1000, 6000, 500); } while (R2 === R1); return { emf: rnd(3, 12, 1), R1, R2 }; },
    reject: (v) => WorkedExample.one(v.emf / v.R1 * 1000, v.emf / v.R2 * 1000, (v.emf / v.R1 + v.emf / v.R2) * 1000),
    apply: (v, p) => { p.bat.setValue(v.emf); p.rs[0].setValue(v.R1); p.rs[1].setValue(v.R2); },
    solve: (v, T) => { const I1 = v.emf / v.R1, I2 = v.emf / v.R2, A = T.cur(I1, I2, I1 + I2); return {
      given: [T.eps + ' = ' + v.emf + T.V, 'R_1 = ' + T.R(v.R1), 'R_2 = ' + T.R(v.R2)],
      steps: [['Same voltage', T.DV + '_1 = ' + T.DV + '_2 = ' + T.eps + ' = ' + v.emf + T.V],
        ['Branch currents', 'I_1 = \\dfrac{' + T.eps + '}{R_1} = ' + A(I1) + T.gap + 'I_2 = \\dfrac{' + T.eps + '}{R_2} = ' + A(I2)],
        ['Currents add', 'I = I_1 + I_2 = ' + A(I1 + I2)],
        ['Equivalent R', 'R_{\\text{eq}} = \\dfrac{R_1 R_2}{R_1 + R_2} = ' + T.R(v.R1 * v.R2 / (v.R1 + v.R2))]] }; } },
  internal: { title: 'Battery internal resistance', preset: 'single',
    blurb: 'A real battery drops some of its EMF across its own internal resistance under load.',
    tip: 'Build it and read the terminal voltage on the voltmeter; select the battery to change its internal R.',
    roll: (rnd) => ({ emf: rnd(3, 12, 1), r: rnd(1, 6, 1), R: rnd(10, 60, 5) }),
    reject: (v) => WorkedExample.one(v.emf / (v.R + v.r)),
    apply: (v, p) => { p.bat.setValue(v.emf); p.bat.setRi(v.r); p.rs[0].setValue(v.R); },
    solve: (v, T) => { const I = v.emf / (v.R + v.r), Vt = I * v.R; return {
      given: [T.eps + ' = ' + v.emf + T.V, 'r = ' + v.r + T.O, 'R = ' + v.R + T.O],
      steps: [['Total resistance', 'R + r = ' + (v.R + v.r) + T.O],
        ['Current', 'I = \\dfrac{' + T.eps + '}{R + r} = ' + T.cur(I)(I)],
        ['Terminal voltage', 'V_{\\text{term}} = I R = ' + T.f(Vt) + T.V],
        ['Lost to r', 'I r = ' + T.f(I * v.r) + T.V + ' = ' + T.eps + ' - V_{\\text{term}}', 'this grows with current']] }; } },
  rc: { title: 'RC charging', preset: 'rc',
    blurb: 'A capacitor charges through a resistor toward the source voltage, with time constant τ = RC.',
    tip: 'Build it and turn on the voltmeter graph. Charging starts at t = 0 (press ↻ t=0 to run it again); read the voltage one time constant later.',
    roll: (rnd) => ({ emf: rnd(3, 12, 1), R: rnd(1000, 5000, 500), C: rnd(4, 20, 2) / 10 }),
    reject: (v) => WorkedExample.one(v.R * v.C / 1000, v.emf / v.R * 1000),
    apply: (v, p) => { p.bat.setValue(v.emf); p.rs[0].setValue(v.R); p.cap.setValue(v.C); },
    solve: (v, T) => { const tau = v.R * v.C / 1000; return {
      given: [T.eps + ' = ' + v.emf + T.V, 'R = ' + T.R(v.R), 'C = ' + v.C + '\\text{ mF}'],
      steps: [['Time constant', '\\tau = RC = ' + T.sig(tau) + T.s],
        ['Initial current', 'I_0 = \\dfrac{' + T.eps + '}{R} = ' + T.cur(v.emf / v.R)(v.emf / v.R), 'an empty capacitor starts out like a wire'],
        ['Charging law', T.DV + '_C = ' + T.eps + '\\left(1 - e^{-t/\\tau}\\right)'],
        ['At one τ', T.DV + '_C(\\tau) \\approx 0.63\\,' + T.eps + ' = ' + T.f(0.632 * v.emf) + T.V, 'read this at t = τ']] }; } },
  rl: { title: 'RL current ramp', preset: 'rl',
    blurb: 'An inductor resists sudden current change; the current climbs toward its final value with time constant τ = L/R.',
    tip: 'Build it, turn on the ammeter graph, close the switch, and watch I climb toward ε/R.',
    roll: (rnd) => ({ emf: rnd(3, 12, 1), R: rnd(5, 20, 5), L: rnd(4, 20, 2) }),
    reject: (v) => WorkedExample.one(v.L / v.R, v.emf / v.R),
    apply: (v, p) => { p.bat.setValue(v.emf); p.rs[0].setValue(v.R); p.ind.setValue(v.L); },
    solve: (v, T) => { const tau = v.L / v.R; return {
      given: [T.eps + ' = ' + v.emf + T.V, 'R = ' + v.R + T.O, 'L = ' + v.L + '\\text{ H}'],
      steps: [['Time constant', '\\tau = \\dfrac{L}{R} = ' + T.sig(tau) + T.s],
        ['Final current', 'I_\\infty = \\dfrac{' + T.eps + '}{R} = ' + T.cur(v.emf / v.R)(v.emf / v.R), 'in the end the inductor is just a wire'],
        ['Ramp law', 'I = I_\\infty\\left(1 - e^{-t/\\tau}\\right)'],
        ['Initial jump', T.DV + '_L(0) = ' + T.eps + ' = ' + v.emf + T.V, 'all of the EMF is across L at t = 0']] }; } },
};

// =====================================================================
// ShareLink -- the circuit as a URL (?net=...&hide=1) and back.
// =====================================================================
const ShareLink = {
  url(circuit, hide) { const p = new URLSearchParams(); p.set('net', circuit.encode()); if (hide) p.set('hide', 1); return (location.origin || '') + location.pathname + '?' + p.toString(); },
  read() { try { const q = new URLSearchParams(location.search); if (!q.has('net')) return null; const h = q.get('hide'); return { net: q.get('net'), hide: !!h && h !== '0' && h !== 'false' }; } catch (e) { return null; } },
};
