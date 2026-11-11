// =====================================================================
// Simulation -- the clock. Steps the circuit through time, keeps the latest
// Solution, and feeds the meters that are being graphed.
//
// `t` only ever runs forward (it is the AC phase and the time stamp on every
// graph sample). What the clock face shows is t - origin: throwing a switch
// calls that instant zero without resetting anything.
//
// Integration. Capacitors and inductors step with a second-order formula
// (BDF2), which needs two past values. Whenever something jumps -- a switch
// is thrown, the circuit is edited, the clock is reset -- the history is no
// longer smooth, so the next Simulation.RESTART steps are first order.
// =====================================================================
class Simulation {
  static DT = 0.002;
  static NOW = 1e-7;                  // a step so short it is "this instant"
  static RESTART = 2;
  constructor(circuit) { this.circuit = circuit; this.t = 0; this.origin = 0; this.acc = 0; this.sol = null; this.playing = true; this.cold = Simulation.RESTART; }
  get graphing() { return this.circuit.ofType(Meter).some((m) => m.graph); }
  // is there anything here that changes with time?
  get timed() { return this.circuit.reactive || this.graphing; }
  get running() { return this.playing && this.timed; }
  get shown() { return this.t - this.origin; }
  get mode() { return this.circuit.reactive ? 'tran' : 'dc'; }
  // the environment for one full time step, and for looking at this very instant
  env() { return { mode: this.mode, dt: Simulation.DT, t: this.t, first: this.cold > 0 }; }
  envNow() { return { mode: this.mode, dt: Simulation.NOW, t: this.t, first: true }; }
  // Solve the present instant again without moving time on (while dragging, or
  // paused): capacitors hold their voltage and inductors their current.
  refresh() { this.sol = Solver.solve(this.circuit, this.envNow()); return this.sol; }
  // The circuit has just changed under the clock (edit, switch, typed value).
  // Whatever must change instantly does -- an inductor whose path was cut loses
  // its current, capacitors joined by bare wire share their charge -- and the
  // integrator restarts. Returns the inductors whose current was cut off.
  jolt() { const cut = [];
    if (this.circuit.reactive) { const was = new Map(this.circuit.ofType(Inductor).map((l) => [l, l.il]));
      Solver.step(this.circuit, this.envNow(), { flows: false });
      for (const [l, i0] of was) if (Math.abs(i0) > 1e-4 && Math.abs(l.il) < 0.5 * Math.abs(i0)) cut.push(l); }
    this.cold = Simulation.RESTART; this.refresh(); this.sample(); return cut; }
  // give every graphed meter its reading at this instant
  sample() { for (const m of this.circuit.ofType(Meter)) m.record(this.t, m.number(this.sol)); }
  // run for `elapsed` seconds of wall time; true if time moved
  advance(elapsed) { if (!this.running || !(elapsed > 0)) return false; const DT = Simulation.DT; this.acc += Math.min(elapsed, 0.1);
    const n = Math.floor(this.acc / DT); if (n < 1) return false; this.acc -= n * DT;
    if (this.circuit.reactive) for (let i = 1; i <= n; i++) { this.t += DT; this.sol = Solver.step(this.circuit, this.env(), { flows: i === n }); if (this.cold > 0) this.cold--; }
    else { this.t += n * DT; this.refresh(); }
    this.sample(); return true; }
  // back to t = 0 with every capacitor empty, every inductor dead and every trace cleared
  reset() { this.circuit.resetState(); this.t = 0; this.origin = 0; this.acc = 0; this.cold = Simulation.RESTART; this.refresh(); this.sample(); }
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
    this.selId = null; this.probe = null; this.notice = null; this.flash = null; this.typing = null; }
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
  jolt() { const cut = this.sim.jolt(); if (cut.length) this.say('The inductor’s current was cut off at once — in a real circuit that makes a spark'); }
  // the same, for an edit to the selected part
  act(verb, fn, tag) { const el = this.selected; if (!el) return null; const r = this.edit((c) => fn(c, el), tag); if (!r.ok) this.refuse(verb, r.why); else if (r.el) this.selId = r.el.id; return r; }
  rotate(dir) { return this.act('rotate it', (c, el) => c.rotate(el, dir)); }
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
    const el = C.findSlot(make, c0, r0, box, Circuit.ROOMY) || (this.view.auto && C.findSlot(make, c0, r0, null, Circuit.ROOMY)) || C.findSlot(make, c0, r0, box);
    if (!el) { this.say('No room for another part — clear some space first', true); return null; }
    const r = this.edit((c) => c.insert(el)); if (!r.ok) { this.refuse('place it', r.why); return null; }
    this.selId = (r.el || el).id; this.probe = null; return r.el || el; }

  // ---- typed values ----
  // While a number is being typed the part follows along; the whole visit to the
  // box becomes one undo step when it ends.
  type(field, v) { const el = this.selected; if (!el || !isFinite(v)) return false;
    if (!this.typing) this.typing = { id: el.id, before: this.circuit.snapshot() };
    const ok = el[Workbench.SETTERS[field]](v); if (!ok) return false;
    const L = el.limits(field);
    if (L && el[field] !== v) this.say(L.label + ' is kept between ' + L.min + ' and ' + L.max + ' ' + L.unit, false, 'limits'); else this.hush('limits');
    this.sim.jolt(); return true; }
  endTyping(cancel) { const t = this.typing; if (!t) return; this.typing = null; const el = this.circuit.byId(t.id), was = t.before.els.find((e) => e.id === t.id); if (!el || !was) return;
    const keys = Object.keys(Workbench.SETTERS), same = keys.every((k) => el[k] === was[k]); if (same) return;
    if (cancel) { for (const k of keys) if (was[k] !== undefined) el[k] = was[k]; this.sim.jolt(); } else this.history.record(t.before); }

  // ---- things that are state, not layout (never in the undo history) ----
  // throw a switch; `position` picks a throw of a 2-position switch
  toggle(el, position) { if (position && el.position === position) return; el.toggle(); this.sim.mark(); this.jolt(); }
  toggleGraph(meter) { meter.graph = !meter.graph; this.sim.sample(); }
  probeAt(p) { this.probe = p && this.circuit.anchor(p) ? { c: p.c, r: p.r } : null; }
  get probeV() { const a = this.probe && this.sol ? this.circuit.anchor(this.probe) : null; return a ? this.sol.potential(a) : NaN; }

  // ---- whole circuits ----
  // swap in another circuit; undo brings the old one back
  replace(other) { this.endTyping(); const before = this.circuit.snapshot(); this.circuit.NC = Math.max(this.circuit.NC, other.NC); this.circuit.NR = Math.max(this.circuit.NR, other.NR);
    this.circuit.restore(other.snapshot()); this.history.record(before, true); this.fresh(); }
  loadPreset(name) { this.replace(PRESETS.build(name, Workbench.NC, Workbench.NR)); }
  // a different circuit is on the bench: nothing selected, clock at zero, brought into view
  fresh() { this.selId = null; this.probe = null; this.sim.reset(); this.fit(); }
  // While the view is still the sim's own choice (the user has not zoomed or
  // panned), an edit that pushes a part or its label off the canvas re-fits it.
  keepInView() { if (!this.view.auto) return false; const box = Renderer.fitBox(this.circuit, this.view.labelScale); if (!box) return false;
    const a = this.view.toWorld(0, 0), z = this.view.toWorld(this.view.w, this.view.h); if (box.x0 >= a.x && box.y0 >= a.y && box.x1 <= z.x && box.y1 <= z.y && !this.covered()) return false; this.fit(); return true; }
  // Fit the circuit to the canvas -- and, if that leaves something under the zoom control in
  // the corner, fit it again into the canvas above the control.
  fit() { const V = this.view, go = (lift) => { V.fit(Renderer.fitBox(this.circuit, 1), lift); for (let i = 0, ls = 1; i < 3 && Math.abs(V.labelScale - ls) > 0.01; i++) { ls = V.labelScale; V.fit(Renderer.fitBox(this.circuit, ls), lift); } };
    go(0); if (this.covered()) go(View.CORNER.h); }
  covered() { const V = this.view, a = V.toWorld(V.w - View.CORNER.w, V.h - View.CORNER.h); return Renderer.boxes(this.circuit, V.labelScale).some((o) => o.x1 > a.x && o.y1 > a.y); }
  undo() { this.endTyping(); this.stepHistory(this.history.undo(this.circuit), 'undo'); }
  redo() { this.endTyping(); this.stepHistory(this.history.redo(this.circuit), 'redo'); }
  // (a notice about the edit being taken back -- "Circuit tidied" -- must not outlive it)
  stepHistory(kind, word) { if (!kind) return this.say('Nothing to ' + word); this.notice = null; if (kind === 'whole') this.fresh(); else { this.settle(); this.keepInView(); } }
}
