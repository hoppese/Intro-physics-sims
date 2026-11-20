// =====================================================================
// Sim -- the state of the page: which activity, its settings, the clock, and
// what is drawn. Four activities:
//   match    match a graph: drive the cart so its x–t or v–t graph follows a target
//            (task 'drive'), or watch a motion and sketch its graph (task 'sketch')
//   cars     two cars on one road, each with its own x0, v0x and ax: when and where they meet
//   program  build the a–t graph piece by piece; v–t and x–t follow
//   diagram  a motion diagram and the signs of v_x and a_x (speeding up, slowing down, turning round)
// bodies() gives what moves, each with at(t) -> { x, v, a }. The clock runs from 0 to T and stops; a
// change of setting puts it back to zero. Loads paused.
// =====================================================================
class Sim {
  static ACTIVITIES = [['match', 'Match the graph', '≈'], ['cars', 'Two cars, one road', '⇄'], ['program', 'Program the motion', '▤'], ['diagram', 'Motion diagram', '⋯']];
  static SPEEDS = [0.25, 0.5, 1];
  static COL = { A: '#e2685f', B: '#5aa8f0', one: '#9fe6b8', target: '#f0c860', sketch: '#c9a3ff' };
  static CARS = [
    { key: 'chase', name: 'Police chase', note: 'A police car (A) starts from rest just as a speeder (B) passes 30 m ahead of it.', A: { x0: 0, v0: 0, a: 2.5 }, B: { x0: 30, v0: 20, a: 0 }, time: 20 },
    { key: 'toward', name: 'Toward each other', note: 'Two cars 300 m apart drive toward each other at steady speeds. B’s velocity is negative: it moves toward −x.', A: { x0: 0, v0: 15, a: 0 }, B: { x0: 300, v0: -10, a: 0 }, time: 16 },
    { key: 'bus', name: 'Catch the bus (twice)', note: 'A runner (A) at 6 m/s is 20 m behind a bus (B) that pulls away from rest. The runner passes the bus, then the bus passes the runner.', A: { x0: 0, v0: 6, a: 0 }, B: { x0: 20, v0: 0, a: 0.5 }, time: 25 },
    { key: 'miss', name: 'Just miss the bus', note: 'Slower runner, quicker bus: the runner closes the gap for a while, but never reaches the bus.', A: { x0: 0, v0: 5, a: 0 }, B: { x0: 20, v0: 0, a: 1 }, time: 15 },
  ];
  static CASES = [
    { key: 'steady', name: 'Steady', x0: 1, v0: 1.6, a: 0 },
    { key: 'up-right', name: 'Speeding up toward +x', x0: 0.5, v0: 0.4, a: 0.9 },
    { key: 'down-right', name: 'Slowing down toward +x', x0: 0.5, v0: 3.6, a: -0.7 },
    { key: 'up-left', name: 'Speeding up toward −x', x0: 13, v0: -0.4, a: -0.9 },
    { key: 'down-left', name: 'Slowing down toward −x', x0: 12, v0: -3.6, a: 0.7 },
    { key: 'turn', name: 'Turning round', x0: 1, v0: 3.2, a: -1.6 },
  ];
  static PROGRAM = [{ a: 2, d: 4 }, { a: 0, d: 5 }, { a: -2.5, d: 3.2 }];
  static VPROGRAM = [{ v: 3, d: 4 }, { v: 0, d: 2.5 }, { v: -1.5, d: 4 }];      // built from velocity pieces instead
  static MAXPIECES = 6;
  static N = 201;             // samples across a sketch
  // the settings each activity shows, as { key, label, tex, unit, min, max, step }
  static SPECS = {
    car: [{ key: 'x0', label: 'Start', tex: 'x_0', unit: 'm', min: -100, max: 400, step: 1 }, { key: 'v0', label: 'Velocity', tex: 'v_{0x}', unit: 'm/s', min: -40, max: 40, step: 0.5 }, { key: 'a', label: 'Acceleration', tex: 'a_x', unit: 'm/s²', min: -5, max: 5, step: 0.1 }],
    time: { key: 'time', label: 'Time shown', tex: 't_{\\text{end}}', unit: 's', min: 5, max: 60, step: 1 },
    prog: [{ key: 'x0', label: 'Start', tex: 'x_0', unit: 'm', min: -50, max: 50, step: 1 }, { key: 'v0', label: 'Velocity', tex: 'v_{0x}', unit: 'm/s', min: -20, max: 20, step: 0.5 }],
    piece: [{ key: 'a', tex: 'a_x', unit: 'm/s²', min: -5, max: 5, step: 0.1 }, { key: 'd', tex: '\\Delta t', unit: 's', min: 0.5, max: 20, step: 0.1 }],
    vpiece: [{ key: 'v', tex: 'v_x', unit: 'm/s', min: -20, max: 20, step: 0.5 }, { key: 'd', tex: '\\Delta t', unit: 's', min: 0.5, max: 20, step: 0.1 }],
    diag: [{ key: 'x0', label: 'Start', tex: 'x_0', unit: 'm', min: -20, max: 20, step: 0.5 }, { key: 'v0', label: 'Velocity', tex: 'v_{0x}', unit: 'm/s', min: -10, max: 10, step: 0.1 }, { key: 'a', label: 'Acceleration', tex: 'a_x', unit: 'm/s²', min: -5, max: 5, step: 0.1 }],
  };

  constructor() { this.mode = 'match'; this.task = 'drive'; this.targetKey = TARGETS[0].key; this.sketchOf = 'v'; this.carsKey = 'chase'; this.caseKey = 'turn';
    this.cars = null; this.useCars(Sim.CARS[0]); this.prog = { build: 'a', x0: 0, v0: 0, pieces: Sim.PROGRAM.map((p) => ({ ...p })), vpieces: Sim.VPROGRAM.map((p) => ({ ...p })) }; this.diag = null; this.useCase(Sim.CASES.find((c) => c.key === 'turn'));
    this.playing = false; this.speed = 1; this.show = { hints: false, dots: false, arrows: true, nums: true }; this.driver = new Driver(1); this.rev = 0; this.dirty = true; this.reset(); }
  bump() { this.rev++; this.dirty = true; }
  static fix(spec, v) { if (v === '' || v == null) return null; v = Number(v); if (!isFinite(v)) return null; return Math.round(clamp(v, spec.min, spec.max) * 1e6) / 1e6 || 0; }

  // ---- what is chosen ----
  get target() { return target(this.targetKey); }
  choose(k) { if (!Sim.ACTIVITIES.some((a) => a[0] === k)) return false; this.mode = k; this.show.dots = k === 'diagram'; this.reset(); return true; }
  setTask(k) { if (k !== 'drive' && k !== 'sketch') return false; this.task = k; this.reset(); return true; }
  setTarget(k) { if (!target(k)) return false; this.targetKey = k; if (this.task === 'drive') this.sketchOf = this.target.kind === 'x' ? 'v' : 'x'; this.reset(); return true; }
  setSketchOf(k) { if (k !== 'x' && k !== 'v') return false; this.sketchOf = k; this.reset(); return true; }
  useCars(P) { this.carsKey = P.key || null; this.cars = { A: { ...P.A }, B: { ...P.B }, time: P.time }; }
  setCars(k) { const P = Sim.CARS.find((c) => c.key === k); if (!P) return false; this.useCars(P); this.reset(); return true; }
  setCar(which, key, v) { const s = Sim.SPECS.car.find((q) => q.key === key), c = this.cars[which]; if (!s || !c) return false; v = Sim.fix(s, v); if (v == null) return false; c[key] = v; this.carsKey = null; this.reset(); return true; }
  setTime(v) { v = Sim.fix(Sim.SPECS.time, v); if (v == null) return false; this.cars.time = v; this.reset(); return true; }
  setProg(key, v) { const s = Sim.SPECS.prog.find((q) => q.key === key); if (!s) return false; v = Sim.fix(s, v); if (v == null) return false; this.prog[key] = v; this.reset(); return true; }
  // a program is built from acceleration pieces (aₓ for Δt) or velocity pieces (vₓ for Δt); each kind keeps its own list
  get byVel() { return this.prog.build === 'v'; }
  get pieces() { return this.byVel ? this.prog.vpieces : this.prog.pieces; }
  get pieceSpecs() { return this.byVel ? Sim.SPECS.vpiece : Sim.SPECS.piece; }
  setBuild(k) { if (k !== 'a' && k !== 'v') return false; this.prog.build = k; this.reset(); return true; }
  setPiece(i, key, v) { const s = this.pieceSpecs.find((q) => q.key === key), p = this.pieces[i]; if (!s || !p) return false; v = Sim.fix(s, v); if (v == null) return false; p[key] = v; this.reset(); return true; }
  addPiece() { if (this.pieces.length >= Sim.MAXPIECES) return false; this.pieces.push(this.byVel ? { v: 0, d: 2 } : { a: 0, d: 2 }); this.reset(); return true; }
  removePiece(i) { if (this.pieces.length <= 1 || !this.pieces[i]) return false; this.pieces.splice(i, 1); this.reset(); return true; }
  useCase(C) { this.caseKey = C.key || null; this.diag = { x0: C.x0, v0: C.v0, a: C.a }; }
  setCase(k) { const C = Sim.CASES.find((c) => c.key === k); if (!C) return false; this.useCase(C); this.reset(); return true; }
  setDiag(key, v) { const s = Sim.SPECS.diag.find((q) => q.key === key); if (!s) return false; v = Sim.fix(s, v); if (v == null) return false; this.diag[key] = v; this.caseKey = null; this.reset(); return true; }

  // ---- what moves ----
  get driving() { return this.mode === 'match' && this.task === 'drive'; }
  get sketching() { return this.mode === 'match' && this.task === 'sketch'; }
  get T() { return this.mode === 'match' ? this.target.T : this.mode === 'cars' ? this.cars.time : this.mode === 'program' ? this.motion().T : 5; }
  // one Motion per body (not for a driven cart, which has no formula)
  motion(which) { if (this.mode === 'cars') return Car.motion(this.cars[which || 'A'], this.cars.time);
    if (this.mode === 'program') return this.byVel ? new Motion(this.prog.x0, this.prog.vpieces[0].v, this.prog.vpieces.map((p) => ({ a: 0, d: p.d, v: p.v }))) : new Motion(this.prog.x0, this.prog.v0, this.prog.pieces);
    if (this.mode === 'diagram') return new Motion(this.diag.x0, this.diag.v0, [{ a: this.diag.a, d: 5 }]);
    return this.target.motion; }
  bodies() { const C = Sim.COL;
    if (this.mode === 'cars') return ['A', 'B'].map((k) => { const m = this.motion(k); return { key: k, name: k, col: C[k], at: (t) => m.at(t), motion: m }; });
    if (this.driving) return [{ key: 'cart', name: 'cart', col: C.one, at: (t) => this.recAt(t) }];
    const m = this.motion(); return [{ key: this.mode === 'match' ? 'cart' : 'car', name: '', col: C.one, at: (t) => m.at(t), motion: m }]; }

  // ---- the clock ----
  reset() { this.playing = false; this.t = 0; this.reached = 0; this.rec = []; this.result = null; this.sketch = new Float64Array(Sim.N).fill(NaN); this.checked = false; this.lastPen = null;
    if (this.driving) this.driver.place(this.target.motion.at(0).x); this.bump(); }
  play() { if (this.t >= this.T - 1e-9) { if (this.driving) this.reset(); else this.t = 0; }
    // (driving on from a moment scrubbed back to: the rest of that run is dropped, and the cart carries on from there)
    if (this.driving && this.rec.length && this.t < this.recEnd - 1e-9) { const s = this.recAt(this.t), d = this.driver; this.rec = this.rec.filter((r) => r.t <= this.t + 1e-9); d.x = s.x; d.v = s.v; d.a = s.a; d.cmd = s.v; d.drag = null; this.result = null; }
    this.playing = true; this.bump(); }
  pause() { if (!this.playing) return; this.playing = false; this.bump(); }
  toggle() { if (this.playing) this.pause(); else this.play(); }
  step() { this.playing = false; if (this.driving) { this.advanceDrive(1 / 30); } else { this.t = Math.min(this.T, this.t + 1 / 30); this.reached = Math.max(this.reached, this.t); } this.bump(); }
  tick(dt) { if (!this.playing) return false; dt = Math.min(dt, 0.1) * this.speed;
    if (this.driving) this.advanceDrive(dt); else { this.t = Math.min(this.T, this.t + dt); this.reached = Math.max(this.reached, this.t); }
    if (this.t >= this.T - 1e-9) { this.t = this.T; this.playing = false; this.finish(); }
    this.dirty = true; return true; }
  advanceDrive(dt) { const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n, d = this.driver;
    if (!this.rec.length) this.rec.push({ t: 0, x: d.x, v: d.v, a: d.a });
    for (let i = 0; i < n && this.t < this.T - 1e-9; i++) { d.step(h); this.t = Math.min(this.T, this.t + h); if (this.t - this.rec[this.rec.length - 1].t >= 1 / 60 - 1e-9 || this.t >= this.T - 1e-9) this.rec.push({ t: this.t, x: d.x, v: d.v, a: d.a }); }
    this.reached = this.t; if (this.t >= this.T - 1e-9) this.finish(); }
  finish() { if (this.driving && !this.result) this.result = this.driveScore(); }
  get recEnd() { return this.rec.length ? this.rec[this.rec.length - 1].t : 0; }
  // the driven cart at time t: from the recording (or where it stands, before a run)
  recAt(t) { const R = this.rec, d = this.driver; if (!R.length) return { x: d.x, v: d.v, a: d.a }; if (t >= R[R.length - 1].t) { const r = R[R.length - 1]; return { x: r.x, v: r.v, a: r.a }; }
    let lo = 0, hi = R.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (R[m].t <= t) lo = m; else hi = m; } const a = R[lo], b = R[hi], k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
    return { x: a.x + (b.x - a.x) * k, v: a.v + (b.v - a.v) * k, a: a.a + (b.a - a.a) * k }; }
  // move the clock to t (dragging along the graphs): anywhere already played
  seek(t) { this.playing = false; this.t = clamp(t, 0, this.driving ? this.recEnd : this.T); this.reached = Math.max(this.reached, this.t); this.bump(); }
  get canSeek() { return this.driving ? this.rec.length > 1 && !this.playing : true; }

  // ---- the driven cart ----
  driveScore() { const k = this.target.kind; return score(this.rec.map((r) => ({ t: r.t, val: r[k] })), this.target, k); }
  get liveScore() { return this.rec.length > 10 ? this.driveScore() : null; }
  throttle(v) { if (!this.driving) return; const d = this.driver; d.drag = null; d.cmd = clamp(Number(v) || 0, -Driver.VMAX, Driver.VMAX); d.v = d.cmd; this.bump(); }
  stopCart() { if (!this.driving) return; this.driver.cmd = 0; this.driver.keys = 0; this.bump(); }
  // a drag before the run sets where the cart starts; during the run it is the motion
  dragTo(x) { if (!this.driving) return; const d = this.driver; if (!this.playing) { if (this.rec.length) return; d.place(x); this.bump(); return; } d.drag = x; }
  release() { const d = this.driver; if (d.drag == null) return; d.drag = null; d.cmd = 0; d.v = 0; }

  // ---- the sketch: a value at each of N moments across the run, drawn with the pointer ----
  sketchIndex(t) { return Math.round(clamp(t / this.T, 0, 1) * (Sim.N - 1)); }
  pen(t, val, down) { if (!this.sketching || this.checked) return; const i = this.sketchIndex(t), last = down ? null : this.lastPen;
    if (last) { const [i0, v0] = last, n = Math.abs(i - i0); for (let k = 0; k <= n; k++) { const j = i0 + Math.sign(i - i0) * k; this.sketch[j] = n ? v0 + (val - v0) * k / n : val; } } else this.sketch[i] = val;
    this.lastPen = [i, val]; this.dirty = true; }
  penUp() { this.lastPen = null; }
  clearSketch() { this.sketch.fill(NaN); this.checked = false; this.result = null; this.bump(); }
  get sketchSamples() { const out = []; for (let i = 0; i < Sim.N; i++) if (isFinite(this.sketch[i])) out.push({ t: i / (Sim.N - 1) * this.T, val: this.sketch[i] }); return out; }
  get sketchCoverage() { let n = 0; for (const v of this.sketch) if (isFinite(v)) n++; return n / Sim.N; }
  check() { if (!this.sketching) return false; if (this.sketchCoverage < 0.8) { this.result = { short: true }; this.bump(); return false; }
    this.checked = true; this.result = score(this.sketchSamples, this.target, this.sketchOf); this.t = this.T; this.reached = this.T; this.playing = false; this.bump(); return true; }

  // ---- two cars ----
  get meeting() { return this.mode === 'cars' ? meet(this.cars.A, this.cars.B, this.cars.time) : null; }
  // a moment where the velocity is zero but the acceleration is not (inside the run)
  get turn() { if (this.mode === 'cars' || this.driving) return null; const m = this.motion(); for (const k of m.knots) { if (Math.abs(k.a) < 1e-9) continue; const s = -k.v / k.a; if (s > 1e-6 && s < k.d - 1e-6) { const t = k.t + s; if (t < this.T) return { t, x: m.at(t).x, a: k.a }; } } return null; }

  // ---- what is drawn ----
  toggleShow(k) { if (!(k in this.show)) return; this.show[k] = !this.show[k]; this.bump(); }
  // graphs whose curves are hidden: while sketching, every real curve until the sketch is checked
  get veiled() { return this.sketching && !this.checked; }

  snapshot() { const r = (x) => Math.round(x * 1000) / 1000, B = this.bodies();
    return { activity: this.mode, task: this.mode === 'match' ? this.task : '', target: this.mode === 'match' ? this.targetKey : '', t: r(this.t),
      bodies: this.veiled ? [] : B.map((b) => { const s = b.at(this.t); return { name: b.key, x: r(s.x), vx: r(s.v), ax: r(s.a) }; }), score: this.result && isFinite(this.result.pct) ? this.result.pct : null }; }
}
