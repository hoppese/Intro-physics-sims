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
    ['height', 'Height', 'The cart’s height above the zero of potential energy'], ['trail', 'Trail', 'Where it has been in the last few seconds'],
    ['nums', 'Values', 'The numbers on the arrows, the height and the energy bars (off: just the symbols, W, n, v, K …)']];
  static P = { m: { key: 'm', label: 'Mass', sym: 'm', unit: 'kg', min: 1, max: 200, step: 1, init: 40 }, v0: { key: 'v0', label: 'Start speed', sym: 'v_0', unit: 'm/s', min: 0, max: 15, step: 0.1, init: 0 },
    r: { key: 'r', label: 'Loop radius', sym: 'r', unit: 'm', min: CircleLoop.RMIN, max: CircleLoop.RMAX, step: 0.1, init: 4 },
    mu: { key: 'mu', label: 'Friction', sym: '\\mu_{\\text{k}}', unit: '', min: 0.02, max: 0.5, step: 0.01, init: 0.12 }, y0: { key: 'y0', label: 'Zero of', sym: 'U_g', unit: 'm', min: -1, max: 20, step: 0.1, init: 0 } };
  static TRAIL = 3;
  static GRAPHS = [['time', 'Energy vs time'], ['x', 'Energy vs position'], ['normal', 'Normal force'], ['off', 'Off']];

  constructor() { this.vals = {}; for (const k of Object.keys(Sim.P)) this.vals[k] = Sim.P[k].init; this.friction = false; this.playing = false; this.speed = 1; this.hidden = false;
    this.show = { forces: true, v: true, eline: true, height: false, trail: true, nums: true }; this.graph = 'time'; this.rev = 0; this.dirty = true; this.trail = []; this.choose('hill'); }
  bump() { this.rev++; this.dirty = true; }

  // ---- the track ----
  choose(k) { const P = PRESETS[k]; if (!P) return false; this.key = k; this.custom = false; this.vals.v0 = 0; this.rider = P.rider; this.loopMode = k === 'loop' ? 'circle' : null;
    this.track = this.loopMode === 'circle' ? new CircleLoop(this.vals.r) : new Track(P.pts); const s = this.track.atHeight(this.loopMode === 'circle' ? CircleLoop.START : P.start, 0); this.s0 = s == null ? 0 : s; this.rebuild(); return true; }
  get preset() { return PRESETS[this.key]; }
  rebuild() { this.ride = new Ride(this.track, { locked: this.rider === 'car', beta: this.beta, m: this.vals.m, mu: this.friction && !this.rolling ? this.vals.mu : 0, v0: this.vals.v0, s0: this.s0 }); this.playing = false; this.trail = []; this.bump(); }
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
  // the riders: [key, chip, name, what it does, beta = I/(m r^2) for one that rolls without slipping]
  static RIDERS = [['ice', 'Ice cube', 'Ice cube', 'It slides without turning: all its kinetic energy is ½ m v². It rests on the track and can fly off where the track would have to pull it in', 0],
    ['ball', 'Ball', 'Solid ball', 'It rolls without slipping, so some of its kinetic energy goes into spinning (I = 2/5 m r²): it goes slower than the ice cube from the same drop', 0.4],
    ['hollow', 'Hollow ball', 'Hollow ball', 'A thin-walled ball rolling without slipping (I = 2/3 m r²): even more of its energy goes into spinning, so it is slower still', 2 / 3],
    ['car', 'Coaster car', 'Coaster car', 'Its wheels clamp round the rail, so the rail can pull as well as push: it never leaves the track. (Its wheels’ spin is left out: it moves like a sliding cart)', 0]];
  static riderOf(k) { return Sim.RIDERS.find((r) => r[0] === k) || null; }
  get beta() { const r = Sim.riderOf(this.rider); return r ? r[4] : 0; }
  get rolling() { return this.beta > 0; }
  get who() { return { ice: 'ice cube', ball: 'ball', hollow: 'ball', car: 'car' }[this.rider] || 'cart'; }
  setRider(k) { if (!Sim.riderOf(k) || k === this.rider) return false; this.rider = k; this.rebuild(); return true; }
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
  seek(t) { this.playing = false; this.ride.seek(t); this.trailFrom(); this.bump(); }
  // the trail up to now, from the recording (after a jump back or to an event)
  trailFrom() { const t = this.ride.t; this.trail = this.ride.rec.filter((r) => r.t <= t + 1e-9 && r.t >= t - Sim.TRAIL).map((r) => ({ t: r.t, p: { x: r.x, y: r.y } })); }

  // ---- the history: the run's events (Ride notes them), to step between ----
  get events() { return this.ride.events; }
  // the event the clock is at (-1: none), and the last one at or before now
  get evIndex() { const E = this.ride.events, t = this.ride.t; for (let i = E.length - 1; i >= 0; i--) if (Math.abs(E[i].t - t) < 1e-7) return i; return -1; }
  get evLast() { const E = this.ride.events, t = this.ride.t; let j = -1; for (let i = 0; i < E.length; i++) if (E[i].t <= t + 1e-7) j = i; return j; }
  prevEvent() { const E = this.ride.events, t = this.ride.t; let j = -1; for (let i = 0; i < E.length; i++) if (E[i].t < t - 1e-7) j = i; if (j < 0) return false; this.seek(E[j].t); return true; }
  // the next event: one already recorded, or run the clock on (out of sight) until the next one happens
  nextEvent() { const R = this.ride, t = R.t, k = R.events.findIndex((e) => e.t > t + 1e-7); if (k >= 0) { this.seek(R.events[k].t); return true; }
    if (R.done) return false; this.playing = false; R.truncate(); const n0 = R.events.length, stop = R.t + 60;
    while (!R.done && R.events.length === n0 && R.t < stop) R.advance(1 / 60);
    if (R.events.length > n0) { this.seek(R.events[n0].t); return true; } this.trailFrom(); this.bump(); return false; }
  static EVENTS = { start: 'Start', turn: 'Turning point', fast: 'Fastest', slow: 'Slowest', leave: 'Leaves the track', apex: 'Top of the flight', land: 'Lands', ground: 'Hits the ground', end: 'Off the end', done: 'End of the run' };
  // what happened at an event and why, in words: { title, short, why, tally }. Energies are left out while they are hidden.
  describe(i) { const E = this.ride.events, ev = E[i]; if (!ev) return null; const d = ev.d, r = ev.r, m = this.vals.m, mg = m * G, who = this.who, The = 'The ' + who, hid = this.hidden, roll = this.rolling, bt = this.rider === 'ball' ? '2/5' : '2/3';
    const J = (x) => (hid ? '•••' : Fmt.J(x)), U = mg * (r.y - this.vals.y0), K = r.K + (r.Kr || 0), h = Fmt.m(r.y - this.vals.y0), v = Fmt.vel, fr = this.friction && !roll;
    const thSrc = () => { const jolts = E.slice(0, i + 1).some((e) => (e.kind === 'land' || e.kind === 'ground') && e.d.jolt + e.d.roll > 0.5); return fr && jolts ? 'made by friction and landing jolts' : fr ? 'made by friction' : 'taken by landing jolts'; };
    let title = Sim.EVENTS[ev.kind] || ev.kind, why = '';
    if (ev.kind === 'start') { title = d.v > 0 ? 'Start: v₀ = ' + v(d.v) : 'Start: released from rest';
      why = d.v > 0 ? 'It starts with K = ' + J(K) + ' and U_g = m g h = ' + J(U) + ' (h = ' + h + '). Their total, ' + J(K + U) + ', is what it has to spend.' : 'At rest, so K = 0: all of its mechanical energy is U_g = m g h = ' + J(U) + ' (h = ' + h + '). From here K and U_g trade places.'; }
    else if (ev.kind === 'turn') { title = 'Turning point: v = 0, so K = 0';
      why = 'It stops for an instant and turns back. With K = 0' + (roll ? ' (and no spin, K_rot = 0)' : '') + ', its mechanical energy is all U_g: it is on the energy line, at h = ' + h + '.';
      if (r.th > 0.5) why += ' That is ' + Fmt.m(E[0].r.y + E[0].r.K / mg - r.y) + ' below its starting energy line: the ' + J(r.th) + ' of thermal energy ' + thSrc() + ' is no longer in K + U_g.'; }
    else if (ev.kind === 'fast') { title = 'Fastest: v = ' + v(d.v);
      why = (fr && r.th > 0.05 ? 'Friction puts the fastest point a little before the bottom: here the slope’s pull along the track has fallen to match friction’s drag. ' : 'The lowest point of this stretch (h = ' + h + '): U_g is smallest, so K is largest. ') + 'K = ' + J(r.K) + (roll ? ' and K_rot = ' + J(r.Kr || 0) + ' (' + bt + ' of K)' : '') + '.'
        + (d.n > mg * 1.02 ? ' The track curves up here, so n = ' + Fmt.N(d.n) + ' is more than m g = ' + Fmt.N(mg) + ': it also supplies the centripetal force.' : ''); }
    else if (ev.kind === 'slow') { title = 'Slowest: v = ' + v(d.v);
      why = d.Ny < -0.5 ? 'The top of the loop: U_g is largest, so K is smallest (' + J(r.K) + '). Upside down, n = m(v²/r − g) = ' + Fmt.N(d.n) + ': ' + (d.n > 1 ? 'still pushing, so it stays on.' : 'only just enough.')
        : 'The top of this rise (h = ' + h + '): U_g is largest, so K is smallest, but not zero: K = ' + J(r.K) + ' is left to carry it over.' + (d.n < mg * 0.98 && d.n > 0 ? ' Over the crest n = ' + Fmt.N(d.n) + ', less than m g.' : ''); }
    else if (ev.kind === 'leave') { const R = Math.abs(d.k) > 1e-9 ? 1 / Math.abs(d.k) : Infinity, a = d.v * d.v / R, gc = G * Math.abs(d.Ny);
      title = 'Leaves the track: n = 0';
      why = d.Ny >= 0 ? 'Over the crest the track bends down with radius r ≈ ' + Fmt.m(R) + '. To follow it the ' + who + ' needs a centripetal acceleration v²/r = ' + Fmt.acc(a) + ', and only gravity’s part toward the centre, g cos θ = ' + Fmt.acc(gc) + ', can give it: here they are equal, so n = m(g cos θ − v²/r) = 0. Any faster and the track would have to pull it down, which it cannot. It flies off as a projectile.'
        : 'Upside down, it has slowed until v²/r = ' + Fmt.acc(a) + ' is no more than gravity’s own pull toward the centre, g |cos θ| = ' + Fmt.acc(gc) + ' (r ≈ ' + Fmt.m(R) + '). To keep it on the circle the track would have to pull it in, which it cannot: n = 0, and it falls away as a projectile.';
      why += ' Leaving costs no energy: in flight only gravity does work, so K + U_g stays the same.'; }
    else if (ev.kind === 'apex') { title = 'Top of the flight';
      why = 'The vertical velocity is zero, but it still moves sideways at v_x = ' + v(d.vx) + ': nothing acts sideways in flight. So K = ½ m v_x² = ' + J(r.K) + ' is smallest but not zero, and it peaks at h = ' + h + ', below the height it could reach with all of K turned into U_g.' + (roll ? ' Its spin (K_rot = ' + J(r.Kr || 0) + ') is unchanged in flight.' : ''); }
    else if (ev.kind === 'land' || ev.kind === 'ground') { const loss = d.jolt + d.roll, on = ev.kind === 'land' ? 'the track' : 'the ground', along = ev.kind === 'land' ? 'along the track' : 'along the ground';
      title = (ev.kind === 'land' ? 'Lands' : 'Hits the ground') + (loss > 0.5 ? ': the jolt takes ' + J(loss) : ' smoothly');
      if (d.jolt > 0.5) why = 'Just before landing it moves at v = ' + v(d.v) + ': ' + v(d.vt) + ' ' + along + ' and ' + v(d.vn) + ' into it. ' + on[0].toUpperCase() + on.slice(1) + ' stops the part into it at once (' + (this.rider === 'ice' ? 'an ice cube does not bounce' : 'it does not bounce') + ': the landing is perfectly inelastic), so ½ m v⊥² = ½ × ' + Fmt.kg(m) + ' × (' + v(d.vn) + ')² = ' + J(d.jolt) + ' of kinetic energy becomes thermal energy: heat, sound, a dent. It keeps only the ' + v(d.vt) + ' ' + along + '.';
      else why = 'It comes down almost ' + along + ' (only ' + v(d.vn) + ' into it), so the jolt takes next to nothing.';
      if (d.roll > 0.5) why += ' Its spin did not match its new speed, so friction at the contact slides it back into rolling: another ' + J(d.roll) + '.';
      if (loss > 0.5) why += ' The total K + U_g + E_th is unchanged, but K + U_g is ' + J(loss) + ' less: from here it cannot get as high as before.';
      if (d.again) why += ' The track curves away so fast here that it leaves again at once.'; }
    else if (ev.kind === 'end') why = 'It runs off the end at ' + v(d.v) + ', along the track’s last direction. From here it is a projectile, with only gravity acting, and nothing is lost.';
    else if (ev.kind === 'done') why = d.text;
    // what changed since the event before
    const p = E[i - 1], Uof = (x) => mg * (x.y - this.vals.y0), sg = (x) => (x >= 0 ? '+' : Fmt.MINUS) + Fmt.J(Math.abs(x));
    let tally = hid ? '' : 'K ' + Fmt.J(r.K) + (roll ? ' · K_rot ' + Fmt.J(r.Kr || 0) : '') + ' · U_g ' + Fmt.J(U) + (r.th > 0.05 || fr ? ' · E_th ' + Fmt.J(r.th) : '') + ' · E ' + Fmt.J(K + U + r.th);
    if (p && !hid) { const dK = K - p.r.K - (p.r.Kr || 0), dU = U - Uof(p.r), dth = r.th - p.r.th; tally += '   (since ' + i + ': K' + (roll ? ' + K_rot' : '') + ' ' + sg(dK) + ', U_g ' + sg(dU) + (Math.abs(dth) > 0.05 ? ', E_th ' + sg(dth) : '') + ')'; }
    return { title, why, tally, short: Sim.EVENTS[ev.kind] || ev.kind }; }
  mark() { const t = this.ride.t, T = this.trail; if (T.length && T[T.length - 1].t > t) T.length = 0; T.push({ t, p: this.ride.now().p }); while (T.length && T[0].t < t - Sim.TRAIL) T.shift(); }

  // ---- energy, with U_g measured from y0 ----
  // K is the translational part, Kr the rotational (zero unless it rolls)
  energy(n) { n = n || this.ride.now(); const U = this.vals.m * G * (n.y - this.vals.y0); return { K: n.K, Kr: n.Kr || 0, U, th: n.th, E: n.K + (n.Kr || 0) + U + n.th }; }
  get E0() { const r = this.ride.rec[0]; return r ? r.K + (r.Kr || 0) + this.vals.m * G * (r.y - this.vals.y0) + r.th : NaN; }
  // the energy line: the height where all of K + U_g would be U_g (only K + U_g: thermal energy is gone for good)
  // (a rolling ball turns its spin back into height too, as it slows and stops turning)
  get eline() { const n = this.ride.now(); return n.y + (n.K + (n.mode === 'air' ? 0 : n.Kr || 0)) / (this.vals.m * G); }
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
      status: this.ride.done || this.ride.event || '', x: r(n.p.x), y: r(n.p.y), speed: r(n.speed), normal: r(n.n), energy: this.hidden ? null : { K: r(e.K), Krot: r(e.Kr), Ug: r(e.U), Eth: r(e.th), E: r(e.E) } }; }
}
