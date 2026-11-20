// =====================================================================
// The five situations, each a small exact model with its own settings:
//   puck      a puck on a frictionless table, tied to a peg: the tension is the centripetal force
//   flat      a car on a flat curve: static friction is; too fast and the car skids off along a straight line
//   banked    a car on a banked curve: the normal force leans in, friction acts up or down the bank as needed
//   conical   a ball swinging in a horizontal circle on a string (a conical pendulum)
//   vertical  a ball on a string, or a car inside a loop, going round a vertical circle: its speed changes,
//             and a string can go slack (a car can leave the track) where the speed is too low
// now() gives the moment shown: where the object is, its velocity and acceleration, every force on it, the circle
// (centre c, radius R, inward unit r̂, forward t̂, and ẑ across the plane of the circle), and a status line when
// something gives out. SI units; z is up; g = 9.8 m/s².
// =====================================================================
const G = 9.8;

class Situation {
  static H = 1 / 1200;                         // s: one step of the clock
  static ROADS = [['dry', 'Dry road', 0.8, 0.6], ['wet', 'Wet road', 0.5, 0.35], ['icy', 'Icy road', 0.1, 0.08]];
  constructor() { this.vals = {}; this.variant = this.constructor.VARIANTS ? this.constructor.VARIANTS[0][0] : null; this.road = 'dry'; this.defaults(); }
  // the settings, as { key, label, sym, sub, unit, min, max, step, init } (they can depend on the variant)
  get specs() { return this.constructor.P; }
  spec(key) { return this.specs.find((s) => s.key === key) || null; }
  defaults() { this.vals = {}; for (const s of this.specs) this.vals[s.key] = s.init; this.reset(); }
  set(key, v) { const s = this.spec(key); v = Number(v); if (!s || !isFinite(v)) return false; v = Math.max(s.min, Math.min(s.max, v)); this.vals[key] = Math.round(v * 1e6) / 1e6; this.reset(); return true; }
  setVariant(k) { if (!this.constructor.VARIANTS || !this.constructor.VARIANTS.some((x) => x[0] === k) || k === this.variant) return false; this.variant = k; this.defaults(); return true; }
  setRoad(k) { if (!Situation.ROADS.some((x) => x[0] === k)) return false; this.road = k; this.reset(); return true; }
  get mu() { const r = Situation.ROADS.find((x) => x[0] === this.road); return { s: r[2], k: r[3], name: r[1] }; }
  reset() { this.t = 0; this.done = null; this.event = null; this.init(); }
  // run the clock on by dt (in small steps); stops for good when something ends the motion (`done`)
  advance(dt) { if (this.done) return; const n = Math.max(1, Math.ceil(dt / Situation.H - 1e-9)), h = dt / n; for (let i = 0; i < n && !this.done; i++) { this.step(h); this.t += h; } }
  // forces as drawn and listed: { kind, F (vector), by }
  static force(kind, F, by) { return { kind, F, by }; }
  // a moment on a horizontal circle of radius R about the z axis, at angle phi, going counter-clockwise (seen from above) at speed v
  static round(R, phi, v, z) { const c = Math.cos(phi), s = Math.sin(phi), out = { x: c, y: s, z: 0 };
    return { p: { x: R * c, y: R * s, z }, v: { x: -v * s, y: v * c, z: 0 }, a: V3.mul(out, -v * v / R), c: { x: 0, y: 0, z }, R, rhat: V3.mul(out, -1), that: { x: -s, y: c, z: 0 }, zhat: V3.Z, onCircle: true }; }
}

// ---- a puck on a string ----
class Puck extends Situation {
  static NAME = 'Puck on a string';
  static P = [{ key: 'm', label: 'Mass', sym: 'm', unit: 'kg', min: 0.1, max: 2, step: 0.05, init: 0.5 }, { key: 'r', label: 'Radius', sym: 'r', unit: 'm', min: 0.3, max: 1.5, step: 0.05, init: 0.8 },
    { key: 'v', label: 'Speed', sym: 'v', unit: 'm/s', min: 0.2, max: 6, step: 0.1, init: 2.4 }];
  static TABLE = 1.8;        // m: the table's radius
  static PUCK = 0.12;        // m: the puck's radius
  init() { this.phi = -Math.PI / 2; this.cut = null; }
  step(h) { const { r, v } = this.vals; if (!this.cut) { this.phi += v / r * h; return; }
    this.cut.p = V3.at(this.cut.p, this.cut.v, h); if (Math.hypot(this.cut.p.x, this.cut.p.y) > Puck.TABLE - Puck.PUCK) this.done = 'The puck slid off the edge of the table, in a straight line from where the string was cut.'; }
  // cut the string (or tie it back on, which starts again)
  snip() { if (this.cut) { this.reset(); return; } const n = this.now(); this.cut = { p: n.p, v: n.v, t: this.t }; this.event = 'The string is cut: no force pulls the puck toward the centre, so it carries straight on.'; }
  now() { const { m, r, v } = this.vals, z = 0.025, w = Situation.force('weight', { x: 0, y: 0, z: -m * G }), n = Situation.force('normal', { x: 0, y: 0, z: m * G }, 'the table');
    if (this.cut) return { p: this.cut.p, v: this.cut.v, a: V3.O, c: { x: 0, y: 0, z }, R: r, rhat: null, that: V3.unit(this.cut.v), zhat: V3.Z, onCircle: false, forces: [w, n], m };
    const k = Situation.round(r, this.phi, v, z); return { ...k, forces: [w, n, Situation.force('tension', V3.mul(k.rhat, m * v * v / r), 'the string')], m }; }
}

// ---- a car on a flat curve ----
class FlatCurve extends Situation {
  static NAME = 'Car on a flat curve';
  static P = [{ key: 'm', label: 'Mass', sym: 'm', unit: 'kg', min: 600, max: 2500, step: 50, init: 1200 }, { key: 'r', label: 'Radius', sym: 'r', unit: 'm', min: 15, max: 120, step: 1, init: 45 },
    { key: 'v', label: 'Speed', sym: 'v', unit: 'm/s', min: 1, max: 35, step: 0.5, init: 15 }];
  static ROAD = 4;           // m: half the road's width
  init() { this.phi = -Math.PI / 2; this.skid = null; this.check(); }
  get need() { const { m, r, v } = this.vals; return m * v * v / r; }
  get most() { return this.mu.s * this.vals.m * G; }
  get vmax() { return Math.sqrt(this.mu.s * G * this.vals.r); }
  check() { if (this.skid || this.need <= this.most + 1e-9) return; const k = Situation.round(this.vals.r, this.phi, this.vals.v, 0.6); this.skid = { p: k.p, v: k.v };
    this.event = 'Too fast for a ' + this.mu.name.toLowerCase() + ': going round takes m v²/r = ' + Fmt.N(this.need) + ' of friction, but static friction can give at most μs n = ' + Fmt.N(this.most) + '. The tyres slide, and the car skids on in a nearly straight line.'; }
  step(h) { const { r, v } = this.vals; if (!this.skid) { this.phi += v / r * h; return; }
    const s = this.skid, sp = V3.len(s.v), dv = Math.min(sp, this.mu.k * G * h); if (sp > 0) s.v = V3.mul(s.v, (sp - dv) / sp); s.p = V3.at(s.p, s.v, h);
    if (Math.hypot(s.p.x, s.p.y) > r + FlatCurve.ROAD + 1) this.done = 'The car skidded off the road.'; else if (V3.len(s.v) < 1e-6) this.done = 'The car skidded to a stop.'; }
  now() { const { m, r, v } = this.vals, w = Situation.force('weight', { x: 0, y: 0, z: -m * G }), n = Situation.force('normal', { x: 0, y: 0, z: m * G }, 'the road');
    if (this.skid) { const s = this.skid, sp = V3.len(s.v), f = sp > 1e-9 ? V3.mul(s.v, -this.mu.k * m * G / sp) : V3.O;
      return { p: s.p, v: s.v, a: V3.mul(f, 1 / m), c: { x: 0, y: 0, z: 0.6 }, R: r, rhat: null, that: sp > 1e-9 ? V3.unit(s.v) : { x: 1, y: 0, z: 0 }, zhat: V3.Z, onCircle: false, forces: [w, n, Situation.force('kinetic', f, 'the road')], m }; }
    const k = Situation.round(r, this.phi, v, 0.6); return { ...k, forces: [w, n, Situation.force('static', V3.mul(k.rhat, m * v * v / r), 'the road')], m }; }
}

// ---- a car on a banked curve ----
class BankedCurve extends Situation {
  static NAME = 'Car on a banked curve';
  static P = [{ key: 'm', label: 'Mass', sym: 'm', unit: 'kg', min: 600, max: 2500, step: 50, init: 1200 }, { key: 'r', label: 'Radius', sym: 'r', unit: 'm', min: 15, max: 120, step: 1, init: 45 },
    { key: 'bank', label: 'Bank angle', sym: 'θ', unit: '°', min: 0, max: 40, step: 1, init: 20 }, { key: 'v', label: 'Speed', sym: 'v', unit: 'm/s', min: 1, max: 35, step: 0.5, init: 15 }];
  static ROAD = 4;
  init() { this.phi = -Math.PI / 2; this.slip = null; this.check(); }
  get th() { return this.vals.bank * Math.PI / 180; }
  // the speed at which no friction is needed
  get design() { return Math.sqrt(G * this.vals.r * Math.tan(this.th)); }
  // what it takes to go round: the normal force, and the friction along the bank (+ down it, toward the centre)
  get needs() { const { m, r, v } = this.vals, c = Math.cos(this.th), s = Math.sin(this.th), ac = v * v / r; return { n: m * (G * c + ac * s), f: m * (ac * c - G * s) }; }
  check() { const { n, f } = this.needs; if (Math.abs(f) <= this.mu.s * n + 1e-9) return; this.slip = f > 0 ? 'up' : 'down';
    this.done = (f > 0 ? 'Too fast for this bank: it needs ' + Fmt.N(f) + ' of friction down the bank' : 'Too slow for this bank: it needs ' + Fmt.N(-f) + ' of friction up the bank') + ', but static friction can give at most μs n = ' + Fmt.N(this.mu.s * n) + '. The car slides ' + this.slip + ' the bank. Design speed (no friction needed): ' + Fmt.vel(this.design) + '.'; }
  // the bank at the car: unit vectors out of the road, and down the slope toward the centre
  frame(k) { const c = Math.cos(this.th), s = Math.sin(this.th); return { nhat: V3.add(V3.mul(V3.Z, c), V3.mul(k.rhat, s)), down: V3.sub(V3.mul(k.rhat, c), V3.mul(V3.Z, s)) }; }
  step(h) { if (this.slip) return; this.phi += this.vals.v / this.vals.r * h; }
  now() { const { m, r, v } = this.vals, k = Situation.round(r, this.phi, v, 0.6), fr = this.frame(k), { n, f } = this.needs;
    const forces = [Situation.force('weight', { x: 0, y: 0, z: -m * G }), Situation.force('normal', V3.mul(fr.nhat, n), 'the road')];
    if (Math.abs(f) > 1e-6 * m * G) forces.push(Situation.force('static', V3.mul(fr.down, f), 'the road'));
    return { ...k, forces, m, bank: fr }; }
}

// ---- a conical pendulum ----
class Conical extends Situation {
  static NAME = 'Conical pendulum';
  static P = [{ key: 'm', label: 'Mass', sym: 'm', unit: 'kg', min: 0.1, max: 3, step: 0.05, init: 0.5 }, { key: 'L', label: 'String length', sym: 'L', unit: 'm', min: 0.3, max: 2, step: 0.05, init: 1.2 },
    { key: 'angle', label: 'Angle from vertical', sym: 'θ', unit: '°', min: 5, max: 75, step: 1, init: 30 }];
  init() { this.phi = -Math.PI / 2; }
  get th() { return this.vals.angle * Math.PI / 180; }
  get r() { return this.vals.L * Math.sin(this.th); }
  get speed() { return Math.sqrt(G * this.r * Math.tan(this.th)); }
  get pivot() { return { x: 0, y: 0, z: this.vals.L + 0.35 }; }
  step(h) { this.phi += this.speed / this.r * h; }
  now() { const { m, L } = this.vals, k = Situation.round(this.r, this.phi, this.speed, this.pivot.z - L * Math.cos(this.th)), T = m * G / Math.cos(this.th);
    return { ...k, forces: [Situation.force('weight', { x: 0, y: 0, z: -m * G }), Situation.force('tension', V3.mul(V3.unit(V3.sub(this.pivot, k.p)), T), 'the string')], m }; }
}

// ---- a vertical circle: a ball on a string, or a car inside a loop ----
class Vertical extends Situation {
  static NAME = 'Vertical circle';
  static VARIANTS = [['string', 'Ball on a string'], ['loop', 'Car in a loop']];
  static PS = {
    string: [{ key: 'm', label: 'Mass', sym: 'm', unit: 'kg', min: 0.1, max: 2, step: 0.05, init: 0.5 }, { key: 'r', label: 'Radius', sym: 'r', unit: 'm', min: 0.4, max: 1.5, step: 0.05, init: 0.8 },
      { key: 'vb', label: 'Bottom speed', sym: 'v', sub: 'bottom', unit: 'm/s', min: 0, max: 12, step: 0.1, init: 6.6 }],
    loop: [{ key: 'm', label: 'Mass', sym: 'm', unit: 'kg', min: 200, max: 1500, step: 50, init: 500 }, { key: 'r', label: 'Radius', sym: 'r', unit: 'm', min: 4, max: 15, step: 0.5, init: 7 },
      { key: 'vb', label: 'Bottom speed', sym: 'v', sub: 'bottom', unit: 'm/s', min: 0, max: 30, step: 0.5, init: 19 }] };
  get specs() { return Vertical.PS[this.variant]; }
  get base() { return this.variant === 'loop' ? 0 : 0.35; }
  get c() { return { x: 0, y: 0, z: this.base + this.vals.r }; }
  // the speed the top needs (√(g r)), and the bottom speed that gives it (√(5 g r))
  get vtop() { return Math.sqrt(G * this.vals.r); }
  get vbmin() { return Math.sqrt(5 * G * this.vals.r); }
  init() { this.al = 0; this.om = this.vals.vb / this.vals.r; this.free = null; }
  // angle `al` from the bottom, going round toward +x at the bottom; the circle is in the x-z plane
  at(al) { return V3.add(this.c, { x: this.vals.r * Math.sin(al), y: 0, z: -this.vals.r * Math.cos(al) }); }
  pull(al, om) { const { m, r } = this.vals; return m * (om * om * r + G * Math.cos(al)); }       // the string's tension (or the track's push), inward
  step(h) { const { r } = this.vals;
    if (!this.free) { const f = (a, o) => [o, -G / r * Math.sin(a)]; const [k1a, k1o] = f(this.al, this.om), [k2a, k2o] = f(this.al + k1a * h / 2, this.om + k1o * h / 2), [k3a, k3o] = f(this.al + k2a * h / 2, this.om + k2o * h / 2), [k4a, k4o] = f(this.al + k3a * h, this.om + k3o * h);
      const al = this.al + (k1a + 2 * k2a + 2 * k3a + k4a) * h / 6, om = this.om + (k1o + 2 * k2o + 2 * k3o + k4o) * h / 6;
      if (this.pull(al, om) < 0) { const p = this.at(this.al), tv = { x: Math.cos(this.al), y: 0, z: Math.sin(this.al) }; this.free = { p, v: V3.mul(tv, this.om * r) };
        this.event = this.variant === 'loop' ? 'Too slow up there: the track would have to pull the car in (n < 0), which it cannot. The car leaves the track and falls like a projectile.' : 'Too slow up there: the string would have to push (T < 0), which it cannot. It goes slack, and the ball falls like a projectile until the string is taut again.'; return; }
      this.al = al; this.om = om; return; }
    const s = this.free; s.v = V3.add(s.v, { x: 0, y: 0, z: -G * h }); s.p = V3.at(s.p, s.v, h);
    const d = V3.sub(s.p, this.c), L = V3.len(d); if (L >= r) { const out = V3.mul(d, 1 / L), vr = V3.dot(s.v, out); s.p = V3.add(this.c, V3.mul(out, r));
      if (vr > 0) s.v = V3.sub(s.v, V3.mul(out, vr));                      // the string snaps taut / the car lands on the track: a jolt takes the outward speed
      this.al = Math.atan2(out.x, -out.z); this.om = V3.dot(s.v, { x: Math.cos(this.al), y: 0, z: Math.sin(this.al) }) / r; this.free = null;
      if (this.pull(this.al, this.om) < 0) this.free = { p: s.p, v: s.v }; } }
  now() { const { m, r } = this.vals, w = Situation.force('weight', { x: 0, y: 0, z: -m * G }), kind = this.variant === 'loop' ? 'normal' : 'tension', by = this.variant === 'loop' ? 'the track' : 'the string';
    if (this.free) { const s = this.free, d = V3.sub(this.c, s.p); return { p: s.p, v: s.v, a: { x: 0, y: 0, z: -G }, c: this.c, R: r, rhat: V3.len(d) > 1e-9 ? V3.unit(d) : null, that: V3.unit(s.v), zhat: { x: 0, y: -1, z: 0 }, onCircle: false, forces: [w], m, slack: true }; }
    const p = this.at(this.al), rhat = { x: -Math.sin(this.al), y: 0, z: Math.cos(this.al) }, that = { x: Math.cos(this.al), y: 0, z: Math.sin(this.al) }, v = V3.mul(that, this.om * r);
    const N = this.pull(this.al, this.om), at = -G * Math.sin(this.al), a = V3.add(V3.mul(rhat, this.om * this.om * r), V3.mul(that, at));
    return { p, v, a, c: this.c, R: r, rhat, that: this.om >= 0 ? that : V3.mul(that, -1), zhat: { x: 0, y: -1, z: 0 }, onCircle: true, forces: [w, Situation.force(kind, V3.mul(rhat, Math.max(0, N)), by)], m }; }
}

// ---- a Ferris wheel: a rider going round a vertical circle at a steady speed ----
// The gondola stays level, so the seat can only push straight up (the normal force) and grip sideways (static
// friction). Together with gravity they must add up to m v²/r toward the centre: n = m(g − v²/r) at the top and
// m(g + v²/r) at the bottom; at the sides friction alone gives m v²/r. (A car in a loop is different: the track
// pushes toward the centre, and gravity changes its speed.)
class Ferris extends Situation {
  static NAME = 'Ferris wheel';
  static P = [{ key: 'm', label: 'Rider’s mass', sym: 'm', unit: 'kg', min: 20, max: 120, step: 1, init: 62 }, { key: 'r', label: 'Radius', sym: 'r', unit: 'm', min: 5, max: 40, step: 0.5, init: 18 },
    { key: 'v', label: 'Speed', sym: 'v', unit: 'm/s', min: 0.5, max: 16, step: 0.1, init: 3.6 }];
  static CARS = 8;
  get c() { return { x: 0, y: 0, z: this.vals.r + 2.5 }; }
  get vtop() { return Math.sqrt(G * this.vals.r); }                  // faster than this, the seat can't hold the rider at the top
  init() { this.al = 0; const { v, r } = this.vals; this.event = v * v / r > G ? 'Faster than √(g r) = ' + Fmt.vel(this.vtop) + ': near the top, gravity is less than m v²/r, so the seat would have to pull the rider down. Only the lap bar keeps them in.' : null; }
  step(h) { this.al += this.vals.v / this.vals.r * h; }
  // angle `al` from the bottom, going round toward +x at the bottom; the wheel is in the x-z plane
  at(al) { return V3.add(this.c, { x: this.vals.r * Math.sin(al), y: 0, z: -this.vals.r * Math.cos(al) }); }
  now() { const { m, r, v } = this.vals, al = this.al, p = this.at(al), rhat = { x: -Math.sin(al), y: 0, z: Math.cos(al) }, that = { x: Math.cos(al), y: 0, z: Math.sin(al) }, a = V3.mul(rhat, v * v / r);
    const S = V3.add(V3.mul(a, m), { x: 0, y: 0, z: m * G }), forces = [Situation.force('weight', { x: 0, y: 0, z: -m * G })];
    forces.push(Situation.force('normal', { x: 0, y: 0, z: S.z }, S.z >= 0 ? 'the seat' : 'the lap bar')); if (Math.abs(S.x) > 1e-6 * m * G) forces.push(Situation.force('static', { x: S.x, y: 0, z: 0 }, 'the seat'));
    return { p, v: V3.mul(that, v), a, c: this.c, R: r, rhat, that, zhat: { x: 0, y: -1, z: 0 }, onCircle: true, forces, m }; }
}

// ---- a satellite in orbit round the Earth ----
// Gravity GMm/r² is the only force. At the circular speed √(GM/r) it is exactly m v²/r and the satellite goes
// round; slower, gravity is more than m v²/r and it falls inward (an ellipse whose far point is here, or into the
// ground); faster, it swings outward (an ellipse whose near point is here); at √(2GM/r) or more it never comes back.
// The orbit lies in the x-y plane. Settings are in km and km/s; inside, metres. The clock runs fast (one circular
// orbit at the starting height takes about 12 s to watch) and reads in minutes.
class Orbit extends Situation {
  static NAME = 'Satellite in orbit';
  static GM = 3.986e14;      // m³/s²: the Earth's G M
  static RE = 6.371e6;       // m: the Earth's radius
  static WATCH = 12;         // s of watching for one circular orbit at the starting height
  static TRAIL = Infinity;   // the trail keeps the whole path
  static P = [{ key: 'm', label: 'Mass', sym: 'm', unit: 'kg', min: 100, max: 2000, step: 10, init: 650 }, { key: 'alt', label: 'Height', sym: 'h', unit: 'km', min: 200, max: 40000, step: 10, init: 400 },
    { key: 'v', label: 'Speed', sym: 'v', unit: 'km/s', min: 1, max: 12, step: 0.01, init: 7.67 }];
  get r0() { return Orbit.RE + this.vals.alt * 1000; }
  get vcirc() { return Math.sqrt(Orbit.GM / this.r0); }                  // m/s, at the starting height
  get vesc() { return Math.sqrt(2 * Orbit.GM / this.r0); }
  get circular() { return Math.abs(this.vals.v * 1000 - this.vcirc) < 1e-3; }
  defaults() { super.defaults(); this.setCircular(); }
  // the speed that goes round in a circle at this height (kept when the height changes, if it was circular)
  setCircular() { this.vals.v = Math.round(this.vcirc * 1000) / 1e6; this.reset(); }
  set(key, v) { const was = this.circular, ok = super.set(key, v); if (ok && key === 'alt' && was) this.setCircular(); return ok; }
  init() { const r0 = this.r0, v0 = this.vals.v * 1000; this.crashed = false; this.p = { x: 0, y: -r0, z: 0 }; this.vel = { x: v0, y: 0, z: 0 };
    this.warp = 2 * Math.PI * r0 / this.vcirc / Orbit.WATCH; this.h = 2 * Math.PI * r0 / this.vcirc / 6000; this.shape = Orbit.conic(this.p, this.vel);
    const c = this.shape, far = c.bound ? Math.max(c.ra, r0) : 3 * r0; this.extent = Math.max(r0 * 1.3, Math.min(far, 7 * r0) * 1.08); this.edge = this.extent * 1.25;
    const vc = this.vcirc, v = v0, gm = Fmt.N(Orbit.GM * this.vals.m / (r0 * r0)), mv = Fmt.N(this.vals.m * v * v / r0);
    this.event = Math.abs(v - vc) < 1 ? null : !c.bound ? 'At or above the escape speed √(2GM/r) = ' + Orbit.kms(this.vesc) + ': gravity bends the path but can never bring it back.'
      : v < vc ? 'Slower than the circular speed ' + Orbit.kms(vc) + ': gravity (' + gm + ') is more than m v²/r (' + mv + '), so it falls inward. Here is the far point of an ellipse.' + (c.rp < Orbit.RE ? ' That ellipse runs into the Earth.' : '')
        : 'Faster than the circular speed ' + Orbit.kms(vc) + ': gravity (' + gm + ') is less than m v²/r (' + mv + '), so it swings outward. Here is the near point of an ellipse.'; }
  static kms(x) { return Fmt.sig(x / 1000, 3) + ' km/s'; }
  static km(x) { return Fmt.sig(x / 1000, 4) + ' km'; }
  // the orbit through (p, v): eccentricity, near and far distances, period; and points along it, for drawing
  static conic(p, v) { const GM = Orbit.GM, r = V3.len(p), v2 = V3.dot(v, v), hz = p.x * v.y - p.y * v.x, E = v2 / 2 - GM / r, rv = V3.dot(p, v);
    const ev = V3.mul(V3.sub(V3.mul(p, v2 - GM / r), V3.mul(v, rv)), 1 / GM), e = V3.len(ev), w = Math.atan2(ev.y, ev.x), pp = hz * hz / GM, bound = E < 0;
    const a = bound ? -GM / (2 * E) : Infinity; return { e, w, pp, bound, a, rp: pp / (1 + e), ra: bound ? pp / (1 - e) : Infinity, T: bound ? 2 * Math.PI * Math.sqrt(a * a * a / GM) : Infinity, E }; }
  points(max) { const c = this.shape, out = []; for (let i = 0; i <= 360; i++) { const th = i / 360 * 2 * Math.PI, den = 1 + c.e * Math.cos(th - c.w); if (den <= 1e-3) { out.push(null); continue; }
      const r = c.pp / den; if (r > max) { out.push(null); continue; } out.push({ x: r * Math.cos(th), y: r * Math.sin(th), z: 0 }); } return out; }
  acc(p) { const r = V3.len(p); return V3.mul(p, -Orbit.GM / (r * r * r)); }
  // velocity Verlet on the warped clock: about 6000 steps a circular orbit
  advance(dt) { if (this.done) return; const total = dt * this.warp, n = Math.max(1, Math.ceil(total / this.h)), h = total / n;
    for (let i = 0; i < n && !this.done; i++) { const a0 = this.acc(this.p), vh = V3.at(this.vel, a0, h / 2); this.p = V3.at(this.p, vh, h); this.vel = V3.at(vh, this.acc(this.p), h / 2); this.t += h;
      const r = V3.len(this.p); if (r <= Orbit.RE) { this.p = V3.mul(this.p, Orbit.RE / r); this.crashed = true; this.done = 'It hit the Earth: too slow for this height, so gravity pulled it in faster than it could go round.'; }
      else if (r > this.edge) this.done = this.shape.bound ? 'It has gone off the edge of the view. It is still in orbit, and comes back after one period, ' + Orbit.dur(this.shape.T) + '.' : 'It has escaped: going faster than √(2GM/r), it never comes back.'; } }
  static dur(t) { return t < 5400 ? Fmt.num(t / 60, 1) + ' min' : Fmt.num(t / 3600, 2) + ' h'; }
  clock() { return 't = ' + Orbit.dur(this.t); }
  fmtV(x) { return Orbit.kms(x); }
  now() { const m = this.vals.m, p = this.p, v = this.vel, r = V3.len(p), rhat = V3.mul(p, -1 / r), vt = V3.sub(v, V3.mul(rhat, V3.dot(v, rhat))), F = V3.mul(rhat, Orbit.GM * m / (r * r));
    if (this.crashed) return { p, v: V3.O, a: V3.O, c: V3.O, R: r, rhat, that: { x: 1, y: 0, z: 0 }, zhat: V3.Z, onCircle: false, forces: [Situation.force('gravity', F, 'the Earth'), Situation.force('normal', V3.mul(F, -1), 'the ground')], m };
    return { p, v, a: V3.mul(F, 1 / m), c: V3.O, R: r, rhat, that: V3.len(vt) > 1e-9 ? V3.unit(vt) : { x: 1, y: 0, z: 0 }, zhat: V3.Z, onCircle: true, forces: [Situation.force('gravity', F, 'the Earth')], m }; }
}

const SITUATIONS = { puck: Puck, flat: FlatCurve, banked: BankedCurve, conical: Conical, vertical: Vertical, ferris: Ferris, orbit: Orbit };
