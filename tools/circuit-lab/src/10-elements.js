// =====================================================================
// Circuit Lab -- model layer.
//   P          grid-point helpers (a point is {c, r}: column, row)
//   Element    base class; one subclass per kind of part. A part owns its
//              geometry (terminals, body), its transforms (move / rotate /
//              flip), its electrical behaviour (what it shorts, what branch
//              it stamps into the solver), its state, and its share-link form.
//   Circuit    (20-circuit.js) the parts + the wire network + every edit.
//   Solver     (30-solver.js) nodal analysis over a Circuit.
// Nothing in the model layer touches the canvas; drawing lives in painters.
// =====================================================================
const P = {
  key: (p) => p.c + ',' + p.r,
  eq: (p, q) => p.c === q.c && p.r === q.r,
  of: (c, r) => ({ c, r }),
  add: (p, dc, dr) => ({ c: p.c + dc, r: p.r + dr }),
  parse: (k) => { const s = k.split(','); return { c: +s[0], r: +s[1] }; },
  aligned: (a, b) => (a.c === b.c) !== (a.r === b.r),
  // every grid point from a to b inclusive (a, b share a row or a column)
  line(a, b) {
    const dc = Math.sign(b.c - a.c), dr = Math.sign(b.r - a.r), out = [{ c: a.c, r: a.r }];
    if ((dc !== 0) === (dr !== 0)) return out;
    let p = a; while (!P.eq(p, b)) { p = { c: p.c + dc, r: p.r + dr }; out.push(p); }
    return out;
  },
  // a unit edge is named by its lower/left end plus its direction
  edge(p, q) { return (p.r === q.r) ? (Math.min(p.c, q.c) + ',' + p.r + ',h') : (p.c + ',' + Math.min(p.r, q.r) + ',v'); },
  edgeEnds(k) { const s = k.split(','); const c = +s[0], r = +s[1]; return s[2] === 'h' ? [{ c, r }, { c: c + 1, r }] : [{ c, r }, { c, r: r + 1 }]; },
  edgesOf(a, b) { const pts = P.line(a, b), out = []; for (let i = 1; i < pts.length; i++) out.push(P.edge(pts[i - 1], pts[i])); return out; },
  // quarter turn of p about pivot; dir = +1 is clockwise on screen (y down)
  turn: (p, pivot, dir) => ({ c: pivot.c - dir * (p.r - pivot.r), r: pivot.r + dir * (p.c - pivot.c) }),
};

class Element {
  static type = 'element';
  static code = '?';                 // letter used in share links
  static info = {};                  // display + editing metadata, see subclasses
  constructor(a, b, value) {
    this.id = 0;
    this.a = { c: a.c, r: a.r }; this.b = { c: b.c, r: b.r };
    const I = this.constructor.info;
    this.value = (value == null || !isFinite(value)) ? (I.def == null ? 0 : I.def) : value;
  }
  get type() { return this.constructor.type; }
  get info() { return this.constructor.info; }
  get isWire() { return false; }

  // ---- geometry ----
  fields() { return ['a', 'b']; }                 // every grid point that defines the shape
  terminalFields() { return ['a', 'b']; }         // the ones a wire can attach to
  terminals() { return this.terminalFields().map((f) => ({ name: f, p: this[f] })); }
  geometry() { const g = {}; for (const f of this.fields()) g[f] = { c: this[f].c, r: this[f].r }; return g; }
  setGeometry(g) { for (const f of this.fields()) if (g[f]) this[f] = { c: g[f].c, r: g[f].r }; return this; }
  segments() { return [[this.a, this.b]]; }       // straight grid runs the body lies on
  bodyEdges() { const out = []; for (const [p, q] of this.segments()) out.push(...P.edgesOf(p, q)); return out; }
  // every grid point the body covers
  bodyPoints() { const seen = new Map(); for (const [p, q] of this.segments()) for (const x of P.line(p, q)) seen.set(P.key(x), x); return [...seen.values()]; }
  // covered points that are not terminals: nothing else may touch these
  interiorPoints() { const t = new Set(this.terminals().map((x) => P.key(x.p))); return this.bodyPoints().filter((p) => !t.has(P.key(p))); }
  horizontal() { return this.a.r === this.b.r; }
  center() { return { c: (this.a.c + this.b.c) / 2, r: (this.a.r + this.b.r) / 2 }; }
  // the grid point a quarter turn is made about: the middle, or an end when the middle is not a grid point
  pivot() { const m = this.center(); return (Number.isInteger(m.c) && Number.isInteger(m.r)) ? m : { ...this.a }; }
  translated(dc, dr) { const g = this.geometry(); for (const f in g) g[f] = P.add(g[f], dc, dr); return g; }
  rotated(dir) { if (!this.info.rotatable) return null; const g = this.geometry(), pv = this.pivot(); for (const f in g) g[f] = P.turn(g[f], pv, dir); return g; }
  flipped() { return null; }                      // geometry after "Flip", or null when the part has no flip
  turnEndForEnd() {}                              // ends a and b have just been exchanged: keep the state where it was in the circuit
  // the geometries "Flip" may use, best first (the next is tried when one does not fit)
  flipChoices() { const g = this.flipped(); return g ? [g] : []; }
  // how many grid steps of clear space lie between this part's body and another's
  // do the two parts lie along one grid line, end to end -- the way parts in series are drawn?
  inLineWith(other) { const all = [...this.bodyPoints(), ...other.bodyPoints()]; return all.every((p) => p.r === all[0].r) || all.every((p) => p.c === all[0].c); }
  clearanceTo(other) { let d = Infinity; const mine = this.bodyPoints(); for (const q of other.bodyPoints()) for (const p of mine) d = Math.min(d, Math.max(Math.abs(p.c - q.c), Math.abs(p.r - q.r))); return d; }

  // ---- electrical behaviour ----
  // pairs of points this part ties together with zero resistance
  shorts(mode) { return []; }
  // points this part pins at 0 V
  grounds() { return []; }
  // the branch this part contributes: null, a Norton branch {a,b,g,J}
  // (current a->b is g*(Va-Vb)+J) or a source {a,b,src:true,V,ri} (V = Va-Vb... see Solver)
  branch(mode, env) { return null; }
  commit(dV, I) {}                                // take the solved step into the part's own state
  // How a capacitor or an inductor turns "rate of change" into one time step: backward differentiation,
  //   dy/dt at the new instant = (lead * y_new - (weights . the values behind it)) / dt
  // of order 1 (backward Euler) to 4. All four are stiffly stable -- a decay far faster than the step simply
  // dies -- but they differ in what they do to an oscillation of angular frequency w, with x = w dt:
  //   order 2 runs slow by x^2 / 3 and damps by x^4 / 4 a step. A thousandth of a percent sounds small, but a
  //           resonance is exactly where it is not: a tank driven a tenth of a percent off its peak drew 13 %
  //           too little current.
  //   order 4 runs slow by x^4 / 5 and grows by x^6 / 3 a step: at 150 steps a period, three parts in ten
  //           million a period. It is only stable for swings the step resolves, so Simulation asks for it
  //           (env.order) only while that is so.
  // The values behind a jump are not history: env.first restarts at order 1, and the order then climbs a step
  // at a time, never reaching back across the jump.
  static BDF = [null, { lead: 1, past: [1] }, { lead: 3 / 2, past: [2, -1 / 2] }, { lead: 11 / 6, past: [3, -3 / 2, 1 / 3] }, { lead: 25 / 12, past: [4, -3, 4 / 3, -1 / 4] }];
  // the formula this step may use, given the part's values newest first: its `lead`, and the weighted sum `past`
  static stepFormula(env, ys) { let k = env.first ? 1 : Math.min(env.order || 2, Element.BDF.length - 1); while (k > 1 && ys[k - 1] == null) k--;
    const f = Element.BDF[k]; let past = 0; for (let j = 0; j < k; j++) past += f.past[j] * ys[j]; return { lead: f.lead, past }; }
  resetState() {}
  stepFrom(live) {}                               // the values behind it are one step old, and that step began at `live` (its liveState() then)
  get reactive() { return false; }                // needs time-stepping
  get swing() { return 0; }                       // rad/s at which the part itself drives the circuit (an AC source)
  get henries() { return 0; }                     // what it stores energy with, if it does: inductance,
  get farads() { return 0; }                      //   capacitance (the clock sizes its step from these)
  get open() { return false; }                    // a deliberate break in the circuit: carries no current by definition
  // What the part is doing right now, as opposed to how it is laid out: undo and
  // drags put the layout back but leave this alone.
  liveState() { return null; }
  setLiveState(s) {}

  // ---- naming: the n-th part of its kind is "R2" on the canvas and R_{2} in formulas ----
  labelText(n, of) { const I = this.info; if (!I.prefix) return ''; return (I.skipFirstSub && n === 1 && !(of > 1)) ? I.prefix : I.prefix + String(n).split('').map((d) => '\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089'[+d]).join(''); }
  labelTex(n, of) { const I = this.info; if (!I.sym) return ''; return (I.skipFirstSub && n === 1 && !(of > 1)) ? I.sym : I.sym + '_{' + n + '}'; }

  // ---- values ----
  setValue(v) { const I = this.info; if (!I.hasValue || !isFinite(v)) return false; this.value = Math.max(I.min, Math.min(I.max, v)); return true; }
  // the range a typed number is held to: { min, max, unit, label }, or null for a field this part lacks
  limits(field) { const I = this.info; return field === 'value' && I.hasValue ? { min: I.min, max: I.max, unit: I.unit, label: I.valueLabel, say: (x) => this.constructor.say(x) } : null; }
  // a value of this kind of part, written out with its unit ("220 Ω", "4.7 kΩ", "0.47 mF")
  static say(v) { return Fmt.num(v, 3) + ' ' + this.info.unit; }
  valueText() { return this.constructor.say(this.value); }

  // ---- share link ----
  encodeGeom() { return this.a.c + '.' + this.a.r + '-' + this.b.c + '.' + this.b.r; }
  encodeTail() { return this.info.hasValue ? '@' + (+this.value.toFixed(4)) : ''; }
  encode() { return this.constructor.code + this.encodeGeom() + this.encodeTail(); }
  decodeTail(tail) { const m = /^@(-?[\d.]+)/.exec(tail || ''); if (m && this.info.hasValue) this.setValue(parseFloat(m[1])); }

  clone() { const o = Object.create(Object.getPrototypeOf(this)); for (const k of Object.keys(this)) { const v = this[k]; o[k] = Array.isArray(v) ? v.slice() : (v && typeof v === 'object') ? { ...v } : v; } return o; }
}

class Wire extends Element {
  static type = 'wire'; static code = 'w';
  static info = { name: 'Wire', rotatable: false, hasValue: false, showMeas: true };
  get isWire() { return true; }
  shorts() { return [[this.a, this.b]]; }
  get length() { return Math.abs(this.a.c - this.b.c) + Math.abs(this.a.r - this.b.r); }
}

class Resistor extends Element {
  static type = 'resistor'; static code = 'r';
  // 0.5 Ω to 100 kΩ: wide enough for the kΩ resistors (and mA currents) of a real bench, and still
  // able to go low for the RL and RLC circuits, whose time constants need a few ohms to be watchable
  static info = { name: 'Resistor', prefix: 'R', sym: 'R', unit: 'Ω', valueLabel: 'Resistance', def: 1000, min: 0.5, max: 100000, step: 1,
    hasValue: true, rotatable: true, showMeas: true, menu: { group: 'Load', label: 'Resistor', svg: 'resistor' } };
  static say(v) { return v >= 1000 ? Fmt.num(v / 1000, 3) + ' kΩ' : Fmt.num(v, 3) + ' Ω'; }
  branch() { return { a: this.a, b: this.b, g: 1 / this.value, J: 0 }; }
}

class Capacitor extends Element {
  static type = 'cap'; static code = 'c';
  static info = { name: 'Capacitor', prefix: 'C', sym: 'C', unit: 'mF', valueLabel: 'Capacitance', def: 10, min: 0.1, max: 200, step: 0.1,
    hasValue: true, rotatable: true, showMeas: true, menu: { group: 'Load', label: 'Capacitor', svg: 'cap' } };
  constructor(a, b, value) { super(a, b, value); this.vc = 0; this.vc1 = this.vc2 = this.vc3 = null; }   // voltage now, and one, two and three steps ago
  get reactive() { return true; }
  get farads() { return this.value * 1e-3; }
  get charge() { return this.farads * this.vc; }   // coulombs, + on the a plate
  // Companion model for one time step, i = C dv/dt = C (lead v - past) / dt   (see Element.stepFormula):
  //   first order    i = C (v - v_n) / dt                  -- used to restart after a jump
  //   second order   i = C (3v - 4v_n + v_n-1) / (2 dt)    ...and so on up
  branch(mode, env) { if (mode !== 'tran') return null; const k = this.farads / env.dt, f = Element.stepFormula(env, [this.vc, this.vc1, this.vc2, this.vc3]);
    return { a: this.a, b: this.b, g: k * f.lead, J: -k * f.past }; }
  commit(dV) { if (isFinite(dV)) { this.vc3 = this.vc2; this.vc2 = this.vc1; this.vc1 = this.vc; this.vc = dV; } }
  resetState() { this.vc = 0; this.vc1 = this.vc2 = this.vc3 = null; }
  stepFrom(live) { this.vc1 = live.vc; this.vc2 = this.vc3 = null; }
  liveState() { return { vc: this.vc, vc1: this.vc1, vc2: this.vc2, vc3: this.vc3 }; }
  setLiveState(s) { this.vc = s.vc; this.vc1 = s.vc1; this.vc2 = s.vc2; this.vc3 = s.vc3; }
  turnEndForEnd() { this.vc = -this.vc; for (const k of ['vc1', 'vc2', 'vc3']) if (this[k] != null) this[k] = -this[k]; }
}

class Inductor extends Element {
  static type = 'ind'; static code = 'l';
  static info = { name: 'Inductor', prefix: 'L', sym: 'L', unit: 'H', valueLabel: 'Inductance', def: 1, min: 0.05, max: 20, step: 0.05,
    hasValue: true, rotatable: true, showMeas: true, menu: { group: 'Load', label: 'Inductor', svg: 'ind' } };
  constructor(a, b, value) { super(a, b, value); this.il = 0; this.il1 = this.il2 = this.il3 = null; }   // current now, and one, two and three steps ago
  get reactive() { return true; }
  get henries() { return this.value; }
  shorts(mode) { return mode === 'dc' ? [[this.a, this.b]] : []; }
  // Companion model for one time step, v = L di/dt = L (lead i - past) / dt   (see Element.stepFormula):
  //   first order    i = (dt / L) v + i_n                     -- used to restart after a jump
  //   second order   i = (2 dt / 3L) v + (4 i_n - i_n-1) / 3  ...and so on up
  branch(mode, env) { if (mode !== 'tran') return null; const f = Element.stepFormula(env, [this.il, this.il1, this.il2, this.il3]);
    return { a: this.a, b: this.b, g: env.dt / (f.lead * this.value), J: f.past / f.lead }; }
  commit(dV, I) { if (isFinite(I)) { this.il3 = this.il2; this.il2 = this.il1; this.il1 = this.il; this.il = I; } }
  resetState() { this.il = 0; this.il1 = this.il2 = this.il3 = null; }
  stepFrom(live) { this.il1 = live.il; this.il2 = this.il3 = null; }
  liveState() { return { il: this.il, il1: this.il1, il2: this.il2, il3: this.il3 }; }
  setLiveState(s) { this.il = s.il; this.il1 = s.il1; this.il2 = s.il2; this.il3 = s.il3; }
  turnEndForEnd() { this.il = -this.il; for (const k of ['il1', 'il2', 'il3']) if (this[k] != null) this[k] = -this[k]; }
}

class Battery extends Element {
  static type = 'battery'; static code = 'b';
  static info = { name: 'Battery', prefix: 'ε', skipFirstSub: true, sym: '\\varepsilon', unit: 'V', valueLabel: 'EMF', def: 6, min: 0.5, max: 24, step: 0.5,
    hasValue: true, rotatable: true, showMeas: true, vertical: true, menu: { group: 'Voltage Source', label: 'Battery', svg: 'battery' } };
  static riLimits = [0, 50];
  constructor(a, b, value) { super(a, b, value); this.ri = 0; }
  // a is the + terminal
  branch() { return { a: this.a, b: this.b, src: true, V: this.value, ri: this.ri || 0 }; }
  setRi(v) { if (!isFinite(v)) return false; this.ri = Math.max(Battery.riLimits[0], Math.min(Battery.riLimits[1], v)); return true; }
  limits(field) { return field === 'ri' ? { min: Battery.riLimits[0], max: Battery.riLimits[1], unit: 'Ω', label: 'Internal resistance' } : super.limits(field); }
  flipped() { return { a: { ...this.b }, b: { ...this.a } }; }
  encodeTail() { return super.encodeTail() + (this.ri > 0 ? '~' + (+this.ri.toFixed(3)) : ''); }
  decodeTail(tail) { super.decodeTail(tail); const m = /~([\d.]+)/.exec(tail || ''); if (m) this.setRi(parseFloat(m[1])); }
}

class AcSource extends Element {
  static type = 'ac'; static code = 'o';
  static info = { name: 'AC Source', prefix: 'AC', unit: 'V', valueLabel: 'Amplitude', def: 6, min: 0.5, max: 24, step: 0.5,
    hasValue: true, rotatable: true, showMeas: true, vertical: true,
    menu: { group: 'Voltage Source', label: 'AC Source', svg: 'ac', hint: 'AC source — v(t) = amplitude × sin(2πft)' } };
  static freqLimits = [0.05, 20];
  // v(t) = amplitude x sin(angle), and the angle turns at 2 pi f. It is kept as an anchor -- the angle `ph` at
  // the time `t0` -- so that a new frequency carries the swing on from where it is (as a function generator's
  // knob does) instead of jumping to where the new frequency would have been by now. `seen` is the last time
  // the source was asked for its voltage: "now", as far as the source can tell.
  //
  // A source that is not part of any loop is at rest (`idle`): it gives 0 V, and its sine starts from zero at the
  // instant its loop is closed (see Simulation.rest). So v = V sin(2 pi f t) holds on the clock face of a circuit
  // built by hand, whatever else was running on the bench before.
  constructor(a, b, value) { super(a, b, value); this.freq = 0.5; this.t0 = 0; this.ph = 0; this.seen = 0; this.idle = false; }   // a 2 s period: slow enough to watch, and not the "exactly 1" that hides a factor
  get reactive() { return true; }
  get swing() { return 2 * Math.PI * this.freq; }
  angle(t) { return this.ph + 2 * Math.PI * this.freq * (t - this.t0); }
  anchor(t, ph) { this.t0 = this.seen = t; this.ph = ph % (2 * Math.PI); }
  branch(mode, env) { if (isFinite(env.t)) this.seen = env.t; return { a: this.a, b: this.b, src: true, V: this.idle ? 0 : this.value * Math.sin(this.angle(env.t)), ri: 0 }; }
  resetState() { this.anchor(0, 0); this.idle = false; }
  liveState() { return { t: this.seen, ph: this.angle(this.seen) }; }
  setLiveState(s) { this.anchor(s.t, s.ph); }
  labelTex(n) { return '\\mathrm{AC}_{' + n + '}'; }
  valueText() { return super.valueText() + ' peak'; }      // the value is the amplitude, not an rms voltage
  setFreq(v) { if (!isFinite(v)) return false; this.anchor(this.seen, this.angle(this.seen)); this.freq = Math.max(AcSource.freqLimits[0], Math.min(AcSource.freqLimits[1], v)); return true; }
  limits(field) { return field === 'freq' ? { min: AcSource.freqLimits[0], max: AcSource.freqLimits[1], unit: 'Hz', label: 'Frequency' } : super.limits(field); }
  flipped() { return { a: { ...this.b }, b: { ...this.a } }; }
  encodeTail() { return super.encodeTail() + '~' + (+this.freq.toFixed(3)); }
  decodeTail(tail) { super.decodeTail(tail); const m = /~([\d.]+)/.exec(tail || ''); if (m) this.setFreq(parseFloat(m[1])); }
}

// a run of [t, value] samples in time order, for the graph: the oldest go once there are more than `cap`
// (a block at a time -- with a sample every step, dropping them one by one would shift the whole run every step)
const Trace = {
  BLOCK: 256,
  gap(sample) { return sample[1] !== sample[1]; },
  // A time with nothing to read (the circuit could not be solved, the meter was not connected) is kept as one
  // break, [t, NaN]: the graph lifts its pen there instead of ruling a line from the last reading to the next.
  put(s, t, v, cap) { const last = s[s.length - 1]; if (!isFinite(v)) { if (!last || Trace.gap(last)) return; v = NaN; } else if (last && last[0] === t && last[1] === v) return; s.push([t, v]); if (s.length > cap) s.splice(0, s.length - cap + Trace.BLOCK); },
};

class Meter extends Element {
  static KEEP = 8300;                             // the graph's longest span (16 s) at a sample every 2 ms step, and the block that goes at once
  constructor(a, b, value) { super(a, b, value); this.graph = false; this.samples = []; this.turns = 0; this.face = 0; }
  encodeTail() { return this.graph ? '*' : ''; }
  decodeTail(tail) { this.graph = /\*/.test(tail || ''); }
  resetState() { this.samples = []; this.face = this.turns; }
  liveState() { return { graph: this.graph, samples: this.samples, face: this.face }; }
  setLiveState(s) { this.graph = s.graph; this.samples = s.samples; this.face = s.face; }
  // the reading as a bare number (volts or amps), NaN when there is nothing to read
  number(sol) { const r = sol ? this.reading(sol) : { err: 'unsolved' }; return r.err ? NaN : (r.dV != null ? r.dV : r.I); }
  // What has been recorded, as read with the leads the way they are now. When the two leads change places
  // (Flip, a half turn in line, an undo of either) the whole trace changes sign with the reading: the circuit
  // did nothing at that moment, so the graph must not show a jump.
  // `turns` counts the exchanges and belongs to the layout (undo takes it back); `face` is the count the samples
  // were written at and stays with them.
  turnEndForEnd() { this.turns ^= 1; }
  trace() { if ((this.face | 0) !== (this.turns | 0)) { this.samples = this.samples.map((s) => [s[0], -s[1]]); this.face = this.turns | 0; } return this.samples; }
  // (a meter keeps its trace whether or not its graph is showing, so the graph has the whole run when it is opened)
  record(t, v) { Trace.put(this.trace(), t, v, Meter.KEEP); }
}

class Voltmeter extends Meter {
  static type = 'volt'; static code = 'v';
  static info = { name: 'Voltmeter', prefix: 'V', sym: '\\mathrm{V}', unit: 'V', hasValue: false, rotatable: true, showMeas: false, isMeter: true,
    note: 'Ideal voltmeter — an open circuit across its two nodes; reads the potential difference and draws no current.',
    menu: { group: 'Meter', label: 'Voltmeter', svg: 'volt', hint: 'Voltmeter (across)' } };
  flipped() { return { a: { ...this.b }, b: { ...this.a } }; }
  // reads the potential difference V(a) - V(b); needs no ground
  reading(sol) { if (!sol.sameGroup(this.a, this.b) && sol.node(this.a) !== sol.node(this.b)) return { err: 'not across one circuit' }; const dV = sol.drop(this.a, this.b); return isFinite(dV) ? { dV } : { err: 'floating' }; }
}

class Ammeter extends Meter {
  static type = 'amm'; static code = 'a';
  static info = { name: 'Ammeter', prefix: 'A', sym: '\\mathrm{A}', unit: 'A', hasValue: false, rotatable: true, showMeas: false, isMeter: true,
    note: 'Ideal ammeter — a short in-line with the wire; reads the current passing through and adds no resistance.',
    menu: { group: 'Meter', label: 'Ammeter', svg: 'amm', hint: 'Ammeter (in-line)' } };
  shorts() { return [[this.a, this.b]]; }
  flipped() { return { a: { ...this.b }, b: { ...this.a } }; }
  // reads the current passing through it from a to b
  reading(sol) { return sol.stuck(this.a) ? { err: 'unsolved' } : sol.loose && sol.loose.has(this.id) ? { err: 'loose' } : sol.flows.has(this.id) ? { I: sol.flow(this) } : { err: 'no path' }; }
}

class Switch extends Element {
  static type = 'switch'; static code = 's';
  static info = { name: 'Switch', prefix: 'S', sym: '\\mathrm{S}', hasValue: false, rotatable: true, showMeas: true, isSwitch: true,
    menu: { group: 'Control', label: 'Switch', svg: 'switch', hint: 'Switch (click its lever to open/close)' } };
  constructor(a, b, value) { super(a, b, value); this.value = value > 0.5 ? 1 : 0; }
  get closed() { return this.value > 0.5; }
  get open() { return !this.closed; }
  toggle() { this.value = this.closed ? 0 : 1; }
  liveState() { return { value: this.value }; }
  setLiveState(s) { this.value = s.value; }
  shorts() { return this.closed ? [[this.a, this.b]] : []; }
  encodeTail() { return '@' + (this.closed ? 1 : 0); }
  decodeTail(tail) { const m = /^@([\d.]+)/.exec(tail || ''); this.value = (m && parseFloat(m[1]) > 0.5) ? 1 : 0; }
}

// One pole (a), two throws (b1, b2). The throws sit 3 units along the
// switch's axis from the pole and one unit to either side of it; the lever
// (pivot -> live contact) is the one line in the sim allowed off the grid.
class ThrowSwitch extends Element {
  static type = 'swdt'; static code = 'x';
  static info = { name: '2-Position Switch', prefix: 'S', sym: '\\mathrm{S}', hasValue: false, rotatable: true, showMeas: true, isSwitch: true, isThrow: true,
    menu: { group: 'Control', label: '2-position switch', svg: 'swdt', hint: 'One pivot, two fixed contacts — closing one throw opens the other (e.g. charge/discharge)' } };
  constructor(a, b1, b2, value) { super(a, b1, value); this.b1 = { ...b1 }; this.b2 = { ...b2 }; delete this.b; this.value = value > 0.5 ? 1 : 0; this.tag1 = 'position 1'; this.tag2 = 'position 2'; }
  static at(a, sign) { return new ThrowSwitch(a, P.add(a, 3 * sign, -1), P.add(a, 3 * sign, 1), 0); }
  fields() { return ['a', 'b1', 'b2']; }
  terminalFields() { return ['a', 'b1', 'b2']; }
  get position() { return this.value > 0.5 ? 2 : 1; }
  get live() { return this.value > 0.5 ? this.b2 : this.b1; }
  toggle() { this.value = this.value > 0.5 ? 0 : 1; }
  liveState() { return { value: this.value }; }
  setLiveState(s) { this.value = s.value; }
  // unit vector of the axis (pole -> throws)
  axis() { return this.b1.c === this.b2.c ? { c: Math.sign(this.b1.c - this.a.c) || 1, r: 0 } : { c: 0, r: Math.sign(this.b1.r - this.a.r) || 1 }; }
  // pivot = end of the pole's lead; t1 / t2 = the fixed contacts the lever lands on
  geom() { const u = this.axis(); return { pivot: P.add(this.a, u.c, u.r), t1: P.add(this.b1, -u.c, -u.r), t2: P.add(this.b2, -u.c, -u.r), mouth: P.add(this.a, 2 * u.c, 2 * u.r) }; }
  segments() { const g = this.geom(); return [[this.a, g.pivot], [g.t1, this.b1], [g.t2, this.b2], [g.t1, g.t2]]; }
  // the t1-t2 run is kept clear so nothing can be wired through the lever's swing
  bodyEdges() { const g = this.geom(); return [...P.edgesOf(this.a, g.pivot), ...P.edgesOf(g.t1, this.b1), ...P.edgesOf(g.t2, this.b2), ...P.edgesOf(g.t1, g.t2)]; }
  horizontal() { return this.b1.c === this.b2.c; }
  center() { const g = this.geom(); return { c: (g.pivot.c + g.mouth.c) / 2, r: (g.pivot.r + g.mouth.r) / 2 }; }
  pivot() { return { ...this.a }; }
  shorts() { return [[this.a, this.live]]; }
  // Flip turns the switch to face the other way. First choice: on the spot (the pole
  // and the throws change ends); second: about the pole (the throws swing to its far side).
  flipped() { const u = this.axis(), g = this.geometry(); g.a = P.add(this.a, 3 * u.c, 3 * u.r); g.b1 = P.add(this.b1, -3 * u.c, -3 * u.r); g.b2 = P.add(this.b2, -3 * u.c, -3 * u.r); return g; }
  flipChoices() { const g = this.geometry(); g.b1 = { c: 2 * this.a.c - this.b1.c, r: 2 * this.a.r - this.b1.r }; g.b2 = { c: 2 * this.a.c - this.b2.c, r: 2 * this.a.r - this.b2.r }; return [this.flipped(), g]; }
  encodeGeom() { return this.a.c + '.' + this.a.r + '-' + this.b1.c + '.' + this.b1.r + '-' + this.b2.c + '.' + this.b2.r; }
  encodeTail() { return '@' + (this.value > 0.5 ? 1 : 0); }
  decodeTail(tail) { const m = /^@([\d.]+)/.exec(tail || ''); this.value = (m && parseFloat(m[1]) > 0.5) ? 1 : 0; }
}

class Ground extends Element {
  static type = 'ground'; static code = 'g';
  static info = { name: 'Ground', hasValue: false, rotatable: false, showMeas: false, vertical: true, span: 2,
    menu: { group: 'Reference', label: 'Ground (0 V)', svg: 'ground', hint: 'Reference node — the point every voltage is measured from' } };
  terminalFields() { return ['a']; }
  grounds() { return [this.a]; }
}

// Registry: by type name and by share-link letter. The Add menu, the
// decoder and the painters are all driven from these two tables.
const ELEMENT_CLASSES = [Battery, AcSource, Voltmeter, Ammeter, Resistor, Capacitor, Inductor, Switch, ThrowSwitch, Ground, Wire];
const ELEMENTS = {}; const ELEMENT_BY_CODE = {};
for (const K of ELEMENT_CLASSES) { ELEMENTS[K.type] = K; ELEMENT_BY_CODE[K.code] = K; }
Element.create = (type, a, b, value) => new ELEMENTS[type](a, b, value);
// one token of a share link -> an Element (or null)
Element.decode = (tok) => {
  const K = ELEMENT_BY_CODE[tok[0]]; if (!K) return null;
  const pt = '(-?\\d+)\\.(-?\\d+)';
  if (K === ThrowSwitch) { const m = new RegExp('^x' + pt + '-' + pt + '-' + pt + '(.*)$').exec(tok); if (!m) return null;
    const e = new ThrowSwitch({ c: +m[1], r: +m[2] }, { c: +m[3], r: +m[4] }, { c: +m[5], r: +m[6] }, 0); e.decodeTail(m[7]); return e; }
  const m = new RegExp('^.' + pt + '-' + pt + '(.*)$').exec(tok); if (!m) return null;
  const a = { c: +m[1], r: +m[2] }, b = { c: +m[3], r: +m[4] };
  if (!P.aligned(a, b)) return null;
  const e = new K(a, b); e.decodeTail(m[5]); return e;
};
