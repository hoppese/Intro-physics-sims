// =====================================================================
// Lab -- the state of the page: which world and preset, the setup it was
// built from (the bodies' starting values, which the panel and the canvas
// edit), the running World, the clock, what is drawn, and the view. Any change
// to the setup builds the World again from t = 0. Loads paused.
// =====================================================================
class Lab {
  static SPEEDS = [1, 0.25, 0.05];          // full speed, a quarter, a twentieth (to watch a collision happen)
  static SHOW = [['p', 'Momentum', 'Each body’s momentum: its mass times its velocity'], ['P', 'Total momentum', 'The total momentum of everything, drawn from the centre of mass'], ['cm', 'Centre of mass', 'The centre of mass of everything, and its path'],
    ['forces', 'Forces', 'The forces the bodies exert on each other: always in equal and opposite pairs'], ['v', 'Velocity', 'Each body’s velocity'], ['trails', 'Paths', 'Where each body has been']];
  static MAX = 6;
  constructor() { this.view = new View(); this.show = { p: true, P: true, cm: true, forces: true, v: false, trails: true }; this.hidden = false; this.playing = false; this.speed = 1;
    this.graph = 'momentum'; this.axis = 'x'; this.close = false; this.sel = null; this.rev = 0; this.dirty = true; this.load('track', 'equal'); }
  get M() { return MODES[this.mode]; }
  get oneD() { return this.M.oneD; }
  bump() { this.rev++; this.dirty = true; }

  // ---- choosing ----
  load(mode, key) { if (!MODES[mode]) return false; this.mode = mode; this.setup = setupOf(mode, key); this.sel = null; this.playing = false; this.close = false; if (this.oneD) this.axis = 'x';
    this.build(); this.scales(); this.view.frame(this.setup.view); this.bump(); return true; }
  get preset() { return PRESET(this.mode, this.setup.preset); }
  build() { this.world = new World(this.setup); const w = this.world;
    this.before = { bodies: w.main.map((b) => ({ id: b.id, name: b.name, m: b.m, v: { ...b.v }, p: V.mul(b.v, b.m), K: 0.5 * b.m * V.dot(b.v, b.v) })), P: w.P, K: w.K, U: w.U, cmv: V.mul(w.P, 1 / w.M) }; this.bump(); }
  // arrow scales, fixed when a preset is loaded (so that editing a value changes the arrow's length, not the scale)
  scales() { const w = this.world, p = Math.max(1e-30, ...w.main.map((b) => b.m * V.len(b.v)), V.len(w.P)), v = Math.max(1e-30, ...w.main.map((b) => V.len(b.v)));
    let F = 0; const w1 = Math.PI / (2 * w.tc);
    for (let i = 0; i < w.main.length; i++) for (let j = i + 1; j < w.main.length; j++) { const a = w.main[i], b = w.main[j], mu = a.m * b.m / (a.m + b.m); if (this.mode !== 'space') F = Math.max(F, mu * w1 * V.dist(a.v, b.v)); }
    for (const c of w.charges) { const mu = c.a.m * c.b.m / (c.a.m + c.b.m), ws = Math.PI / (2 * World.TS); F = Math.max(F, Math.sqrt(2 * c.E * mu * ws * ws)); }
    for (const q of w.pairs) F = Math.max(F, V.len(q.F)); for (const b of w.main) if (b.rk) F = Math.max(F, b.rk.rate * b.rk.u);
    this.ref = { p, v, F: Math.max(F, 1e-30) }; }

  // ---- editing the setup (each change starts again from t = 0) ----
  edit(fn) { this.playing = false; fn(this.setup); this.setup.edited = true; this.build(); return true; }
  body(id) { return this.setup.bodies.find((b) => b.id === id) || null; }
  select(id) { this.sel = id && this.body(id) ? id : null; this.bump(); }
  // the editable values of a body: { key, label, sym, unit, k (display units per SI), min, max }
  fields(b) { const M = this.M, L = M.L, sp = this.mode === 'space', out = [{ key: 'm', label: 'Mass', sym: 'm', unit: 'kg', k: 1, min: sp ? 1 : 0.005, max: sp ? 1e32 : 50 }];
    if (!this.oneD) out.push({ key: 'R', label: 'Radius', sym: 'R', unit: M.lu, k: L, min: sp ? 0 : 0.012, max: sp ? 2e9 : 0.2 });
    if (b && b.rocket) out.push({ key: 'fuel', label: 'Fuel', sym: 'm', sub: 'fuel', unit: 'kg', k: 1, min: 0, max: 1e7, rk: true }, { key: 'rate', label: 'Burn rate', sym: 'R', unit: 'kg/s', k: 1, min: 0.01, max: 1e5, rk: true },
      { key: 'u', label: 'Exhaust speed', sym: 'u', unit: M.vu, k: L, min: 1, max: 2e4, rk: true }, { key: 'ang', label: 'Points at', sym: 'θ', unit: '°', k: 1, min: -360, max: 360, rk: true }, { key: 'start', label: 'Fires at', sym: 't', unit: 's', k: 1, min: 0, max: 600, rk: true });
    return out; }
  setField(id, key, val) { const b = this.body(id), f = this.fields(b).find((x) => x.key === key); val = Number(val); if (!b || !f || !isFinite(val)) return false; val = Math.max(f.min, Math.min(f.max, val)) * f.k;
    return this.edit(() => { if (key === 'fuel') { const dry = b.m - b.rocket.fuel; b.rocket.fuel = val; b.m = dry + val; } else if (f.rk) b.rocket[key] = val; else b[key] = val;
      if (key === 'm' && b.rocket) b.rocket.fuel = Math.min(b.rocket.fuel, 0.95 * b.m); if (key === 'R') this.unstick(b); }); }
  // r⃗₀ and v⃗₀, one component at a time (in display units)
  setVec(id, which, c, val) { const b = this.body(id); val = Number(val); if (!b || !isFinite(val) || (this.oneD && c === 'y')) return false; const L = this.M.L;
    return this.edit(() => { if (which === 'r') { const d = val * L - b[c]; this.moveWith(b, c === 'x' ? { x: d, y: 0 } : { x: 0, y: d }); } else b[c === 'x' ? 'vx' : 'vy'] = val * L; }); }
  // drag a body (and anything latched to it) to p; it is set down clear of the others
  place(id, p) { const b = this.body(id); if (!b) return false; const sn = this.snap, q = { x: sn ? Math.round(p.x / sn) * sn : p.x, y: this.oneD ? 0 : sn ? Math.round(p.y / sn) * sn : p.y };
    return this.edit(() => { this.moveWith(b, V.sub(q, b)); this.unstick(b); }); }
  setV0(id, v) { const b = this.body(id); if (!b) return false; const k = this.vsnap; return this.edit(() => { b.vx = Math.round(v.x / k) * k; b.vy = this.oneD ? 0 : Math.round(v.y / k) * k; }); }
  get snap() { return this.M.snap || Lab.nice(this.view.width / 300); }
  get vsnap() { return this.mode === 'space' ? Lab.nice(this.ref.v / 200) : 0.01; }
  static nice(x) { const p = Math.pow(10, Math.floor(Math.log10(x))), m = x / p; return (m < 2 ? 1 : m < 5 ? 2 : 5) * p; }
  partners(b) { const ids = new Set([b.id]); let more = true; while (more) { more = false; for (const c of this.setup.charges) if (ids.has(c.a) !== ids.has(c.b)) { ids.add(c.a); ids.add(c.b); more = true; } } return this.setup.bodies.filter((x) => ids.has(x.id)); }
  moveWith(b, d) { for (const x of this.partners(b)) { x.x += d.x; x.y += d.y; } }
  // push a body (and its partners) out of any other it overlaps, along the line between them
  unstick(b) { const mine = this.partners(b); for (let k = 0; k < 8; k++) { let moved = false;
      for (const o of this.setup.bodies) { if (mine.includes(o)) continue; for (const x of mine) { const d = V.dist(x, o), need = x.R + o.R + 1e-3 * (this.mode === 'space' ? 1e3 : 1); if (d >= need) continue;
        const n = d > 1e-12 ? V.mul(V.sub(x, o), 1 / d) : { x: 1, y: 0 }; this.moveWith(b, V.mul(this.oneD ? { x: Math.sign(n.x) || 1, y: 0 } : n, need - d)); moved = true; } }
      if (!moved) return; } }
  setE(e) { e = Math.max(0, Math.min(1, Number(e))); if (!isFinite(e)) return false; return this.edit((s) => { s.e = Math.round(e * 100) / 100; }); }
  setCharge(key, val) { val = Number(val); const c = this.setup.charges[0]; if (!c || !isFinite(val)) return false; return this.edit(() => { c[key] = Math.max(key === 'E' ? 0.001 : 0, Math.min(key === 'E' ? 50 : 30, val)); }); }
  add() { const S = this.setup, n = S.bodies.length; if (n >= Lab.MAX) return null; const id = NAMES.find((x) => !S.bodies.some((b) => b.id === x)), i = NAMES.indexOf(id);
    let b; if (this.mode === 'space') { const big = S.bodies.reduce((a, x) => (x.m > a.m ? x : a), S.bodies[0]) || { m: 5.972e24, x: 0, y: 0, R: 6.371e6, vx: 0, vy: 0 };
      const far = Math.max(big.R * 3, ...S.bodies.map((x) => V.dist(x, big))) * 1.4, m = big.m * 0.004, v = Math.sqrt(GRAV * big.m / far);
      b = body(i, m, Math.max(big.R * 0.25, 0), big.x, big.y + far, big.vx - v, big.vy, { kind: 'planet' }); }
    else { const R = this.M.size; b = body(i, this.oneD ? 0.5 : 0.2, R, 0, 0, 0, 0); const ok = (x, y) => S.bodies.every((o) => V.dist({ x, y }, o) > o.R + R + 0.02);
      const spots = []; if (this.oneD) for (let x = -1.2; x <= 1.21; x += 0.1) spots.push({ x, y: 0 }); else for (let y = 0.45; y >= -0.46; y -= 0.15) for (let x = -0.9; x <= 0.91; x += 0.15) spots.push({ x, y });
      const s = spots.find((q) => ok(q.x, q.y)); if (!s) return null; b.x = Math.round(s.x * 100) / 100; b.y = Math.round(s.y * 100) / 100; }
    this.edit(() => S.bodies.push(b)); this.sel = b.id; return b.id; }
  remove(id) { const S = this.setup; if (!this.body(id) || S.bodies.length <= 1) return false; this.sel = null; return this.edit(() => { S.bodies = S.bodies.filter((b) => b.id !== id); S.charges = S.charges.filter((c) => c.a !== id && c.b !== id); }); }

  // ---- the clock ----
  get time() { return this.world.t; }
  get warp() { return this.setup.warp || 1; }
  play() { if (this.world.done) this.build(); this.playing = true; this.bump(); }
  pause() { if (!this.playing) return; this.playing = false; this.bump(); }
  toggle() { if (this.playing) this.pause(); else this.play(); }
  reset() { this.playing = false; this.build(); }
  step() { this.playing = false; if (this.world.done) return; this.world.advance(this.warp * this.speed / 30); this.bump(); }
  tick(dt) { if (!this.playing) return false; this.world.advance(Math.min(dt, 0.1) * this.speed * this.warp); if (this.world.done) this.playing = false; this.dirty = true; return true; }
  get atStart() { return this.world.t === 0; }

  // ---- what is drawn ----
  hide(on) { on = !!on; if (on === this.hidden) return; this.hidden = on; this.bump(); }
  toggleShow(k) { if (!(k in this.show)) return; this.show[k] = !this.show[k]; this.bump(); }
  setGraph(k) { if (!['momentum', 'force', 'energy', 'off'].includes(k)) return; this.graph = k; this.bump(); }

  // ---- what the page reports to whoever embeds it ----
  snapshot() { const w = this.world, r = (x) => Number(x.toPrecision(6)), vec = (v) => ({ x: r(v.x), y: r(v.y) });
    return { mode: this.mode, preset: this.setup.preset, edited: !!this.setup.edited, e: this.setup.e, t: r(w.t), status: w.note || '', hidden: this.hidden,
      bodies: w.main.map((b) => ({ name: b.name, m: r(b.m), r: vec(b.p), v: vec(b.v), p: vec(V.mul(b.v, b.m)) })), P: vec(w.P), K: r(w.K) }; }
}
