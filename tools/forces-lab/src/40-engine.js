// =====================================================================
// World -- the bench in motion. Built from a Scene (its set-up), it moves
// the blocks forward in time and, at every instant, works out every force.
//
// Each block is a particle with a size: position, velocity, mass, and a tilt
// that follows whatever it rests on. At each instant the accelerations come
// from Newton's second law with the constraints the bench imposes:
//
//   contact   a block may not sink into a surface or another block: the normal force
//             n >= 0 keeps it out, and lets go when it would have to pull
//   friction  while a contact is not sliding, static friction holds it, up to mu_s n;
//             past that it slides, against kinetic friction mu_k n
//   rope      a taut rope may not stretch: tension T >= 0, and slack when it would push
//
// These are solved together, exactly (a small linear system, re-solved until every
// rule holds: see solve()), so a textbook problem gives the textbook answer.
// =====================================================================
class World {
  static TOL = 2e-3;          // m: a gap this small counts as touching
  static VEPS = 1e-4;         // m/s: a relative speed this small counts as at rest
  static H = 1 / 600;         // s: one step of the clock
  static FALL = BOARD.y0 - 3; // m: below this a block has left the bench
  static SIDE = 0.5;          // m: this far past either side of the bench, a block has left it

  constructor(scene) {
    this.g = scene.opts.g; this.t = 0; this.stopped = null; this.events = [];
    this.bodies = scene.blocks.map((b, i) => ({ el: b, id: b.id, i, m: b.mass, w: b.w, h: b.h, ang: b.angle, p: b.pos, v: { x: b.vx, y: b.vy }, gone: false }));
    this.byId = new Map(this.bodies.map((b) => [b.id, b]));
    this.surfaces = scene.ofType(Surface).map((s) => ({ el: s, id: s.id, a: s.a, b: s.b, t: s.dir, n: s.normal, len: s.length, muS: s.muS, muK: s.muK }));
    this.fixed = new Map(); for (const e of scene.els) if (e instanceof Anchor || e instanceof Pulley) this.fixed.set(e.id, e);
    this.ropes = []; for (const r of scene.ofType(Rope)) { const g0 = this.route(r); if (g0) this.ropes.push({ el: r, id: r.id, from: r.from, to: r.to, via: r.via.map((id) => this.fixed.get(id)), wraps: g0.wraps, L0: g0.length + r.slack, taut: r.slack <= 0 }); }
    for (const r of this.ropes) { const g = this.route(r); r.geo = g; }
    this.springs = scene.ofType(Spring).map((s) => ({ el: s, id: s.id, from: s.from, to: s.to, k: s.k, rest: s.rest }));
    this.pushes = scene.ofType(Push).map((p) => ({ el: p, id: p.id, on: p.on, F0: p.F, rate: p.rate || 0, dir: V.polar(p.angle) }));
    this.W = 0; this.rec = [];   // work done so far by the applied forces; the recording (see record)
    this.modes = new Map();      // contact key -> 'stick' | 'slide'
    this.settle(); this.sol = this.solve(); this.E0 = this.energy().E; this.record(); }
  // an applied force now: steady, or growing at `rate` newtons a second
  pushF(p, t) { return V.mul(p.dir, Math.max(0, p.F0 + p.rate * (t == null ? this.t : t))); }
  power(t) { let P = 0; for (const p of this.pushes) { const b = this.byId.get(p.on); if (b && !b.gone) P += V.dot(this.pushF(p, t), b.v); } return P; }

  // ---- positions of things ----
  posOf(id) { const b = this.byId.get(id); if (b) return b.p; const f = this.fixed.get(id); return f ? f.pos : null; }
  velOf(id) { const b = this.byId.get(id); return b ? b.v : { x: 0, y: 0 }; }
  route(r) { const rope = r.el || r, via = (r.via && r.via.length && r.via[0] && r.via[0].pos ? r.via : rope.via.map((id) => this.fixed.get(id)));
    const pa = this.posOf(rope.from), pb = this.posOf(rope.to); if (!pa || !pb || via.some((p) => !p)) return null;
    return Rope.route(pa, via.map((p) => ({ c: p.pos, r: p.r })), pb, r.wraps); }

  // ---- contacts: where blocks touch surfaces and each other ----
  // { key, i, j (another body, or null for a fixed surface), n (from j into i), t, gap, muS, muK, sup (the tilt it would give) }
  contacts() { const out = [], B = this.bodies.filter((b) => !b.gone);
    for (const b of B) { const u = V.polar(b.ang), v = V.left(u);
      for (const s of this.surfaces) { const rel = V.sub(b.p, s.a), along = V.dot(rel, s.t), up = V.dot(rel, s.n); if (up < 0 || along < -1e-9 || along > s.len + 1e-9) continue;
        const ext = Math.abs(V.dot(s.n, u)) * b.w / 2 + Math.abs(V.dot(s.n, v)) * b.h / 2, gap = up - ext; if (gap > World.TOL) continue;
        out.push({ key: 's' + s.id + ':' + b.id, i: b, j: null, n: s.n, t: s.t, gap, muS: s.muS, muK: s.muK, sup: s.n.y > 0.5 ? World.tilt(s.t) : null, by: s.el }); }
      for (const o of B) { if (o === b || Math.abs(Angle.diff(o.ang, b.ang)) > 0.5) continue;
        const ou = V.polar(o.ang), ov = V.left(ou), r = V.sub(b.p, o.p), ru = V.dot(r, ou), rv = V.dot(r, ov);
        const gu = Math.abs(ru) - (b.w + o.w) / 2, gv = Math.abs(rv) - (b.h + o.h) / 2;
        if (gu > World.TOL || gv > World.TOL) continue;
        // (touching along the face that is least overlapped; edge to edge counts only if they overlap along it)
        const top = gv >= gu; if (top ? gu > -1e-3 : gv > -1e-3) continue;
        const n = top ? V.mul(ov, rv >= 0 ? 1 : -1) : V.mul(ou, ru >= 0 ? 1 : -1), base = top ? (rv >= 0 ? o : b) : (o.id < b.id ? o : b);
        if (b.id < o.id && out.some((c) => c.j === b && c.i === o)) continue;
        out.push({ key: 'b' + o.id + ':' + b.id, i: b, j: o, n, t: V.mul(V.left(n), -1), gap: top ? gv : gu, muS: base.el.muS, muK: base.el.muK, sup: n.y > 0.5 ? o.ang : null, by: o.el }); } }
    // (a pair is one contact, from the lower id's side)
    const seen = new Set(); return out.filter((c) => { if (!c.j) return true; const k = Math.min(c.i.id, c.j.id) + '-' + Math.max(c.i.id, c.j.id); if (seen.has(k)) return false; seen.add(k); return true; }); }
  // the tilt a block takes on a face with this direction: between -90 and 90 degrees
  static tilt(t) { let a = Angle.of(t); if (a > 90) a -= 180; if (a <= -90) a += 180; return Math.abs(a) < 1e-9 ? 0 : a; }
  rel(c, vecOf) { const a = vecOf(c.i), b = c.j ? vecOf(c.j) : { x: 0, y: 0 }; return V.sub(a, b); }

  // ---- the forces that do not depend on the constraints ----
  applied() { const F = this.bodies.map((b) => ({ x: 0, y: -b.m * this.g })), list = this.bodies.map((b) => [{ kind: 'weight', F: { x: 0, y: -b.m * this.g } }]);
    for (const s of this.springs) { const pa = this.posOf(s.from), pb = this.posOf(s.to); if (!pa || !pb) continue; const d = V.sub(pb, pa), l = V.len(d); if (l < 1e-9) continue;
      const f = V.mul(d, s.k * (l - s.rest) / l), A = this.byId.get(s.from), Bb = this.byId.get(s.to);
      if (A && !A.gone) { F[A.i] = V.add(F[A.i], f); list[A.i].push({ kind: 'spring', F: f, by: s.el }); }
      if (Bb && !Bb.gone) { F[Bb.i] = V.sub(F[Bb.i], f); list[Bb.i].push({ kind: 'spring', F: V.mul(f, -1), by: s.el }); } }
    for (const p of this.pushes) { const b = this.byId.get(p.on); if (!b || b.gone) continue; const f = this.pushF(p); F[b.i] = V.add(F[b.i], f); list[b.i].push({ kind: 'applied', F: f, by: p.el }); }
    return { F, list }; }

  // the rope's rate of lengthening, and its second derivative apart from the accelerations
  ropeState(r) { const g = this.route(r); if (!g) return null; r.geo = g;
    const A = this.byId.get(r.from), B = this.byId.get(r.to), vA = A ? A.v : { x: 0, y: 0 }, vB = B ? B.v : { x: 0, y: 0 };
    // dL/dx at each end: moving an end toward where the rope pulls it shortens the rope
    const gA = V.mul(g.pullA, -1), gB = V.mul(g.pullB, -1), Ldot = (A ? V.dot(gA, vA) : 0) + (B ? V.dot(gB, vB) : 0);
    const bend = (vrel, d, leg) => { const along = V.dot(vrel, d); return Math.max(0, V.dot(vrel, vrel) - along * along) / Math.max(leg, 1e-6); };
    let curv = 0; if (g.direct) curv = bend(V.sub(vA, vB), g.pullA, g.legA); else { if (A) curv += bend(vA, g.pullA, g.legA); if (B) curv += bend(vB, g.pullB, g.legB); }
    return { g, A: A && !A.gone ? A : null, B: B && !B.gone ? B : null, gA, gB, L: g.length, Ldot, curv }; }

  // ---- the constrained solve ----
  // Returns { a: accelerations, forces: per body [{ kind, F, by }], contacts, ropes: [{ rope, T }] }.
  solve() { const N = this.bodies.length, ext = this.applied(), cs = this.contacts(), rs = this.ropes.map((r) => ({ r, s: this.ropeState(r) })).filter((x) => x.s);
    const vrel = (c) => this.rel(c, (b) => b.v);
    // the starting guess: touching contacts closed (sliding if they are sliding), ropes taut if at full length
    for (const c of cs) { const vn = V.dot(vrel(c), c.n), vt = V.dot(vrel(c), c.t);
      c.on = c.gap <= World.TOL && vn <= World.VEPS * 10; const was = this.modes.get(c.key);
      c.mode = Math.abs(vt) > World.VEPS ? 'slide' : was === 'slide-start' ? 'slide' : 'stick'; c.s = Math.abs(vt) > World.VEPS ? Math.sign(vt) : (this.modes.get(c.key + ':s') || 0); }
    for (const x of rs) x.on = x.s.L >= x.r.L0 - World.TOL;
    let best = null, seen = new Set();
    for (let iter = 0; iter < 40; iter++) {
      const key = cs.map((c) => (c.on ? c.mode[1] + (c.s > 0 ? '+' : '-') : 'o')).join('') + '|' + rs.map((x) => (x.on ? 'T' : 's')).join('');
      if (seen.has(key)) break; seen.add(key);
      const sol = this.system(N, ext.F, cs, rs); if (!sol) break; best = sol;
      // the worst broken rule, and its fix
      let worst = 0, fix = null; const bad = (amount, f) => { if (amount > worst + 1e-12) { worst = amount; fix = f; } };
      for (const c of cs) { const k = sol.k.get(c);
        if (c.on) { const ln = sol.lam[k.n]; if (ln < -1e-9) bad(-ln, () => { c.on = false; });
          else if (c.mode === 'stick') { const lt = sol.lam[k.t], lim = c.muS * Math.max(0, ln);
            // (too much friction asked for: first see whether any is needed at all, as with blocks side by side; if so, it slides)
            if (Math.abs(lt) > lim + 1e-9) bad(Math.abs(lt) - lim, () => { if (!this.needless(c, N, ext.F, cs, rs)) { c.mode = 'slide'; c.s = -Math.sign(lt); } }); }
          else { const at = V.dot(this.rel(c, (b) => sol.a[b.i]), c.t), vt = V.dot(vrel(c), c.t);
            // starting to slide from rest: the friction must not drive it backwards
            if (Math.abs(vt) <= World.VEPS && at * c.s < -1e-9) bad(-at * c.s, () => { c.mode = 'stick'; }); } }
        else if (c.gap <= World.TOL) { const an = V.dot(this.rel(c, (b) => sol.a[b.i]), c.n), vn = V.dot(vrel(c), c.n); if (vn <= World.VEPS && an < -1e-9) bad(-an, () => { c.on = true; }); } }
      for (const x of rs) { const T = x.on ? sol.lam[sol.k.get(x)] : 0;
        if (x.on && T < -1e-9) bad(-T, () => { x.on = false; });
        else if (!x.on && x.s.L >= x.r.L0 - World.TOL && x.s.Ldot >= -World.VEPS) { const Ldd = (x.s.A ? V.dot(x.s.gA, sol.a[x.s.A.i]) : 0) + (x.s.B ? V.dot(x.s.gB, sol.a[x.s.B.i]) : 0) + x.s.curv; if (Ldd > 1e-9) bad(Ldd, () => { x.on = true; }); } }
      if (!fix) break; fix(); }
    if (!best) best = this.system(N, ext.F, [], []) || { a: this.bodies.map(() => ({ x: 0, y: 0 })), lam: [], k: new Map() };
    // Static friction is only as big as it has to be. Where it is not needed at all (a block at rest on a level floor;
    // two blocks pushed side by side, whose faces nothing drags up or down) the answer is no friction, not some
    // share of the load that the equations would also allow.
    else for (const c of cs) if (c.on && c.mode === 'stick' && this.needless(c, N, ext.F, cs, rs)) best = this.system(N, ext.F, cs, rs);
    // remember how each contact was, and write out every force
    const forces = ext.list.map((l) => l.slice()), ropes = [];
    for (const c of cs) { this.modes.set(c.key, c.on ? c.mode : null); this.modes.set(c.key + ':s', c.s); if (!c.on || !best.k.has(c)) continue; const k = best.k.get(c), ln = best.lam[k.n];
      const fn = V.mul(c.n, ln), ft = c.mode === 'stick' ? V.mul(c.t, best.lam[k.t]) : c.mode === 'slide' ? V.mul(c.t, -c.muK * c.s * ln) : { x: 0, y: 0 }, kindF = c.mode === 'slide' ? 'kinetic' : 'static';
      if (c.mode === 'free') c.mode = 'stick';
      forces[c.i.i].push({ kind: 'normal', F: fn, by: c.by }, { kind: kindF, F: ft, by: c.by });
      if (c.j) forces[c.j.i].push({ kind: 'normal', F: V.mul(fn, -1), by: c.i.el }, { kind: kindF, F: V.mul(ft, -1), by: c.i.el }); }
    for (const x of rs) { x.r.taut = x.on || x.s.L >= x.r.L0 - World.TOL; const T = x.on && best.k.has(x) ? Math.max(0, best.lam[best.k.get(x)]) : 0; ropes.push({ rope: x.r, T, taut: x.on });
      if (x.on) { if (x.s.A) forces[x.s.A.i].push({ kind: 'tension', F: V.mul(x.s.g.pullA, T), by: x.r.el }); if (x.s.B) forces[x.s.B.i].push({ kind: 'tension', F: V.mul(x.s.g.pullB, T), by: x.r.el }); } }
    for (const b of this.bodies) if (b.gone) { best.a[b.i] = { x: 0, y: 0 }; forces[b.i] = []; }
    return { a: best.a, forces, contacts: cs.filter((c) => c.on), ropes }; }

  // Can this sticking contact do without friction? (Nothing then slides along it, and every other rule still holds.)
  // If so it is left frictionless ('free') and true is returned.
  needless(c, N, F, cs, rs) { c.mode = 'free'; const s2 = this.system(N, F, cs, rs);
    const fine = s2 && Math.abs(V.dot(this.rel(c, (b) => s2.a[b.i]), c.t)) < 1e-9 && cs.every((d) => !d.on || s2.lam[s2.k.get(d).n] > -1e-9) && rs.every((x) => !x.on || s2.lam[s2.k.get(x)] > -1e-9);
    if (!fine) c.mode = 'stick'; return !!fine; }

  // One linear solve for a given set of active constraints:
  //   m a_i - (constraint forces on i) = (other forces on i)      for every block
  //   (each active constraint's acceleration condition)            for every constraint
  system(N, F, cs, rs) { const cons = [];
    for (const c of cs) { if (!c.on) continue;
      const ncol = c.mode === 'slide' ? V.sub(c.n, V.mul(c.t, c.muK * c.s)) : c.n, vn = V.dot(this.rel(c, (b) => b.v), c.n);
      cons.push({ owner: c, part: 'n', row: [[c.i, c.n], c.j && [c.j, V.mul(c.n, -1)]], col: [[c.i, ncol], c.j && [c.j, V.mul(ncol, -1)]], rhs: -20 * vn });
      if (c.mode === 'stick') cons.push({ owner: c, part: 't', row: [[c.i, c.t], c.j && [c.j, V.mul(c.t, -1)]], col: [[c.i, c.t], c.j && [c.j, V.mul(c.t, -1)]], rhs: -20 * V.dot(this.rel(c, (b) => b.v), c.t) }); }
    for (const x of rs) { if (!x.on) continue; const s = x.s, terms = [s.A && [s.A, s.gA], s.B && [s.B, s.gB]];
      // (the rope's length is held at L0: what is left of a drift is pulled back gently)
      cons.push({ owner: x, part: 'T', row: terms, col: terms.map((tm) => tm && [tm[0], V.mul(tm[1], -1)]), rhs: -s.curv - 20 * s.Ldot - 100 * (s.L - x.r.L0) }); }
    // Where constraints say the same thing twice (two blocks side by side on one floor: the friction between them
    // could be anything), the answer taken is the one with the smallest constraint forces. Each pass gives every
    // constraint a whisker of give (EPS) toward the last pass's answer; a few passes make it exact.
    const n = 2 * N + cons.length, EPS = 1e-7; let z = null, prev = new Float64Array(cons.length);
    for (let pass = 0; pass < 8; pass++) { const M = Array.from({ length: n }, () => new Float64Array(n + 1));
      for (const b of this.bodies) { M[2 * b.i][2 * b.i] = b.m; M[2 * b.i + 1][2 * b.i + 1] = b.m; M[2 * b.i][n] = F[b.i].x; M[2 * b.i + 1][n] = F[b.i].y; }
      cons.forEach((k, q) => { const r = 2 * N + q;
        for (const e of k.col) if (e) { M[2 * e[0].i][r] -= e[1].x; M[2 * e[0].i + 1][r] -= e[1].y; }
        for (const e of k.row) if (e) { M[r][2 * e[0].i] += e[1].x; M[r][2 * e[0].i + 1] += e[1].y; }
        M[r][r] = -EPS; M[r][n] = k.rhs - EPS * prev[q]; });
      const zz = World.gauss(M, n); if (!zz) return null; let change = 0;
      for (let q = 0; q < cons.length; q++) { change = Math.max(change, Math.abs(zz[2 * N + q] - prev[q])); prev[q] = zz[2 * N + q]; }
      z = zz; if (change < 1e-12 * (1 + Math.max(0, ...Array.from(prev, Math.abs)))) break; }
    const a = this.bodies.map((b) => ({ x: z[2 * b.i], y: z[2 * b.i + 1] })), lam = Array.from(z.slice(2 * N)), kmap = new Map();
    cons.forEach((k, q) => { if (k.part === 'T') kmap.set(k.owner, q); else { const e = kmap.get(k.owner) || {}; e[k.part] = q; kmap.set(k.owner, e); } });
    return { a, lam, k: kmap }; }

  static gauss(M, n) { for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-14) return null; if (p !== c) { const t = M[p]; M[p] = M[c]; M[c] = t; }
      const d = M[c][c]; for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / d; if (f === 0) continue; const Rr = M[r], Rc = M[c]; for (let k = c; k <= n; k++) Rr[k] -= f * Rc[k]; } }
    const z = new Float64Array(n); for (let i = 0; i < n; i++) z[i] = M[i][n] / M[i][i]; return z; }

  // ---- moving on in time ----
  advance(dt) { if (this.stopped) return false; const last = this.rec[this.rec.length - 1]; if (last && last.t > this.t + 1e-9) this.rec = this.rec.filter((r) => r.t <= this.t + 1e-9); const n = Math.max(1, Math.round(dt / World.H)); for (let k = 0; k < n && !this.stopped; k++) this.step(World.H); return true; }
  // Velocity Verlet: move with the acceleration at the start of the step, then take the velocity on with the
  // average of the accelerations at the start and the end. Exact when the forces are steady (most of a course in
  // forces), and it does not let a spring gain energy.
  step(h) { this.impacts(); const P0 = this.power(), sol = this.sol = this.solve(), v0 = this.bodies.map((b) => ({ ...b.v }));
    for (const b of this.bodies) { if (b.gone) continue; const a = sol.a[b.i]; b.p = { x: b.p.x + b.v.x * h + a.x * h * h / 2, y: b.p.y + b.v.y * h + a.y * h * h / 2 }; b.v = { x: b.v.x + a.x * h, y: b.v.y + a.y * h }; }
    // (a slide that comes to a stop within the step is stopped first: friction cannot take it on the other way)
    const stops = sol.contacts.filter((c) => this.modes.get(c.key) === 'slide' && V.dot(this.rel(c, (b) => b.v), c.t) * c.s <= 0);
    if (stops.length) for (const c of stops) { this.stopSlide(c, V.dot(this.rel(c, (b) => b.v), c.t)); this.modes.set(c.key, 'stick'); }
    else { const end = this.solve();
      for (const b of this.bodies) { if (b.gone) continue; const a0 = sol.a[b.i], a1 = end.a[b.i]; b.v = { x: v0[b.i].x + (a0.x + a1.x) * h / 2, y: v0[b.i].y + (a0.y + a1.y) * h / 2 }; } }
    // kinetic friction stops a slide; it does not start one the other way
    for (const c of sol.contacts) { if (this.modes.get(c.key) !== 'slide') continue; const vt = V.dot(this.rel(c, (b) => b.v), c.t);
      if (vt * c.s <= 0) { this.stopSlide(c, vt); this.modes.set(c.key, 'stick'); } }        // (it has come to a stop within this step)
    this.t += h; this.W += (P0 + this.power()) * h / 2; this.settle(); this.check(); this.sol = this.solve();
    if (Math.floor(this.t * World.REC + 1e-6) > Math.floor(this.rec[this.rec.length - 1].t * World.REC + 1e-6)) this.record(); }

  // ---- the recording: every 1/REC s of the run, what the graphs and the motion diagram need, and enough to
  // put the bench back to that moment (restore). Up to MAXREC seconds. ----
  static REC = 60;
  static MAXREC = 120;
  record() { if (this.t > World.MAXREC) return; const sol = this.sol, e = this.energy();
    this.rec.push({ t: this.t, e: { K: e.K, Ug: e.Ug, Us: e.Us, W: this.W, th: Math.max(0, this.E0 + this.W - e.E) },
      b: this.bodies.map((b) => ({ p: { ...b.p }, v: { ...b.v }, a: { ...sol.a[b.i] }, ang: b.ang, gone: b.gone })),
      f: this.bodies.map((b) => (b.gone ? [] : this.forcesOn(b.id).map((f) => ({ k: f.kind + '|' + (f.by ? f.by.id : ''), kind: f.kind, by: f.by ? f.by.id : 0, F: { ...f.F } })))),
      T: this.ropes.map((r) => this.tension(r.id) || 0),
      s: { modes: [...this.modes], taut: this.ropes.map((r) => r.taut), stopped: this.stopped, nev: this.events.length, W: this.W } }); }
  // back to a recorded moment (the recording itself is kept until the clock runs on from there)
  restore(r) { if (!r) return; this.t = r.t; this.bodies.forEach((b, i) => { const x = r.b[i]; b.p = { ...x.p }; b.v = { ...x.v }; b.ang = x.ang; b.gone = x.gone; });
    this.modes = new Map(r.s.modes); this.ropes.forEach((rp, i) => { rp.taut = r.s.taut[i]; }); this.stopped = r.s.stopped; this.events = this.events.slice(0, r.s.nev); this.W = r.s.W; this.sol = this.solve(); }
  at(t) { const R = this.rec; if (!R.length) return null; let lo = 0, hi = R.length - 1; if (t <= R[0].t) return R[0]; if (t >= R[hi].t) return R[hi];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (R[m].t <= t) lo = m; else hi = m; } return t - R[lo].t <= R[hi].t - t ? R[lo] : R[hi]; }
  stopSlide(c, vt) { if (!c.j) { c.i.v = V.sub(c.i.v, V.mul(c.t, vt)); return; } const mi = c.i.m, mj = c.j.m;
    c.i.v = V.sub(c.i.v, V.mul(c.t, vt * mj / (mi + mj))); c.j.v = V.add(c.j.v, V.mul(c.t, vt * mi / (mi + mj))); }
  // a block that lands, or a rope that snaps taut, loses the speed that would break the rule (a perfectly inelastic jolt)
  impacts() { for (let it = 0; it < 30; it++) { let worst = 0;
      for (const c of this.contacts()) { if (c.gap > World.TOL) continue; const vn = V.dot(this.rel(c, (b) => b.v), c.n); if (vn >= -World.VEPS) continue;
        const wi = 1 / c.i.m, wj = c.j ? 1 / c.j.m : 0, P = -vn / (wi + wj); c.i.v = V.add(c.i.v, V.mul(c.n, P * wi)); if (c.j) c.j.v = V.sub(c.j.v, V.mul(c.n, P * wj)); worst = Math.max(worst, -vn); }
      for (const r of this.ropes) { const s = this.ropeState(r); if (!s || s.L < r.L0 - World.TOL || s.Ldot <= World.VEPS) continue;
        const w = (s.A ? V.dot(s.gA, s.gA) / s.A.m : 0) + (s.B ? V.dot(s.gB, s.gB) / s.B.m : 0); if (w <= 0) continue; const P = s.Ldot / w;
        if (s.A) s.A.v = V.sub(s.A.v, V.mul(s.gA, P / s.A.m)); if (s.B) s.B.v = V.sub(s.B.v, V.mul(s.gB, P / s.B.m)); r.taut = true; worst = Math.max(worst, s.Ldot); }
      if (worst < 1e-9) break; } }
  // positions back onto the rules (nothing sunk into anything or hovering just off it, no rope longer than itself), and tilts onto supports
  settle() { for (let it = 0; it < 6; it++) {
      for (const b of this.bodies) { if (b.gone) continue; let best = null; for (const c of this.contacts()) if (c.i === b && c.sup !== null && c.gap <= World.TOL && (!best || c.n.y > best.n.y)) best = c; if (best) b.ang = best.sup; }
      // (a block resting within TOL of a face is set down onto it: left hanging at the edge of TOL it would flicker
      // between touching and not, and a rope tied to it between taut and slack)
      for (const c of this.contacts()) { const vn = V.dot(this.rel(c, (b) => b.v), c.n); if (c.gap === 0 || (c.gap > 0 && Math.abs(vn) > World.VEPS)) continue; const d = -c.gap, wi = 1 / c.i.m, wj = c.j ? 1 / c.j.m : 0;
        c.i.p = V.add(c.i.p, V.mul(c.n, d * wi / (wi + wj))); if (c.j) c.j.p = V.sub(c.j.p, V.mul(c.n, d * wj / (wi + wj))); }
      for (const r of this.ropes) { const s = this.ropeState(r); if (!s) continue; const ex = s.L - r.L0;
        // (too long: pulled in. A whisker short but counted taut and still: let out by its free ends, those not resting on anything)
        let A = s.A, B = s.B; if (ex <= 1e-7) { if (ex >= -1e-7 || ex < -World.TOL || !r.taut || Math.abs(s.Ldot) > World.VEPS) continue;
          const rests = (b) => this.contacts().some((c) => (c.i === b || c.j === b) && c.gap <= World.TOL); if (A && rests(A)) A = null; if (B && rests(B)) B = null; }
        const w = (A ? V.dot(s.gA, s.gA) / A.m : 0) + (B ? V.dot(s.gB, s.gB) / B.m : 0); if (w <= 0) continue; const P = ex / w;
        if (A) A.p = V.sub(A.p, V.mul(s.gA, P / A.m)); if (B) B.p = V.sub(B.p, V.mul(s.gB, P / B.m)); } } }
  // the clock stops when a block runs into a pulley; a block that falls away or goes off the side has left the bench
  check() { for (const r of this.ropes) { const g = r.geo; if (!g || g.direct) continue;
      for (const [end, leg] of [[r.from, g.legA], [r.to, g.legB]]) { const b = this.byId.get(end); if (!b || b.gone) continue; if (leg < Math.min(b.w, b.h) / 2 + 0.01) { this.stopped = { why: 'pulley', id: b.id, text: 'reached the pulley' }; return; } } }
    for (const b of this.bodies) { if (b.gone) continue; const text = b.p.y < World.FALL ? 'fell off the bench' : b.p.x < BOARD.x0 - World.SIDE || b.p.x > BOARD.x1 + World.SIDE ? 'went off the side of the bench' : null; if (!text) continue;
      // (what it carries away leaves the energy books with it: it does not turn into heat)
      this.E0 -= b.m * V.dot(b.v, b.v) / 2 + b.m * this.g * b.p.y; b.gone = true; b.v = { x: 0, y: 0 }; this.events.push({ t: this.t, id: b.id, text });
      if (this.bodies.every((x) => x.gone)) this.stopped = { why: 'gone', text: 'everything has left the bench' }; } }

  // ---- read-outs ----
  body(id) { return this.byId.get(id) || null; }
  forcesOn(id) { const b = this.byId.get(id); return b ? this.sol.forces[b.i].filter((f) => f.kind === 'weight' || f.kind === 'normal' || V.len(f.F) > 1e-6) : []; }
  accel(id) { const b = this.byId.get(id); return b ? this.sol.a[b.i] : null; }
  tension(ropeId) { const r = this.sol.ropes.find((x) => x.rope.id === ropeId); return r ? r.T : null; }
  // kinetic, gravitational (zero at y = 0) and spring energy
  energy() { let K = 0, Ug = 0, Us = 0; for (const b of this.bodies) { if (b.gone) continue; K += b.m * V.dot(b.v, b.v) / 2; Ug += b.m * this.g * b.p.y; }
    for (const s of this.springs) { const pa = this.posOf(s.from), pb = this.posOf(s.to); if (pa && pb) { const x = V.dist(pa, pb) - s.rest; Us += s.k * x * x / 2; } } return { K, Ug, Us, U: Ug + Us, E: K + Ug + Us }; }
}
