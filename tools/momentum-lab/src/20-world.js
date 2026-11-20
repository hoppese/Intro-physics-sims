// =====================================================================
// World -- the bodies and everything that pushes them about, run on a fixed
// clock. Every force here acts between two bodies, equally and oppositely
// (Newton's third law), so the total momentum of the bodies (and of a
// rocket's exhaust) cannot change: the integrator adds the same impulse to
// one as it takes from the other, to the last digit.
//
//   collisions  a stiff contact spring that squeezes and lets go. Loading at
//               k1, unloading at k1/e², so exactly the fraction e² of the
//               squeeze's energy comes back: e = 1 is a bouncy (elastic)
//               collision, 0 < e < 1 loses some to heat, e = 0 sticks (the
//               bodies are joined at the tightest squeeze and move as one)
//   charges     a compressed spring between two bodies, latched (they move
//               as one) until it is let go: then it pushes them apart and
//               falls away (an explosion)
//   gravity     between every pair of bodies, in Space
//   rockets     a body that throws mass out behind it: the exhaust carries
//               away backward momentum, the rocket gains as much forward
//
// Bodies are particles with a size: they never spin. Joined bodies keep their
// places relative to each other and share one velocity.
// =====================================================================
const GRAV = 6.674e-11;

class World {
  // s: how long a collision takes to squeeze to its tightest (sets the contact springs). Carts on the track have
  // spring bumpers that squash a centimetre or so; pucks are hard, so they squash only millimetres, and quickly.
  static TC = { track: 0.03, table: 0.002, space: 0.002 };
  static TS = 0.05;          // s: how long a released spring takes to push its bodies apart
  static MAXREC = 24000;     // moments kept for the graphs (older ones are thinned out)
  static MAXPUFF = 360;      // exhaust puffs kept (the oldest are merged in pairs)

  constructor(setup) { const s = setup; this.mode = s.mode; this.e = s.e == null ? 1 : s.e; this.gravity = !!s.gravity; this.tc = World.TC[s.mode] || 0.01;
    // (the step is short enough for the stiffest spring there will be: the unloading spring of a nearly-sticky collision)
    const w2 = Math.PI / (2 * this.tc) / (this.e >= 0.02 ? Math.min(1, this.e) : 1); this.h = s.mode === 'space' ? s.h : Math.min(s.h, 0.3 / w2); this.bounds = s.bounds || null; this.tMax = s.tMax || Infinity;
    this.t = 0; this.done = null; this.event = null; this.steps = 0;
    this.bodies = s.bodies.map((b, i) => ({ id: b.id, name: b.name, kind: b.kind, col: b.col, m: b.m, R: b.R, p: { x: b.x, y: b.y }, v: { x: b.vx, y: b.vy }, F: { x: 0, y: 0 }, i, g: i, main: true,
      rk: b.rocket ? { fuel: b.rocket.fuel, rate: b.rocket.rate, u: b.rocket.u, ang: b.rocket.ang, start: b.rocket.start || 0, m0: b.m, v0: { x: b.vx, y: b.vy }, thrust: 0 } : null }));
    this.main = this.bodies.slice(); this.exhaust = []; this.puff = null; this.puffEvery = s.puffEvery || 1 / 15;
    this.groups = new Map(this.bodies.map((b) => [b.g, [b]])); this.contacts = new Map(); this.pairs = []; this.hits = 0;
    this.charges = (s.charges || []).map((c) => ({ a: this.byId(c.a), b: this.byId(c.b), E: c.E, at: c.at, state: 'latched' })).filter((c) => c.a && c.b && c.a !== c.b);
    for (const c of this.charges) this.weld(c.a, c.b);
    this.hasRocket = this.bodies.some((b) => b.rk);
    this.forces(); this.E0 = this.K + this.U; this.P0 = this.P; this.recEvery = Math.max(1, Math.round((s.recDt || this.h) / this.h)); this.recDt = this.recEvery * this.h; this.rec = []; this.record(); }

  byId(id) { return this.bodies.find((b) => b.id === id) || null; }
  group(b) { return this.groups.get(b.g); }

  // ---- joining bodies (a sticky collision, a latched spring) and parting them ----
  // (jolt: the impulse each body takes as they lock together, kept so impulse = Δp can be checked)
  weld(a, b) { if (a.g === b.g) return; const A = this.group(a), B = this.group(b), all = A.concat(B), M = all.reduce((s, x) => s + x.m, 0);
    const P = all.reduce((s, x) => V.add(s, V.mul(x.v, x.m)), V.O), v = V.mul(P, 1 / M), K0 = all.reduce((s, x) => s + 0.5 * x.m * V.dot(x.v, x.v), 0); this.heat = (this.heat || 0) + K0 - 0.5 * M * V.dot(v, v); const ga = a.g, gb = b.g; for (const x of all) { x.jolt = V.add(x.jolt || V.O, V.mul(V.sub(v, x.v), x.m)); x.v = { ...v }; x.g = ga; } this.groups.delete(gb); this.groups.set(ga, all); }
  part(a) { const grp = this.group(a).slice(); this.groups.delete(a.g); for (const x of grp) { x.g = x.i; this.groups.set(x.i, [x]); } }

  // ---- the totals ----
  get P() { let P = V.O; for (const b of this.bodies) P = V.add(P, V.mul(b.v, b.m)); if (this.puff) P = V.add(P, this.puff.P); return P; }
  get M() { let M = 0; for (const b of this.bodies) M += b.m; return M + (this.puff ? this.puff.m : 0); }
  get cm() { let X = V.O, M = 0; for (const b of this.bodies) { X = V.add(X, V.mul(b.p, b.m)); M += b.m; } if (this.puff) { X = V.add(X, this.puff.X); M += this.puff.m; } return V.mul(X, 1 / M); }
  get K() { let K = 0; for (const b of this.main) K += 0.5 * b.m * V.dot(b.v, b.v); return K; }
  get Kex() { let K = 0; for (const b of this.exhaust) K += 0.5 * b.m * V.dot(b.v, b.v); if (this.puff && this.puff.m > 0) K += 0.5 * V.dot(this.puff.P, this.puff.P) / this.puff.m; return K; }
  // energy stored: squeezed contacts, a spring not yet spent, gravity (zero when far apart)
  get U() { let U = 0; for (const s of this.contacts.values()) U += s.U || 0;
    for (const c of this.charges) if (c.state === 'latched') U += c.E; else if (c.state === 'pushing') { const x = c.L - V.dist(c.a.p, c.b.p); if (x > 0) U += 0.5 * c.k * x * x; }
    if (this.gravity) for (let i = 0; i < this.main.length; i++) for (let j = i + 1; j < this.main.length; j++) { const a = this.main[i], b = this.main[j]; U -= GRAV * a.m * b.m / Math.max(1e-9, V.dist(a.p, b.p)); }
    return U; }
  // energy that went to heat (a squash that does not spring back): what the run started with, less what there is now
  get th() { return this.hasRocket ? 0 : this.gravity ? (this.heat || 0) : Math.max(0, this.E0 - this.K - this.U); }   // (with gravity: only what a crash turns to heat, so integration drift is not taken for heat)
  // a body is touching (or pushing on) another right now
  get busy() { return this.contacts.size > 0 || this.charges.some((c) => c.state === 'pushing'); }

  // ---- the forces at this moment (each pair: equal and opposite) ----
  forces() { const bs = this.main, e = this.e, w1 = Math.PI / (2 * this.tc); for (const b of this.bodies) b.F = { x: 0, y: 0 }; this.pairs = [];
    const push = (a, b, F, kind) => { a.F = V.sub(a.F, F); b.F = V.add(b.F, F); this.pairs.push({ a, b, F, kind }); };     // F: the force on b from a
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { const a = bs[i], b = bs[j], key = a.id + '|' + b.id, d = V.dist(a.p, b.p), squeeze = a.R + b.R - d;
      if (squeeze <= 0 || a.g === b.g) { this.contacts.delete(key); continue; }
      if (this.mode === 'space') { this.weld(a, b); this.say(a.name + ' and ' + b.name + ' crash together and stay together: a perfectly inelastic collision.', Infinity); continue; }
      let s = this.contacts.get(key); const mu = a.m * b.m / (a.m + b.m);
      if (!s) { s = { dmax: 0, unl: false, k1: mu * w1 * w1, U: 0 }; this.contacts.set(key, s); this.hits++; }
      let F;
      if (!s.unl) { if (squeeze >= s.dmax) { s.dmax = squeeze; F = s.k1 * squeeze; s.U = 0.5 * s.k1 * squeeze * squeeze; }
        else if (e < 0.02) { this.weld(a, b); this.contacts.delete(key); this.say(a.name + ' and ' + b.name + ' stick together and move on as one: a perfectly inelastic collision.', 1.4); continue; }
        else s.unl = true; }
      if (s.unl) { const k2 = s.k1 / (e * e), d0 = s.dmax * (1 - e * e), x = Math.max(0, squeeze - d0); F = k2 * x; s.U = 0.5 * k2 * x * x;
        if (F > s.k1 * squeeze) { s.unl = false; s.dmax = squeeze; F = s.k1 * squeeze; s.U = 0.5 * F * squeeze; } }
      const n = d > 1e-12 ? V.mul(V.sub(b.p, a.p), 1 / d) : { x: 1, y: 0 }; push(a, b, V.mul(n, F), 'contact');
      this.say('While they touch, ' + a.name + ' pushes on ' + b.name + ' exactly as hard as ' + b.name + ' pushes back on ' + a.name + ', at every instant.', 0.8); }
    for (const c of this.charges) { if (c.state !== 'pushing') continue; const d = V.dist(c.a.p, c.b.p), x = c.L - d; if (x <= 0) { c.state = 'spent'; continue; }
      const n = d > 1e-12 ? V.mul(V.sub(c.b.p, c.a.p), 1 / d) : { x: 1, y: 0 }; push(c.a, c.b, V.mul(n, c.k * x), 'spring'); }
    if (this.gravity) for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { const a = bs[i], b = bs[j]; if (a.g === b.g) continue; const d = V.dist(a.p, b.p);
      push(a, b, V.mul(V.sub(a.p, b.p), GRAV * a.m * b.m / (d * d * d)), 'gravity'); } }

  say(text, hold) { this.event = { text, until: this.t + (hold == null ? 1.5 : hold) }; }
  get note() { return this.done || (this.event && this.t <= this.event.until ? this.event.text : ''); }

  // ---- the clock: kick, drift, kick (each step adds equal and opposite impulses) ----
  advance(dt) { if (this.done) return; const n = Math.max(1, Math.round(dt / this.h)); for (let i = 0; i < n && !this.done; i++) this.step(); }
  kick(k) { for (const b of this.main) b.J = V.add(b.J || V.O, V.mul(b.F, k));   // (J: the impulse of the forces on each body so far, exactly as the clock applies it)
    for (const grp of this.groups.values()) { let F = V.O, M = 0; for (const b of grp) { F = V.add(F, b.F); M += b.m; } const dv = V.mul(F, k / M); for (const b of grp) b.v = V.add(b.v, dv); } }
  step() { const h = this.h; this.kick(h / 2);
    for (const b of this.bodies) b.p = V.at(b.p, b.v, h); if (this.puff) this.puff.X = V.at(this.puff.X, this.puff.P, h);
    this.t += h; this.steps++;
    for (const c of this.charges) if (c.state === 'latched' && this.t >= c.at - 1e-9) this.release(c);
    this.forces(); this.kick(h / 2); this.burn(h);
    const busy = this.busy; if (this.steps % this.recEvery === 0 || busy || this.wasBusy) this.record(); this.wasBusy = busy; this.check(); }
  release(c) { this.part(c.a); const mu = c.a.m * c.b.m / (c.a.m + c.b.m), w = Math.PI / (2 * World.TS); c.k = mu * w * w; c.L = V.dist(c.a.p, c.b.p) + Math.sqrt(2 * c.E / c.k); c.state = 'pushing';
    this.say('The spring is let go: it pushes ' + c.a.name + ' and ' + c.b.name + ' apart, with equal and opposite forces.', 1.5); }
  // a rocket throws out exhaust at speed u (relative to itself) behind it; what the exhaust takes backward, the rocket gains forward
  burn(h) { for (const b of this.main) { const r = b.rk; if (!r) continue; r.thrust = 0; if (r.fuel <= 1e-12 || this.t < r.start) continue;
      const grp = this.group(b), M = grp.reduce((s, x) => s + x.m, 0), dm = Math.min(r.rate * h, r.fuel), d = V.polar(r.ang), ve = V.sub(b.v, V.mul(d, r.u));
      const P = V.sub(V.mul(b.v, M), V.mul(ve, dm)), v = V.mul(P, 1 / (M - dm)); for (const x of grp) x.v = { ...v }; b.m -= dm; r.fuel -= dm; r.thrust = r.rate * r.u;
      if (!this.puff) this.puff = { m: 0, P: V.O, X: V.O, t0: this.t };
      this.puff.m += dm; this.puff.P = V.add(this.puff.P, V.mul(ve, dm)); this.puff.X = V.add(this.puff.X, V.mul(b.p, dm));
      if (this.t - this.puff.t0 >= this.puffEvery - 1e-9 || r.fuel <= 1e-12) this.emit();
      if (r.fuel <= 1e-12) { r.fuel = 0; this.say('Out of fuel: the rocket coasts. The rocket and its exhaust together still have the momentum they started with.', 6); } } }
  emit() { const q = this.puff; this.puff = null; if (!q || q.m <= 0) return; const b = { id: 'x' + this.exhaust.length + '-' + this.steps, name: 'exhaust', kind: 'exhaust', col: '#f0a868', m: q.m, R: 0, p: V.mul(q.X, 1 / q.m), v: V.mul(q.P, 1 / q.m), F: { x: 0, y: 0 }, main: false, born: this.t };
    b.i = this.bodies.length; b.g = 'x' + b.i; this.bodies.push(b); this.exhaust.push(b); this.groups.set(b.g, [b]);
    if (this.exhaust.length > World.MAXPUFF) { const [p, q2] = this.exhaust, m = p.m + q2.m; q2.p = V.mul(V.add(V.mul(p.p, p.m), V.mul(q2.p, q2.m)), 1 / m); q2.v = V.mul(V.add(V.mul(p.v, p.m), V.mul(q2.v, q2.m)), 1 / m); q2.m = m;
      this.exhaust.shift(); this.bodies.splice(this.bodies.indexOf(p), 1); this.groups.delete(p.g); this.bodies.forEach((x, i) => { x.i = i; }); } }
  check() { if (this.t >= this.tMax - 1e-9) { this.done = 'Time is up.'; return; } const B = this.bounds; if (!B) return;
    for (const b of this.main) { const out = b.p.x - b.R < B.x0 || b.p.x + b.R > B.x1 || b.p.y - b.R < B.y0 || b.p.y + b.R > B.y1; if (!out) continue;
      this.done = { track: b.name + ' reached the end of the track.', table: b.name + ' reached the edge of the table.', space: b.name + ' has gone out of the picture.' }[this.mode] + ' The clock stops here.'; return; } }

  // ---- the recording the graphs read ----
  record() { const R = this.rec; R.push({ t: this.t, b: this.main.map((b) => ({ p: { ...b.p }, v: { ...b.v }, m: b.m, F: { ...b.F }, th: b.rk ? b.rk.thrust : 0, jolt: b.jolt ? { ...b.jolt } : V.O, J: b.J ? { ...b.J } : V.O })), P: this.P, Pex: this.Pex, cm: this.cm, K: this.K, Kex: this.Kex, U: this.U, th: this.th });
    if (R.length > World.MAXREC) { this.rec = R.filter((r, i) => i % 2 === 0 || i === R.length - 1); this.recEvery *= 2; } }
  get Pex() { let P = V.O; for (const b of this.exhaust) P = V.add(P, V.mul(b.v, b.m)); if (this.puff) P = V.add(P, this.puff.P); return P; }
  get mex() { let m = 0; for (const b of this.exhaust) m += b.m; return m + (this.puff ? this.puff.m : 0); }
}
