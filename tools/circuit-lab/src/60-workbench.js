// =====================================================================
// Scope -- traces taken straight from the parts, with no meter. This is the
// Probe variant (circuit-lab-probe/, see variants/probe.js); in the main sim
// it is off and does nothing.
//
// While it is on, every part's potential difference and current are recorded
// all the time, so a part that is clicked has its last few seconds to show at
// once. The graph plots the selected part, and any part that has been kept.
//
// A part has no + lead to say which way is positive, so each run is positive
// the way it first went: a battery reads +6 V whichever way round it was
// drawn, and a current that later reverses goes below zero.
// =====================================================================
class Scope {
  static on = false;
  static KEEP = 8300;                                   // samples a run holds: the graph's longest span (16 s) at a sample every step, and the block that goes at once
  static LIVE = { v: 1e-6, i: 5e-8 };                   // below this a run has not yet "gone" either way
  constructor(circuit) { this.circuit = circuit; this.runs = new Map(); }       // part id -> { type, mode, kept, v, i, sv, si }
  // every part that shows a voltage and a current in its card can be plotted
  static takes(el) { return !!el && !!el.info.showMeas; }
  // what can be plotted for it ('v' potential difference, 'i' current), and what is plotted first:
  // the parts that are simply part of the line -- a wire, a switch -- show their current
  static modes(el) { return el instanceof Wire ? ['i'] : ['v', 'i']; }
  static firstMode(el) { return el instanceof Wire || el.info.isSwitch ? 'i' : 'v'; }
  of(el) { let r = this.runs.get(el.id); if (!r || r.type !== el.type) this.runs.set(el.id, r = { type: el.type, mode: Scope.firstMode(el), kept: false, v: [], i: [], sv: 0, si: 0 }); return r; }
  setMode(el, mode) { if (Scope.takes(el) && Scope.modes(el).includes(mode)) this.of(el).mode = mode; }
  // keep a part's trace on the graph when it is no longer the selected part (or stop keeping it)
  keep(el, on) { if (Scope.takes(el)) this.of(el).kept = !!on; }
  // record every part at this instant, and forget the parts that have gone
  sample(t, sol) { if (!Scope.on || !sol) return; const here = new Set();
    for (const el of this.circuit.elements) { if (!Scope.takes(el)) continue; here.add(el.id); const r = this.of(el), m = sol.measure(el);
      for (const [k, sign, x] of [['v', 'sv', m.dV], ['i', 'si', m.I]]) { if (isFinite(x) && !r[sign] && Math.abs(x) > Scope.LIVE[k]) r[sign] = Math.sign(x); Trace.put(r[k], t, x * (r[sign] || 1), Scope.KEEP); } }
    for (const id of [...this.runs.keys()]) if (!here.has(id)) this.runs.delete(id); }
  // a different circuit is on the bench: its parts are not the old ones, whatever their ids
  clear() { this.runs.clear(); }
  // empty every run (the clock was reset); what is kept and what each part plots stay as they are
  reset() { for (const r of this.runs.values()) { r.v = []; r.i = []; r.sv = 0; r.si = 0; } }
  // the traces to plot: the kept parts, and the part that is selected
  traces(selId) { if (!Scope.on) return []; const out = [];
    for (const [id, r] of this.runs) if (r.kept || id === selId) out.push({ id, part: true, kind: r.mode === 'i' ? 'amm' : 'volt', samples: r[r.mode] }); return out; }
}

// =====================================================================
// Simulation -- the clock. Steps the circuit through time, keeps the latest
// Solution, and feeds the meters that are being graphed.
//
// `t` only ever runs forward (it is the AC phase and the time stamp on every
// graph sample). What the clock face shows is t - origin: throwing a switch,
// or an edit that brings a dead circuit to life, calls that instant zero
// without resetting anything.
//
// Integration. Capacitors and inductors step by backward differentiation
// (see Element.stepFormula): fourth order once under way, which needs four
// past values. Whenever something jumps -- a switch is thrown, the circuit
// is edited, the clock is reset -- the history is no longer smooth, so the
// next Simulation.RESTART steps are first order (each taken as START short
// ones, see start()), and the order then climbs one a step.
//
// The step. Time moves in whole steps of DT, and the meters are read at
// every one, so a trace is the same whatever the frame rate. DT follows
// anything slower than a few hertz closely; a circuit that can swing faster
// -- an AC source turned up, a small L with a small C -- has each DT cut
// into `cuts` equal steps so that a period of its fastest swing still gets
// about Simulation.FINE of them (see pace()). A fast *decay* needs nothing:
// the formula is stable however short the time constant.
// =====================================================================
class Simulation {
  static DT = 0.002;
  static NOW = 1e-7;                  // a step so short it is "this instant"
  static RESTART = 2;                 // first-order steps taken after a jump, before the order climbs again
  static START = 16;                  // ...each of them taken as this many short ones
  static ORDER = 4;                   // the order of the step formula once it is under way (see Element.stepFormula)
  static FINE = 150;                  // steps wanted in one period of the fastest swing
  static FINEST = 32;                 // the most steps a DT is ever cut into
  constructor(circuit) { this.circuit = circuit; this.scope = new Scope(circuit); this.t = 0; this.origin = 0; this.acc = 0; this.sol = null; this.playing = true; this.since = 0; this.cuts = 1; this.resolved = true; this.resting = new Set(); this.unplugged = new Set(); }
  // is the graph showing? (with the Scope on, always: it is where a clicked part's trace appears)
  get graphing() { return Scope.on || this.circuit.ofType(Meter).some((m) => m.graph); }
  // is there anything here that changes with time?
  get timed() { return this.circuit.clocked || this.graphing; }
  get running() { return this.playing && this.timed; }
  get shown() { return this.t - this.origin; }
  get mode() { return this.circuit.reactive ? 'tran' : 'dc'; }
  // the environment for one full time step, and for looking at this very instant
  env() { return { mode: this.mode, dt: Simulation.DT / this.cuts, t: this.t, first: this.since < Simulation.RESTART, order: this.order }; }
  // The order of the next step. `since` counts the steps taken since the last jump (a switch, an edit, a reset,
  // a change of step length): RESTART of them are first order, and after that the order goes up one a step, so
  // that no formula reaches back past the jump. It stops at ORDER -- or at 2 where the circuit can swing faster
  // than the shortest step resolves, since only the second-order formula is stable whatever it is given.
  get order() { const k = this.since - Simulation.RESTART + 2; return k < 2 ? 1 : Math.min(k, this.resolved ? Simulation.ORDER : 2); }
  // How many steps to cut each DT into. The fastest this circuit can swing is the fastest of its
  // sources, or -- with both inductors and capacitors -- no faster than sqrt(nL nC / (Lmin Cmin)):
  // the smallest inductance n parallel coils can make, with the smallest capacitance n series capacitors can.
  pace() { const want = this.wanted(); this.resolved = want <= Simulation.FINEST; return Math.min(Simulation.FINEST, want); }
  wanted() { let w = 0, L = Infinity, C = Infinity, nL = 0, nC = 0;
    for (const e of this.circuit.elements) { w = Math.max(w, e.swing); if (e.henries > 0) { nL++; L = Math.min(L, e.henries); } if (e.farads > 0) { nC++; C = Math.min(C, e.farads); } }
    if (nL && nC) w = Math.max(w, Math.sqrt(nL * nC / (L * C)));
    return Math.max(1, Math.ceil(w * Simulation.DT * Simulation.FINE / (2 * Math.PI) - 1e-9)); }
  envNow() { return { mode: this.mode, dt: Simulation.NOW, t: this.t, first: true }; }
  // Solve the present instant again without moving time on (while dragging, or
  // paused): capacitors hold their voltage and inductors their current.
  // `edited` says the circuit itself has just changed. If that brought a dead circuit to life -- the last
  // wire of a loop laid, a battery dropped into a gap -- this instant is zero on the clock face, exactly as
  // when a switch is thrown. (Both pictures are of the same instant, so an AC source passing through zero
  // is dead before and after, and restarts nothing.)
  refresh(edited) { const was = edited && this.alive; this.sol = Solver.instant(this.circuit, this.envNow()); if (edited) { if (!was && this.alive) this.mark(); this.face(); } return this.sol; }
  // A clock that comes up comes up at zero. The face is only there while something here changes with time
  // (see `timed`); an edit or a graph that brings it up where there was none -- a capacitor dropped back into
  // a quiet loop, the first graph on a DC circuit -- starts it from nought, not from the age of a run long over.
  face() { const up = this.timed; if (up && !this.faced) this.mark(); this.faced = up; }
  // is any current flowing anywhere -- or about to? (A loop with an inductor in it carries nothing at the instant
  // it is closed: the inductor takes the whole voltage, and the current grows from zero. That is alive too.)
  get alive() { if (!this.sol) return false; for (const f of this.sol.flows.values()) if (Math.abs(f) >= Fmt.ZERO_A) return true;
    return this.circuit.ofType(Inductor).some((l) => Math.abs(this.sol.measure(l).dV) >= Simulation.ZERO_V); }
  static ZERO_V = 1e-6;
  // The circuit has just changed under the clock (edit, switch, typed value).
  // Whatever must change instantly does -- an inductor whose path was cut loses
  // its current, capacitors joined by bare wire share their charge -- and the
  // integrator restarts. Returns the inductors whose current was cut off.
  jolt() { this.rest(); const cut = this.strike(); this.since = 0; this.refresh(true); this.sample(); return cut; }
  // `jumped` lists the capacitors whose voltage changed at once, as { el, from, to }: with no resistance in the
  // loop nothing limits the current, and the charge is simply there. (Left to the first step of the clock instead,
  // that charge arrives as C V / dt -- a million amps on the ammeter, and on its graph, at t = 0.)
  strike() { const cut = []; this.jumped = []; if (!this.circuit.reactive) return cut;
    const was = new Map(this.circuit.ofType(Inductor).map((l) => [l, l.il])), caps = this.circuit.ofType(Capacitor).map((c) => [c, c.vc]);
    Solver.commit(this.circuit, Solver.instant(this.circuit, this.envNow(), { flows: false }));
    for (const [l, i0] of was) { if (Math.abs(l.il) < 1e-6 * Math.abs(i0)) l.il = 0;      // cut dead: what is left is rounding
      if (Math.abs(i0) > 1e-6 && Math.abs(l.il) < 0.5 * Math.abs(i0)) cut.push(l); }
    for (const [c, v0] of caps) if (Math.abs(c.vc - v0) > 1e-3 * (1 + Math.abs(v0))) this.jumped.push({ el: c, from: v0, to: c.vc });
    return cut; }
  // what the graph plots: a trace for every meter whose graph is switched on (and, with the Scope on,
  // for the parts it is showing -- `selId` is the selected part)
  traces(selId) { return [...this.circuit.ofType(Meter).filter((m) => m.graph).map((m) => ({ id: m.id, kind: m.type, samples: m.trace() })), ...this.scope.traces(selId)]; }
  // give every meter its reading at this instant. (A voltmeter with nothing to read gives NaN, which the trace keeps
  // as a break; a loose ammeter would give a confident 0 mA, and then a cliff on its graph when it is dropped into
  // a live loop, so it records a break as well.)
  sample() { for (const m of this.circuit.ofType(Meter)) m.record(this.t, this.unplugged.has(m.id) ? NaN : m.number(this.sol)); this.scope.sample(this.t, this.sol); }
  // run for `elapsed` seconds of wall time; true if time moved
  advance(elapsed) { if (!this.running || !(elapsed > 0)) return false; const DT = Simulation.DT; this.acc += Math.min(elapsed, 0.1);
    const n = Math.floor(this.acc / DT); if (n < 1) return false; this.acc -= n * DT;
    if (!this.circuit.reactive) { this.t += n * DT; this.refresh(); this.sample(); return true; }
    // a change of step is a jump like any other: the past values are no longer a step apart
    const cuts = this.pace(); if (cuts !== this.cuts) { this.cuts = cuts; this.since = 0; }
    // (the wire currents -- what the ammeters and the dots show -- are only worked out where they are read)
    const read = Scope.on || this.circuit.ofType(Meter).length > 0;
    for (let i = 1; i <= n; i++) { const t0 = this.t;
      for (let j = 1; j <= cuts; j++) { this.t = j === cuts ? t0 + DT : t0 + j * DT / cuts; const o = { flows: j === cuts && (read || i === n) }; this.sol = this.since < Simulation.RESTART ? this.start(o) : Solver.step(this.circuit, this.env(), o); this.since++; }
      if (read) this.sample(); }
    return true; }
  // One step straight after a jump. There is no history to lean on, so it has to be first order -- and a single
  // first-order step is the least accurate thing the clock ever does (its error, dt^2 y'' / 2, was most of the
  // error in a whole step response). So it is taken as START short steps: the same formula, the same stability
  // -- a first-order step cannot overshoot, whatever it is given -- and a START-th of the error. The parts are
  // then told that what lies behind them is one whole step, not one short one.
  start(opts) { const env = this.env(), m = Simulation.START, parts = this.circuit.elements.filter((e) => e.reactive), was = parts.map((e) => e.liveState()); let sol;
    for (let k = 1; k <= m; k++) sol = Solver.step(this.circuit, { mode: env.mode, dt: env.dt / m, t: k === m ? env.t : env.t - (m - k) * env.dt / m, first: true }, k === m ? opts : { flows: false });
    parts.forEach((e, i) => e.stepFrom(was[i])); return sol; }
  // back to t = 0 with every capacitor empty, every inductor dead and every trace cleared
  reset() { this.circuit.resetState(); this.scope.reset(); this.t = 0; this.origin = 0; this.acc = 0; this.since = 0; this.cuts = this.pace(); this.resting = new Set(); this.rest(); this.strike(); this.refresh(); this.faced = this.timed; this.sample(); }
  // An AC source that is not part of any loop is not running: it rests at 0 V, and its sine starts from zero at
  // the instant its loop is closed. (A loop that is only waiting for its switch is a loop: the source runs on behind it.)
  // (`resting` remembers which were at rest when last looked at: an undo puts back the part as it was, flag and all)
  rest() { const was = this.resting, now = new Set(); for (const s of this.circuit.ofType(AcSource)) { s.idle = !this.circuit.looped(s); if (s.idle) now.add(s.id); else if (was.has(s.id)) s.anchor(this.t, 0); } this.resting = now;
    // ...and an ammeter with a lead joined to nothing is not in the circuit: it has nothing to record (see sample)
    this.unplugged = new Set(this.circuit.ofType(Ammeter).filter((m) => !this.circuit.wired(m)).map((m) => m.id)); }
  // call this instant zero on the clock face
  mark() { this.origin = this.t; }
}

// =====================================================================
// Workbench -- everything the user is working on: the circuit, its undo
// history, the clock, the view, what is selected and where the probe is.
// Every user-level operation lives here, so the pointer gestures, the
// keyboard and the side panel all go through the same few methods.
// =====================================================================
class Workbench {
  static NC = 64; static NR = 44;
  static SETTERS = { value: 'setValue', ri: 'setRi', freq: 'setFreq' };
  constructor() { this.circuit = new Circuit(Workbench.NC, Workbench.NR); this.history = new History(); this.view = new View(View.boardOf(Workbench.NC, Workbench.NR)); this.sim = new Simulation(this.circuit);
    this.selId = null; this.probe = null; this.notice = null; this.flash = null; this.turn = null; this.typing = null; }
  get sol() { return this.sim.sol; }
  get selected() { return this.selId == null ? null : this.circuit.byId(this.selId); }
  select(el) { this.endTyping(); this.selId = el ? el.id : null; }

  // ---- talking back ----
  say(text, bad, about) { this.notice = { text, bad: !!bad, about: about || null, at: Date.now() }; }
  refuse(verb, why) { this.say('Can’t ' + verb + (why ? ' — ' + why : ''), true); }
  // take down a complaint once the thing complained about has been put right
  hush(about) { const n = this.notice; if (n && (about ? n.about === about : n.bad)) { this.notice = null; this.flash = null; } }
  flashPath(pts) { const segs = []; for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]); this.flash = { segs, at: Date.now() }; }

  // ---- edits ----
  // Run one edit on the circuit. It goes into the undo history only if it took.
  // `tag` lets a run of like edits count as one undo step (see History.record).
  edit(fn, tag) { this.endTyping(); const before = this.circuit.snapshot(), r = fn(this.circuit) || { ok: true };
    if (r.ok) { this.hush(); this.history.record(before, false, tag); this.settle(); this.keepInView(); } return r; }
  // after any change to the circuit: drop what no longer exists, solve again
  settle() { if (this.selId != null && !this.circuit.byId(this.selId)) this.selId = null; if (this.probe && !this.circuit.anchor(this.probe)) this.probe = null; this.jolt(); }
  // let the circuit react to a sudden change, and say so if an inductor's current was cut off
  jolt() { const cut = this.sim.jolt(); if (cut.length) this.say('The inductor’s current was cut off at once — in a real circuit that makes a spark'); else this.tellJump(); }
  // a capacitor whose voltage has just changed at once: say so, and why (see Simulation.strike)
  tellJump() { const J = this.sim.jumped || []; if (!J.length) return;
    const verb = (j) => Math.abs(j.to) > Math.abs(j.from) ? 'charged' : Math.abs(j.to) < 0.01 * Math.abs(j.from) ? 'discharged' : 'partly discharged';
    const names = J.map((j) => this.circuit.nameOf(j.el)), list = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0], verbs = [...new Set(J.map(verb))];
    this.say(J.length === 1 ? list + ' ' + verbs[0] + ' at once — no resistance in its loop to limit the current'
      : verbs.length === 1 ? list + ' ' + verbs[0] + ' at once — no resistance in the loop to limit the current'
      : list + ' shared their charge at once — no resistance between them to limit the current'); }
  // back to t = 0 (the "t=0" button)
  restart() { this.sim.reset(); this.tellJump(); }
  // the same, for an edit to the selected part
  // (a refusal names the part: "Can’t rotate S₁ — R₁ is in the way")
  act(verb, fn, tag) { const el = this.selected; if (!el) return null; const r = this.edit((c) => fn(c, el), tag); if (!r.ok) this.refuse(verb.replace(/\bit\b/, this.circuit.nameIn(el)), r.why); else if (r.el) this.selId = r.el.id; return r; }
  // `turn` is what the picture needs to show the turn happening (or being refused): see Component.draw
  //
  // A part turned right round, or turned and turned back, must be the circuit as it was -- not the same circuit
  // wired by another route (which is what laying the leads afresh at every turn gives), and not the part left
  // the other way round because one of the turns had no room and went end for end under the wires. So through
  // an unbroken run of turns of one part (`spin`) the wiring is remembered for each way the part has lain, and
  // a turn that brings the part back to one of them puts that wiring back. Any other change to the layout ends
  // the run. `par` counts the times the part has been turned end for end under its wires: where the wiring put
  // back is that of the part the other way round, this turn has reversed it (or put it right again) and says so.
  rotate(dir) { const el = this.selected; if (!el) return null; const c = this.circuit, pivot = el.pivot(); this.hush('turn');   // (what the last turn did is no longer news)
    let spin = this.spin; if (!spin || spin.circuit !== c || spin.id !== el.id || spin.now !== Workbench.drawn(c)) { spin = { circuit: c, id: el.id, par: 0, seen: new Map() }; Workbench.note(spin, c, el); }
    const r = this.act('rotate it', (cc, x) => { const res = cc.rotate(x, dir); if (!res.ok) return res; if (res.swapped) spin.par ^= 1;
      const m = spin.seen.get(Workbench.lies(x)); if (!m) return res;
      cc.autoEdges = new Set(m.auto); cc.setWireEdges(new Set(m.edges));
      if (m.par !== spin.par) { x.turnEndForEnd(); spin.par = m.par; if (x.flipChoices().length) res.reversed = !res.reversed; }
      return res; });
    if (r.ok) { Workbench.note(spin, c, el); spin.now = Workbench.drawn(c); this.spin = spin; }
    this.turn = { id: el.id, pivot, dir, ok: r.ok, at: Date.now() };
    if (r.ok && r.reversed) this.say('The ' + el.info.name.replace(/\b[A-Z](?=[a-z])/g, (ch) => ch.toLowerCase()) + ' is now connected the other way round (F flips it back)', false, 'turn');
    return r; }
  static lies(el) { return el.terminals().map((t) => P.key(t.p)).join('-'); }
  static drawn(c) { return [...c.wireEdges()].sort().join(' ') + '/' + c.parts.map((e) => e.id + ':' + Workbench.lies(e)).join(' '); }
  static note(spin, c, el) { const key = Workbench.lies(el); if (!spin.seen.has(key)) spin.seen.set(key, { edges: [...c.wireEdges()], auto: [...c.autoEdges], par: spin.par }); }
  flip() { return this.act('flip it', (c, el) => c.flip(el)); }
  nudge(dc, dr) { return this.act('move it there', (c, el) => c.move(el, dc, dr), 'nudge' + this.selId); }
  remove() { const r = this.act('delete it', (c, el) => c.remove(el)); this.selId = null; return r; }
  drawWire(pts) { const r = this.edit((c) => c.addWire(pts)); if (!r.ok) { this.refuse('draw that wire', r.why); this.flashPath(pts); } return r; }
  tidyWires() { const r = this.edit((c) => ({ ok: c.tidyWires() })); this.say(r.ok ? 'Wires tidied' : 'The wires are already tidy'); }
  tidyLayout() { const r = this.edit((c) => ({ ok: c.tidyLayout() })); this.say(r.ok ? 'Circuit tidied' : 'Nothing to tidy'); }

  // put a new part on the bench, as near the middle of what is on screen as it fits
  add(type) { const I = ELEMENTS[type].info, v = this.view.visibleGrid(), h = (I.span || 4) / 2;
    const box = { c0: Math.max(0, v.c0 + 1), c1: Math.min(this.circuit.NC, v.c1 - 1), r0: Math.max(0, v.r0 + 1), r1: Math.min(this.circuit.NR, v.r1 - 1) };
    const make = I.isThrow ? (c, r) => ThrowSwitch.at({ c: c - 1, r }, 1)
      : I.vertical ? (c, r) => Element.create(type, { c, r: r - Math.floor(h) }, { c, r: r + Math.ceil(h) })
      : (c, r) => Element.create(type, { c: c - Math.floor(h), r }, { c: c + Math.ceil(h), r });
    // A roomy spot on screen first; failing that, while the view is automatic, a roomy spot just
    // off it (the view zooms out to take it in) rather than a cramped one where labels collide.
    const c0 = Math.round((box.c0 + box.c1) / 2), r0 = Math.round((box.r0 + box.r1) / 2), C = this.circuit;
    // (and never on a label: a part's name and value stand a square or more out from it, where the grid alone looks free)
    const ls = this.view.labelScale, labels = [...Renderer.layout(null, { circuit: C, names: C.labels(), sol: this.sol, hide: false, revealed: () => true, view: this.view }).values()];
    const clear = (el) => { const o = PAINTERS[el.type].box(el), m = 4 * ls; return !labels.some((l) => o.x0 - m < l.x1 && o.x1 + m > l.x0 && o.y0 - m < l.y1 && o.y1 + m > l.y0); };
    const el = C.findSlot(make, c0, r0, box, Circuit.ROOMY, clear) || (this.view.auto && C.findSlot(make, c0, r0, null, Circuit.ROOMY, clear)) || C.findSlot(make, c0, r0, box, null, clear);
    if (!el) { this.say('No room for another part — clear some space first', true); return null; }
    const r = this.edit((c) => c.insert(el)); if (!r.ok) { this.refuse('place it', r.why); return null; }
    this.selId = (r.el || el).id; this.probe = null; return r.el || el; }

  // ---- typed values ----
  // While a number is being typed the part follows along; the whole visit to the
  // box becomes one undo step when it ends.
  type(field, v) { const el = this.selected; if (!el || !isFinite(v) || typeof el[Workbench.SETTERS[field]] !== 'function') return false;   // (a part with no such setting: nothing to type)
    if (!this.typing) this.typing = { id: el.id, before: this.circuit.snapshot() };
    const ok = el[Workbench.SETTERS[field]](v); if (!ok) return false;
    const L = el.limits(field);
    if (L && el[field] !== v) { const say = L.say || ((x) => x + ' ' + L.unit); this.say(L.label + ' is kept between ' + say(L.min) + ' and ' + say(L.max), false, 'limits'); } else this.hush('limits');
    this.sim.jolt(); return true; }
  endTyping(cancel) { const t = this.typing; if (!t) return; this.typing = null; const el = this.circuit.byId(t.id), was = t.before.els.find((e) => e.id === t.id); if (!el || !was) return;
    const keys = Object.keys(Workbench.SETTERS), same = keys.every((k) => el[k] === was[k]); if (same) return;
    if (cancel) { for (const k of keys) if (was[k] !== undefined) el[k] = was[k]; this.sim.jolt(); } else this.history.record(t.before); }

  // ---- things that are state, not layout (never in the undo history) ----
  // throw a switch; `position` picks a throw of a 2-position switch
  toggle(el, position) { if (!el || typeof el.toggle !== 'function' || (position && el.position === position)) return; el.toggle(); this.sim.mark(); this.jolt(); }
  toggleGraph(meter) { meter.graph = !meter.graph; this.sim.face(); this.sim.sample(); }
  // what the graph is plotting just now
  traces() { return this.sim.traces(this.selId); }
  // the Probe variant: what the selected part's trace shows, and whether it stays on the graph afterwards
  plot(mode) { const el = this.selected; if (el) this.sim.scope.setMode(el, mode); }
  keepTrace() { const el = this.selected; if (el && Scope.takes(el)) this.sim.scope.keep(el, !this.sim.scope.of(el).kept); }
  probeAt(p) { this.probe = p && this.circuit.anchor(p) ? { c: p.c, r: p.r } : null; }
  get probeV() { const a = this.probe && this.sol ? this.circuit.anchor(this.probe) : null; return a ? this.sol.potential(a) : NaN; }

  // ---- whole circuits ----
  // swap in another circuit; undo brings the old one back
  replace(other) { this.endTyping(); const before = this.circuit.snapshot(); this.circuit.NC = Math.max(this.circuit.NC, other.NC); this.circuit.NR = Math.max(this.circuit.NR, other.NR);
    this.circuit.restore(other.snapshot()); this.history.record(before, true); this.fresh(); }
  loadPreset(name) { this.replace(PRESETS.build(name, Workbench.NC, Workbench.NR)); }
  // a different circuit is on the bench: nothing selected, clock at zero, brought into view
  fresh() { this.selId = null; this.probe = null; this.sim.scope.clear(); this.sim.reset(); this.tellJump(); this.fit(); }
  static GROW = 1.1;
  // While the view is still the sim's own choice (the user has not zoomed or
  // panned), an edit that pushes a part or its label off the canvas re-fits it.
  keepInView() { if (!this.view.auto) return false; const box = Renderer.fitBox(this.circuit, this.view.labelScale); if (!box) return false;
    const V = this.view, a = V.toWorld(0, 0), z = V.toWorld(V.w, V.h); if (!(box.x0 >= a.x && box.y0 >= a.y && box.x1 <= z.x && box.y1 <= z.y && !this.covered())) { this.fit(); return true; }
    // ...and one that leaves the circuit a good deal smaller than the canvas could show it (a part brought back in
    // from far out) lets the view grow again. A small gain is not worth moving the picture under the user's hand.
    const was = { scale: V.scale, ox: V.ox, oy: V.oy }; this.fit(); if (V.scale > was.scale * Workbench.GROW) return true; Object.assign(V, was); return false; }
  // Fit the circuit to the canvas -- and, if that leaves something under the zoom control in
  // the corner, fit it again into the canvas above the control, or into the canvas beside it when that
  // shows the circuit larger (it does on the wide strip left above a docked graph, where height is what limits).
  fit() { const V = this.view, go = (lift, side) => { V.fit(Renderer.fitBox(this.circuit, 1), lift, side); for (let i = 0, ls = 1; i < 3 && Math.abs(V.labelScale - ls) > 0.01; i++) { ls = V.labelScale; V.fit(Renderer.fitBox(this.circuit, ls), lift, side); } };
    go(0, 0); if (!this.covered()) return;
    go(View.CORNER.h, 0); const above = { scale: V.scale, ox: V.ox, oy: V.oy };
    go(0, View.CORNER.w); if (this.covered() || V.scale < above.scale * 1.02) Object.assign(V, above); }
  covered() { const V = this.view, a = V.toWorld(V.w - View.CORNER.w, V.h - View.CORNER.h); return Renderer.boxes(this.circuit, V.labelScale).some((o) => o.x1 > a.x && o.y1 > a.y); }
  undo() { this.endTyping(); this.stepHistory(this.history.undo(this.circuit), 'undo'); }
  redo() { this.endTyping(); this.stepHistory(this.history.redo(this.circuit), 'redo'); }
  // (a notice about the edit being taken back -- "Circuit tidied" -- must not outlive it)
  stepHistory(kind, word) { if (!kind) return this.say('Nothing to ' + word); this.notice = null; if (kind === 'whole') this.fresh(); else { this.settle(); this.keepInView(); } }
}
