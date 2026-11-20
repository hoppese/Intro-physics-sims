// =====================================================================
// Sim -- the state of the page: the track (a ready-made one, or one the
// student has reshaped), where the cart starts and how fast, its mass,
// friction, where U_g is zero, the clock, and what is drawn. Changing the
// track, the start, the mass or friction puts the clock back to zero; moving
// the zero of U_g does not (it changes U_g and E, never K, E_th or the motion).
// Loads paused.
// =====================================================================
class Sim {
  static SPEEDS = [0.25, 0.5, 1];
  static SHOW = [['forces', 'Forces', 'The weight, the normal force and friction, to scale'], ['v', 'Velocity', 'The velocity: along the track, or along the flight'],
    ['eline', 'Energy line', 'The height the cart could reach if all its kinetic energy became potential energy: it turns back where the track meets this line'],
    ['height', 'Height', 'The cart’s height above the zero of potential energy'], ['trail', 'Trail', 'Where it has been in the last few seconds']];
  static P = { m: { key: 'm', label: 'Mass', sym: 'm', unit: 'kg', min: 1, max: 200, step: 1, init: 40 }, v0: { key: 'v0', label: 'Start speed', sym: 'v_0', unit: 'm/s', min: 0, max: 15, step: 0.1, init: 0 },
    r: { key: 'r', label: 'Loop radius', sym: 'r', unit: 'm', min: CircleLoop.RMIN, max: CircleLoop.RMAX, step: 0.1, init: 4 },
    mu: { key: 'mu', label: 'Friction', sym: '\\mu_{\\text{k}}', unit: '', min: 0.02, max: 0.5, step: 0.01, init: 0.12 }, y0: { key: 'y0', label: 'Zero of', sym: 'U_g', unit: 'm', min: -1, max: 20, step: 0.1, init: 0 } };
  static TRAIL = 3;
  static GRAPHS = [['time', 'Energy vs time'], ['x', 'Energy vs position'], ['normal', 'Normal force'], ['off', 'Off']];

  constructor() { this.vals = {}; for (const k of Object.keys(Sim.P)) this.vals[k] = Sim.P[k].init; this.friction = false; this.playing = false; this.speed = 1; this.hidden = false;
    this.show = { forces: true, v: true, eline: true, height: false, trail: true }; this.graph = 'time'; this.rev = 0; this.dirty = true; this.trail = []; this.choose('hill'); }
  bump() { this.rev++; this.dirty = true; }

  // ---- the track ----
  choose(k) { const P = PRESETS[k]; if (!P) return false; this.key = k; this.custom = false; this.vals.v0 = 0; this.rider = P.rider; this.loopMode = k === 'loop' ? 'circle' : null;
    this.track = this.loopMode === 'circle' ? new CircleLoop(this.vals.r) : new Track(P.pts); const s = this.track.atHeight(this.loopMode === 'circle' ? CircleLoop.START : P.start, 0); this.s0 = s == null ? 0 : s; this.rebuild(); return true; }
  get preset() { return PRESETS[this.key]; }
  rebuild() { this.ride = new Ride(this.track, { locked: this.rider === 'car', m: this.vals.m, mu: this.friction ? this.vals.mu : 0, v0: this.vals.v0, s0: this.s0 }); this.playing = false; this.trail = []; this.bump(); }
  // reshaping: the start stays at the same place along the curve
  edit(fn) { const f = this.track.T > 0 ? this.track.uAt(this.s0) / this.track.T : 0, out = fn(this.track); if (out === false || out === -1) return out; this.custom = true; this.s0 = this.track.sAt(f * this.track.T); this.rebuild(); return out; }
  movePoint(i, p) { return this.edit((t) => t.move(i, p)); }
  insertAt(u) { return this.edit((t) => t.insert(u)); }
  removePoint(i) { return this.edit((t) => t.remove(i)); }
  setPoints(pts) { const t = new Track(pts); if (!t.valid) return false; this.track = t; this.custom = true; if (this.loopMode) this.loopMode = 'spline'; this.s0 = Math.min(this.s0, t.len); this.rebuild(); return true; }

  // ---- the start, the settings ----
  setRelease(s) { this.s0 = Math.max(0, Math.min(this.track.len, s)); this.rebuild(); }
  get h0() { return this.track.geo(this.track.uAt(this.s0)).p.y; }
  // start at height h: the place on the track at that height nearest the present start
  setHeight(h) { h = Number(h); if (!isFinite(h)) return false; const s = this.track.atHeight(h, this.s0); if (s == null) return false; this.s0 = s; this.rebuild(); return true; }
  set(key, v) { const p = Sim.P[key]; v = Number(v); if (!p || !isFinite(v)) return false; v = Math.round(Math.max(p.min, Math.min(p.max, v)) * 1e6) / 1e6;
    if (key === 'y0') { this.vals.y0 = v; this.bump(); return true; } this.vals[key] = v;
    if (key === 'r' && this.loopMode === 'circle') { const h = this.h0; this.track = new CircleLoop(v); const s = this.track.atHeight(h, 0); this.s0 = s == null ? 0 : s; } this.rebuild(); return true; }
  // the loop: an exact circle (the default), or the spline through points that can be dragged
  static LOOPS = [['circle', 'Perfect circle', 'An exact circle of radius r: the textbook results hold exactly'], ['spline', 'Editable (spline)', 'A smooth curve through points you can drag: reshape the loop']];
  setLoopMode(k) { if (this.key !== 'loop' || !Sim.LOOPS.some((x) => x[0] === k) || k === this.loopMode) return false; const h = this.h0; this.loopMode = k; this.custom = false;
    this.track = k === 'circle' ? new CircleLoop(this.vals.r) : new Track(PRESETS.loop.pts); const s = this.track.atHeight(h, 0); this.s0 = s == null ? 0 : s; this.rebuild(); return true; }
  static RIDERS = [['ball', 'Ball on the track', 'It rests on the track and can fly off where the track would have to pull it in'], ['car', 'Coaster car', 'Its wheels clamp round the rail, so the rail can pull as well as push: it never leaves the track']];
  setRider(k) { if (!Sim.RIDERS.some((r) => r[0] === k) || k === this.rider) return false; this.rider = k; this.rebuild(); return true; }
  setFriction(on) { on = !!on; if (on === this.friction) return; this.friction = on; this.rebuild(); }

  // ---- the clock ----
  get time() { return this.ride.t; }
  get atEnd() { const R = this.ride.rec; return !R.length || this.ride.t >= R[R.length - 1].t - 1e-9; }
  play() { if (this.ride.done && this.atEnd) this.rebuild(); this.ride.truncate(); if (this.ride.done) this.ride.done = null; this.playing = true; this.bump(); }
  pause() { if (!this.playing) return; this.playing = false; const R = this.ride.rec; if (!R.length || R[R.length - 1].t < this.ride.t - 1e-9) this.ride.record(); this.bump(); }
  toggle() { if (this.playing) this.pause(); else this.play(); }
  reset() { this.rebuild(); }
  step() { this.playing = false; this.ride.truncate(); this.ride.advance(1 / 30); this.mark(); this.bump(); }
  tick(dt) { if (!this.playing) return false; this.ride.advance(Math.min(dt, 0.1) * this.speed); this.mark(); if (this.ride.done) this.playing = false; this.dirty = true; return true; }
  seek(t) { this.playing = false; this.ride.seek(t); this.trail = []; this.bump(); }
  mark() { const t = this.ride.t, T = this.trail; if (T.length && T[T.length - 1].t > t) T.length = 0; T.push({ t, p: this.ride.now().p }); while (T.length && T[0].t < t - Sim.TRAIL) T.shift(); }

  // ---- energy, with U_g measured from y0 ----
  energy(n) { n = n || this.ride.now(); const U = this.vals.m * G * (n.y - this.vals.y0); return { K: n.K, U, th: n.th, E: n.K + U + n.th }; }
  get E0() { const r = this.ride.rec[0]; return r ? r.K + this.vals.m * G * (r.y - this.vals.y0) + r.th : NaN; }
  // the energy line: the height where all of K + U_g would be U_g (only K + U_g: thermal energy is gone for good)
  get eline() { const n = this.ride.now(); return n.y + n.K / (this.vals.m * G); }
  // the highest hilltop of the track ahead (the way the cart is going) before it turns back, and where it turns back (if it does)
  ahead() { const n = this.ride.now(); if (n.mode !== 'track') return null; const S = this.track.S, ud = this.ride.st.ud, yE = this.eline; if (Math.abs(ud) < 1e-9) return null;
    const dir = ud > 0 ? 1 : -1, f = n.u / this.track.T * (S.length - 1), j0 = (dir > 0 ? Math.floor(f) : Math.ceil(f)) + dir; let top = null, turn = null;
    for (let j = j0; j >= 0 && j < S.length; j += dir) { const q = S[j]; if (q.y >= yE) { turn = q; break; } const a = S[j - 1], b = S[j + 1]; if (a && b && q.y >= a.y && q.y >= b.y && q.y > n.p.y + 0.1 && (!top || q.y > top.y)) top = q; }
    return { turn, top, yE }; }

  // ---- what is drawn ----
  hide(on) { on = !!on; if (on === this.hidden) return; this.hidden = on; this.bump(); }
  toggleShow(k) { if (!(k in this.show)) return; this.show[k] = !this.show[k]; this.bump(); }
  setGraph(k) { if (!Sim.GRAPHS.some((g) => g[0] === k)) return; this.graph = k; this.bump(); }

  // ---- what the page reports to whoever embeds it ----
  snapshot() { const n = this.ride.now(), e = this.energy(n), r = (x) => Math.round(x * 1000) / 1000;
    return { track: this.key, loop: this.loopMode || undefined, radius: this.loopMode === 'circle' ? this.vals.r : undefined, custom: this.custom, rider: this.rider, mass: this.vals.m, startHeight: r(this.h0), startSpeed: this.vals.v0, friction: this.friction ? this.vals.mu : 0, zero: this.vals.y0, t: r(this.ride.t), mode: n.mode,
      status: this.ride.done || this.ride.event || '', x: r(n.p.x), y: r(n.p.y), speed: r(n.speed), normal: r(n.n), energy: this.hidden ? null : { K: r(e.K), Ug: r(e.U), Eth: r(e.th), E: r(e.E) } }; }
}
