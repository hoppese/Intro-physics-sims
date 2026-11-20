// =====================================================================
// Ride -- the cart's motion. Three ways to move:
//   track   held to the curve on its riding side: the state is (u, du/dt), and the equation of motion
//           along the curve is exact (Lagrange's, for a point on a curve under gravity), stepped by RK4.
//           The normal force follows from the curvature: n = m (k v² + g N_y) -- smaller than m g over
//           a crest, bigger in a dip. A ball resting on the track leaves it where n would have to pull
//           (n < 0); a coaster car (`locked`, its wheels clamped round the rail) never does: the rail pulls.
//   air     a projectile: only gravity, stepped exactly. It lands on the track's riding side (the jolt
//           takes the part of the velocity into the track) or on the ground.
//   ground  rolling along the ground (y = 0) after leaving the track, until it stops or leaves the picture.
// Friction (kinetic, coefficient mu; mu = 0 is off) does work -mu n |v| dt, kept as thermal energy, so
// K + U_g + E_th stays fixed. The energy taken by a landing jolt is put with the thermal energy too.
// The cart is treated as a point at the track; it is drawn as a ball resting on the track.
// Rolling (beta = I/(m r^2) > 0: a solid ball 2/5, a hollow one 2/3) rolls without slipping: its kinetic energy is
// (1 + beta) x 1/2 m v^2, the translational part plus K_rot = 1/2 I w^2 = beta x 1/2 m v^2, so along the track it
// speeds up only 1/(1 + beta) as fast. Static friction, f_s = beta m g_t/(1 + beta) back up the slope, supplies the
// torque and does no work. Mass and radius cancel. The spin is kept as W = w r (anticlockwise positive; W = -v_t
// while rolling); in the air nothing changes it, and on landing (track or ground) the contact's friction brings it
// back to rolling, keeping the angular momentum about the contact point: v' = (v_t - beta W)/(1 + beta). Whatever
// that takes goes with the thermal energy, like a landing jolt. `ang` is the turn of the drawn ball (radius RDRAW).
// The history: as it runs, the ride notes the moments worth stopping at (events: { t, kind, d, r }, d the numbers that
// explain it, r the recording at that instant, which is made exactly then so seeking to t lands on it): the start,
// each turning point (v = 0), the fastest and slowest points of each stretch of track, leaving the track (n = 0), the
// top of a flight, a landing (and what its jolt took), off the end, and the end of the run. Sim.describe words them.
// =====================================================================
const G = 9.8;

class Ride {
  static H = 1 / 1200;             // s: one step of the clock
  static REC = 1 / 60;             // s: how often the run is recorded
  static MAXREC = 120;             // s of recording kept
  static GRACE = 0.04;             // s: just after leaving the track, it cannot land on it again
  static RDRAW = 0.45;              // m: the ball's radius as drawn (its turn is the distance rolled over this)
  constructor(track, o) { this.track = track; this.m = o.m; this.beta = o.beta || 0; this.mu = this.beta > 0 ? 0 : o.mu || 0; this.locked = !!o.locked; this.v0 = o.v0 || 0; this.s0 = o.s0 || 0; this.reset(); }
  reset() { const u = this.track.uAt(this.s0), g = this.track.geo(u); this.seen = {}; this.st = { mode: 'track', u, ud: this.v0 / g.sp, th: 0, tair: 0, ang: 0 }; this.t = 0; this.done = null; this.event = null; this.rec = []; this.nextRec = 0; this.events = []; this.pending = []; this.stash = null; this.trend = 0;
    if (this.v0 === 0 && this.mu > 0) this.stuck(); this.record(); this.events.push({ t: 0, kind: 'start', d: { v: Math.abs(this.v0), y: g.p.y }, r: this.rec[0] }); }
  // an event in this step: written down (with its own recording) once the clock has moved on to the step's end
  note(kind, d) { this.pending.push({ kind, d }); }
  // A fastest (or slowest) point is held back until the speed has moved clearly away from it (by WIGGLE), so the ripples
  // of a nearly level stretch make no events: another of the same kind meanwhile replaces it if it is more extreme, one of
  // the other kind is a ripple and is dropped. Any other event lets it through first.
  static wiggle(v) { return Math.max(0.15, 0.02 * v); }
  flush() { const R = this.rec, E = this.events; if (!R.length || Math.abs(R[R.length - 1].t - this.t) > 1e-12) this.record(); const r = R[R.length - 1];
    for (const e of this.pending) { const ev = { t: this.t, kind: e.kind, d: e.d, r }, c = this.stash;
      if (ev.kind === 'confirm') { if (c) E.push(c); this.stash = null; continue; }
      if (ev.kind === 'fast' || ev.kind === 'slow') { if (!c || (c.kind === ev.kind && (ev.kind === 'fast') === (ev.d.v > c.d.v))) this.stash = ev; continue; }
      if (c) { E.push(c); this.stash = null; } const L = E[E.length - 1]; if (ev.kind === 'done' && L && L.kind === 'turn' && L.t === ev.t) E.pop(); E.push(ev); }      // (stopped by friction: the stop, not a turning point)
    this.pending = []; }
  // is the speed rising (1) or falling (-1) here on the track (0: neither, or not on the track)
  trendAt(u, ud) { const a = this.forces(u, ud).at * ud; return a > 1e-6 ? 1 : a < -1e-6 ? -1 : 0; }

  // ---- on the track ----
  // the normal force (signed: negative means the track would have to pull) and the tangential acceleration, at (u, ud)
  forces(u, ud) { const q = this.track.geo(u), v = q.sp * ud, n = this.m * (q.k * v * v + G * q.N.y), gt = -G * q.T.y; let f = 0;
    if (this.mu > 0 && n !== 0) { const dir = ud > 1e-12 ? 1 : ud < -1e-12 ? -1 : 0; f = this.mu * Math.abs(n) / this.m * dir; }
    return { q, v, n, gt, at: (gt - f) / (1 + this.beta) }; }
  deriv(u, ud) { const F = this.forces(u, ud), q = F.q, dsp = (q.q.dx * q.q.ddx + q.q.dy * q.q.ddy) / q.sp; return [ud, (F.at - dsp * ud * ud) / q.sp, this.mu > 0 ? this.mu * Math.abs(F.n) * Math.abs(F.v) : 0]; }
  rk4(s, h) { const f = (u, ud) => this.deriv(u, ud), k1 = f(s.u, s.ud), k2 = f(s.u + k1[0] * h / 2, s.ud + k1[1] * h / 2), k3 = f(s.u + k2[0] * h / 2, s.ud + k2[1] * h / 2), k4 = f(s.u + k3[0] * h, s.ud + k3[1] * h);
    return { mode: 'track', u: s.u + (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) * h / 6, ud: s.ud + (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) * h / 6, th: s.th + (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]) * h / 6, tair: 0, ang: s.ang || 0 }; }
  stepTrack(h) { const s = this.st, T = this.track.T; let nx = this.rk4(s, h);
    // off an end of the track: on as a projectile from the end, at the speed energy says it has there
    if (nx.u < 0 || nx.u > T) { const end = nx.u < 0 ? 0 : T, q = this.track.geo(end), E = this.mech(s) - this.m * G * q.p.y - (nx.th - s.th), sp = Math.sqrt(Math.max(0, 2 * E / ((1 + this.beta) * this.m))), dir = nx.u < 0 ? -1 : 1;
      this.st = { mode: 'air', p: q.p, v: { x: q.T.x * sp * dir, y: q.T.y * sp * dir }, th: nx.th, tair: 0, nrm: q.N, w: -sp * dir, ang: s.ang || 0 }; this.event = 'Off the end of the track: from here it is a projectile, with only gravity acting.'; this.trend = 0; this.note('end', { v: sp, y: q.p.y }); return; }
    // the track would have to pull: find where n reaches zero (bisecting the step), and leave there
    if (!this.locked && this.forces(nx.u, nx.ud).n < 0) { let lo = 0, hi = h; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (this.forces(this.rk4(s, m).u, this.rk4(s, m).ud).n < 0) hi = m; else lo = m; }
      const at = this.rk4(s, lo), q = this.track.geo(at.u), v = q.sp * at.ud; this.st = { mode: 'air', p: q.p, v: { x: q.T.x * v, y: q.T.y * v }, th: at.th, tair: 0, nrm: q.N, w: -v, ang: s.ang || 0, left: { u: at.u, n: this.forces(at.u, at.ud).n } };
      this.event = q.N.y < 0 ? 'Too slow up there: the track would have to pull it in (n < 0), which it cannot. It leaves the track and falls like a projectile.' : 'Too fast over the crest: staying on would take n < 0 (the track pulling it down), so it leaves the track and flies.';
      this.trend = 0; this.note('leave', { v: Math.abs(v), k: q.k, Ny: q.N.y, y: q.p.y }); return; }
    // the moments worth stopping at: a turning point (v = 0), the fastest and the slowest point of a stretch (the speed stops rising, or falling)
    const turn = s.ud * nx.ud < 0, tr = this.trendAt(nx.u, nx.ud), qn = this.track.geo(nx.u), vn = Math.abs(qn.sp * nx.ud);
    if (turn) this.note('turn', { v: 0, y: qn.p.y });
    else if (tr && this.trend && tr !== this.trend && (this.trend > 0 || vn > 0.05)) this.note(this.trend > 0 ? 'fast' : 'slow', { v: vn, y: qn.p.y, n: this.forces(nx.u, nx.ud).n, Ny: qn.N.y, k: qn.k });
    if (tr) this.trend = tr;
    if (this.stash && !turn && (this.stash.kind === 'fast' ? vn < this.stash.d.v - Ride.wiggle(this.stash.d.v) : vn > this.stash.d.v + Ride.wiggle(this.stash.d.v))) this.note('confirm');
    // passing a marked place (the loop's bottom and top): note n and v there, the first time
    if (this.track.marks) for (const k of this.track.marks) if (!this.seen[k.key] && (s.u - k.u) * (nx.u - k.u) < 0) { const f = (k.u - s.u) / (nx.u - s.u), ud = s.ud + f * (nx.ud - s.ud);
      this.seen[k.key] = { n: this.forces(k.u, ud).n, v: Math.abs(this.track.geo(k.u).sp * ud) }; }
    // friction brings it to a stop: does it stay there?
    if (this.mu > 0 && s.ud * nx.ud < 0) { nx.ud = 0; this.st = nx; this.stuck(); return; }
    this.st = nx; }
  // at rest on the track with friction on: friction holds it if the slope is gentle enough (mu_s taken equal to mu_k)
  stuck() { const s = this.st; if (s.mode !== 'track' || s.ud !== 0) return; const q = this.track.geo(s.u), gt = -G * q.T.y, gn = G * q.N.y; if ((gn > 0 || this.locked) && Math.abs(gt) <= this.mu * Math.abs(gn) + 1e-12) this.done = 'Friction has brought the cart to rest: all the energy it lost is now thermal energy.'; }

  // ---- in the air ----
  stepAir(h) { const s = this.st, p0 = s.p, v0 = s.v, p1 = { x: p0.x + v0.x * h, y: p0.y + v0.y * h - G * h * h / 2 }, v1 = { x: v0.x, y: v0.y - G * h }, W = Track.WORLD; s.tair += h;
    if (v0.y > 0 && v1.y <= 0 && p1.y > 0) this.note('apex', { vx: Math.abs(v0.x), y: p0.y + v0.y * v0.y / (2 * G) });
    // the ground
    if (p1.y <= 0) { const a = -G / 2, b = v0.y, c = p0.y, dt = c <= 0 ? 0 : (-b - Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a), vy = v0.y - G * dt, x = p0.x + v0.x * dt, R = this.reroll(v0.x, s.w), loss = this.m * vy * vy / 2 + R.loss;
      this.st = { mode: 'ground', x, vx: R.v, th: s.th + loss, tair: 0, ang: s.ang || 0 }; this.note('ground', { v: Math.hypot(v0.x, vy), vt: Math.abs(v0.x), vn: Math.abs(vy), jolt: this.m * vy * vy / 2, roll: R.loss, after: Math.abs(R.v), y: 0 }); if (loss > 0.5) this.event = 'It hits the ground: the jolt takes ' + Fmt.J(loss) + ' (counted with the thermal energy). It rolls on along the ground.'; return; }
    // the track: a crossing of any piece of it, from the riding side
    if (s.tair > Ride.GRACE) { const hit = this.cross(p0, p1); if (hit) { const q = this.track.geo(hit.u), vh = { x: v0.x, y: v0.y - G * hit.t * h }, vt = vh.x * q.T.x + vh.y * q.T.y, vn = vh.x * q.N.x + vh.y * q.N.y;
      if (hit.front) { const R = this.reroll(vt, s.w), loss = this.m * vn * vn / 2 + R.loss, vr = R.v; this.st = { mode: 'track', u: hit.u, ud: vr / q.sp, th: s.th + loss, tair: 0, ang: s.ang || 0 }; this.event = loss > 0.5 ? 'It lands back on the track: the jolt takes ' + Fmt.J(loss) + ' (counted with the thermal energy).' : this.event; this.trend = 0;
        this.note('land', { v: Math.hypot(vh.x, vh.y), vt: Math.abs(vt), vn: Math.abs(vn), jolt: this.m * vn * vn / 2, roll: R.loss, after: Math.abs(vr), y: q.p.y, slope: Math.atan2(Math.abs(q.T.y), Math.abs(q.T.x)) * 180 / Math.PI, again: !this.locked && this.forces(hit.u, vr / q.sp).n < 0 });
        if (!this.locked && this.forces(hit.u, vr / q.sp).n < 0) this.st = { mode: 'air', p: q.p, v: { x: q.T.x * vr, y: q.T.y * vr }, th: s.th + loss, tair: 0, nrm: q.N, w: -vr, ang: s.ang || 0 }; return; }
      this.done = 'It struck the underside of the track.'; s.p = { x: hit.x, y: hit.y }; return; } }
    s.p = p1; s.v = v1; if (p1.x < W.x0 - 1 || p1.x > W.x1 + 1) this.done = 'It flew off the side of the picture.'; }
  // where the segment a-b crosses the track (the first crossing), and from which side
  cross(a, b) { const S = this.track.S; let best = null;
    for (let j = 0; j + 1 < S.length; j++) { const c = S[j], d = S[j + 1]; if (Math.max(c.x, d.x) < Math.min(a.x, b.x) - 0.01 || Math.min(c.x, d.x) > Math.max(a.x, b.x) + 0.01 || Math.max(c.y, d.y) < Math.min(a.y, b.y) - 0.01 || Math.min(c.y, d.y) > Math.max(a.y, b.y) + 0.01) continue;
      const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y, den = rx * sy - ry * sx; if (Math.abs(den) < 1e-14) continue;
      const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den, w = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den; if (t < 0 || t > 1 || w < 0 || w > 1) continue;
      if (!best || t < best.t) best = { t, u: c.u + w * (d.u - c.u), x: a.x + t * rx, y: a.y + t * ry, front: sx * (a.y - c.y) - sy * (a.x - c.x) > 0 }; }
    return best; }

  // ---- on the ground ----
  stepGround(h) { const s = this.st, W = Track.WORLD, sp = Math.abs(s.vx);
    if (this.mu > 0) { const dv = Math.min(sp, this.mu * G * h); s.th += this.m * (sp * sp - (sp - dv) * (sp - dv)) / 2; s.vx = Math.sign(s.vx) * (sp - dv); }
    s.x += s.vx * h; if (s.x < W.x0 - 0.5 || s.x > W.x1 + 0.5) this.done = 'It rolled off the side of the picture.'; else if (s.vx === 0) this.done = 'Friction has stopped it on the ground.'; }

  // ---- the clock ----
  step(h) { const m = this.st.mode; if (m === 'track') this.stepTrack(h); else if (m === 'air') this.stepAir(h); else this.stepGround(h); if (this.beta > 0) this.st.ang = (this.st.ang || 0) + this.spin() / Ride.RDRAW * h; }
  // W = w r, anticlockwise positive: -v_t while it rolls (on the track, T is the way u runs and the riding side is on its left), kept in the air
  spin() { const s = this.st; if (!(this.beta > 0)) return 0; if (s.mode === 'air') return s.w || 0; if (s.mode === 'ground') return -s.vx; return -this.track.geo(s.u).sp * s.ud; }
  // touching down with tangential speed vt and spin W: friction at the contact brings it to rolling, keeping the angular momentum
  // about the contact point, so v' = (vt - beta W)/(1 + beta); the kinetic energy that takes is returned as loss. Sliding (beta 0): v' = vt, no loss.
  reroll(vt, W) { const b = this.beta; if (!(b > 0)) return { v: vt, loss: 0 }; W = W || 0; const v = (vt - b * W) / (1 + b), m = this.m; return { v, loss: Math.max(0, m * vt * vt / 2 + b * m * W * W / 2 - (1 + b) * m * v * v / 2) }; }
  advance(dt) { if (this.done) return; const n = Math.max(1, Math.ceil(dt / Ride.H - 1e-9)), h = dt / n;
    for (let i = 0; i < n && !this.done; i++) { this.step(h); this.t += h; if (this.t >= this.nextRec - 1e-9) this.record(); if (this.pending.length) this.flush(); }
    if (this.done) { const E = this.events; if (!E.length || E[E.length - 1].kind !== 'done') { this.note('done', { text: this.done, y: this.now().p.y }); this.flush(); } else this.record(); } }

  // ---- what the moment looks like ----
  // p, v, the unit normal and tangent of the track there (or the ground), n (0 off the track), the forces, and the energies (U_g from y = 0)
  now() { const s = this.st, m = this.m; let p, v, N = { x: 0, y: 1 }, T = { x: 1, y: 0 }, n = 0, k = 0;
    if (s.mode === 'track') { const F = this.forces(s.u, s.ud), q = F.q; p = q.p; v = { x: q.T.x * F.v, y: q.T.y * F.v }; N = q.N; T = q.T; n = this.locked ? F.n : Math.max(0, F.n); k = q.k; }
    else if (s.mode === 'air') { p = s.p; v = s.v; N = null; }
    else { p = { x: s.x, y: 0 }; v = { x: s.vx, y: 0 }; n = m * G; }
    const sp = Math.hypot(v.x, v.y), forces = [{ kind: 'weight', F: { x: 0, y: -m * G }, by: 'the Earth' }];
    if (N && Math.abs(n) > 1e-9) forces.push({ kind: 'normal', F: { x: N.x * n, y: N.y * n }, by: s.mode === 'ground' ? 'the ground' : 'the track' });
    if (N && Math.abs(n) > 1e-9 && this.mu > 0 && sp > 1e-9) forces.push({ kind: 'kinetic', F: { x: -v.x / sp * this.mu * Math.abs(n), y: -v.y / sp * this.mu * Math.abs(n) }, by: s.mode === 'ground' ? 'the ground' : 'the track' });
    // rolling on the track or the ground: static friction along the track, f_s = m (a_t - g_t), up the slope while it speeds up
    if (this.beta > 0 && N && s.mode === 'track') { const F = this.forces(s.u, s.ud), fs = m * (F.at - F.gt); if (Math.abs(fs) > 1e-9 * m) forces.push({ kind: 'static', F: { x: T.x * fs, y: T.y * fs }, by: 'the track' }); }
    const W = this.spin();
    return { mode: s.mode, p, v, speed: sp, N, T, n, k, forces, nrm: s.mode === 'air' ? (s.nrm || { x: 0, y: 1 }) : N, K: m * sp * sp / 2, Kr: this.beta * m * W * W / 2, ang: s.ang || 0, y: p.y, th: s.th, u: s.mode === 'track' ? s.u : null, m }; }
  // K + m g y (with y measured from the ground) for a state on the track
  mech(s) { const q = this.track.geo(s.u), v = q.sp * s.ud; return (1 + this.beta) * this.m * v * v / 2 + this.m * G * q.p.y; }

  // ---- the recording: every REC seconds, enough to draw the graphs and to come back to that moment ----
  record() { const n = this.now(); this.rec.push({ t: this.t, x: n.p.x, y: n.p.y, K: n.K, Kr: n.Kr, th: n.th, n: n.n, mode: n.mode, st: { ...this.st, p: this.st.p ? { ...this.st.p } : undefined, v: this.st.v ? { ...this.st.v } : undefined }, done: this.done, event: this.event });
    this.nextRec = this.t + Ride.REC; while (this.rec.length && this.rec[0].t < this.t - Ride.MAXREC) this.rec.shift(); while (this.events && this.events.length && this.events[0].t < this.rec[0].t - 1e-9) this.events.shift(); }
  // go back (or forward) to the recorded moment nearest t; running on from there drops what came after
  seek(t) { const R = this.rec; if (!R.length) return; let best = R[0]; for (const r of R) if (Math.abs(r.t - t) < Math.abs(best.t - t)) best = r;
    this.t = best.t; this.st = { ...best.st, p: best.st.p ? { ...best.st.p } : undefined, v: best.st.v ? { ...best.st.v } : undefined }; this.done = best.done; this.event = best.event; this.nextRec = this.t + Ride.REC; this.pending = []; this.stash = null; this.trend = this.st.mode === 'track' ? this.trendAt(this.st.u, this.st.ud) : 0; }
  truncate() { const t = this.t; while (this.rec.length > 1 && this.rec[this.rec.length - 1].t > t + 1e-9) this.rec.pop(); while (this.events.length > 1 && this.events[this.events.length - 1].t > t + 1e-9) this.events.pop(); this.stash = null; }
}
