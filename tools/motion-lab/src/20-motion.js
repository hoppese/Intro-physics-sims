// =====================================================================
// The motion itself, exactly:
//   Motion   piecewise-constant acceleration from x0, v0. A piece lasts d seconds
//            at acceleration a; it may also start at a new velocity v (a jump, which
//            is what an x–t graph with a corner means). Past its end it holds still
//            at its last position (an x–t target ends; a program ends).
//   Kin      the constant-acceleration formulas
//   Car      a car: constant acceleration, but a braking car stops and stays stopped
//   meet     when and where two cars are at the same place
//   TARGETS  the graphs to match (x–t or v–t), easiest first
//   score    how closely a run (or a sketch) follows a target, 0–100 %
//   Driver   the cart a student moves, by dragging it or with the throttle
// =====================================================================
const Kin = {
  at: (x0, v0, a, t) => ({ x: x0 + v0 * t + 0.5 * a * t * t, v: v0 + a * t, a }),
};

class Motion {
  constructor(x0, v0, pieces) { this.x0 = x0; this.v0 = v0; this.pieces = (pieces || []).map((p) => ({ ...p })); this.build(); }
  build() { let t = 0, x = this.x0, v = this.v0; this.knots = [];
    for (const p of this.pieces) { if (p.v != null) v = p.v; this.knots.push({ t, x, v, a: p.a, d: p.d }); x += v * p.d + 0.5 * p.a * p.d * p.d; v += p.a * p.d; t += p.d; }
    this.T = t; this.end = { x, v }; }
  // the piece in force at t (the later one at a boundary)
  piece(t) { const K = this.knots; let k = K[0]; for (const q of K) if (q.t <= t + 1e-12) k = q; return k; }
  at(t) { const K = this.knots; if (!K.length) return { x: this.x0, v: this.v0, a: 0 };
    if (t >= this.T) { const last = K[K.length - 1]; return t > this.T + 1e-12 && this.hold ? { x: this.end.x, v: 0, a: 0 } : { x: this.end.x, v: this.end.v, a: last.a }; }
    const k = this.piece(Math.max(0, t)), s = Math.max(0, t) - k.t; return Kin.at(k.x, k.v, k.a, s); }
  // the times where the velocity jumps (corners in x–t)
  get jumps() { const J = []; let v = this.v0; for (const k of this.knots) { if (Math.abs(k.v - v) > 1e-9) J.push(k.t); v = k.v + k.a * k.d; } return J; }
}

// ---- a car: it keeps its acceleration, except that a braking car (aₓ opposite to vₓ) slows to rest at t = −v0x/ax and then
// stays put: nothing pushes it backward. A car starting from rest with aₓ ≠ 0 speeds up (an engine pushes it). ----
const Car = {
  stop(c) { return c.v0 * c.a < 0 ? -c.v0 / c.a : Infinity; },                    // when it comes to rest (∞: never)
  stopX(c) { const t = Car.stop(c); return isFinite(t) ? c.x0 + c.v0 * t + 0.5 * c.a * t * t : NaN; },
  motion(c, T) { const ts = Car.stop(c); return isFinite(ts) && ts < T ? new Motion(c.x0, c.v0, [{ a: c.a, d: ts }, { a: 0, d: T - ts, v: 0 }]) : new Motion(c.x0, c.v0, [{ a: c.a, d: T }]); },
  // its position as a polynomial in t, x0 + v0 t + ½ a t², on each stretch of time: moving, then (if it stops) at rest
  phases(c) { const ts = Car.stop(c); return isFinite(ts) ? [{ t0: 0, t1: ts, x0: c.x0, v0: c.v0, a: c.a }, { t0: ts, t1: Infinity, x0: Car.stopX(c), v0: 0, a: 0, rest: true }] : [{ t0: 0, t1: Infinity, x0: c.x0, v0: c.v0, a: c.a }]; },
};

// When are two cars (each { x0, v0, a }) at the same place? On each stretch of time where neither car starts or stops,
// both positions are polynomials in t, so x_A = x_B is ½(aA − aB)t² + (vA − vB)t + (xA − xB) = 0 with that stretch's
// coefficients (a stopped car has x = x_stop, v = a = 0). Gives the meetings (up to tmax, and any later one too), whether
// they only touch (a tangent), the equation used for each (`eqs`), and, if they never meet, the closest they come.
function meet(A, B, tmax) { const eps = 1e-9, cuts = [0, Car.stop(A), Car.stop(B)].filter((t) => isFinite(t)).sort((a, b) => a - b).concat([Infinity]);
  const at = (P, t) => P.find((q) => t >= q.t0 - 1e-12 && t < q.t1) || P[P.length - 1], PA = Car.phases(A), PB = Car.phases(B);
  let ts = [], always = false, tangent = false, together = null; const eqs = [];
  for (let k = 0; k + 1 < cuts.length; k++) { const t0 = cuts[k], t1 = cuts[k + 1]; if (t1 - t0 < 1e-12) continue; const mid = isFinite(t1) ? (t0 + t1) / 2 : t0 + 1;
    const a = at(PA, mid), b = at(PB, mid), p = 0.5 * (a.a - b.a), q = a.v0 - b.v0, r = a.x0 - b.x0, eq = { t0, t1, p, q, r, restA: !!a.rest, restB: !!b.rest, roots: [] };
    let rs = [];
    if (Math.abs(p) < eps) { if (Math.abs(q) < eps) { if (Math.abs(r) < eps) { if (t0 === 0 && !isFinite(t1)) always = true; else if (together == null) { together = t0; rs = [t0]; } } } else rs = [-r / q]; }
    else { const D = q * q - 4 * p * r, sc = Math.max(1, q * q, Math.abs(4 * p * r));
      if (Math.abs(D) <= 1e-12 * sc) { rs = [-q / (2 * p)]; eq.tangent = true; }
      else if (D > 0) { const sq = Math.sqrt(D), kk = -0.5 * (q + Math.sign(q || 1) * sq); rs = [kk / p, r / kk].sort((x, y) => x - y); } }
    rs = rs.filter((t) => t >= t0 - 1e-9 && t <= t1 + 1e-9 && t >= -1e-9).map((t) => Math.max(0, t));
    for (const t of rs) if (!ts.some((u) => Math.abs(u - t) < 1e-7)) { ts.push(t); eq.roots.push(t); if (eq.tangent) tangent = true; }
    eqs.push(eq); }
  ts.sort((x, y) => x - y); const posA = (t) => { const q = at(PA, t), s = t - 0; return q.x0 + q.v0 * s + 0.5 * q.a * s * s; };
  // (the polynomials are in t from 0, so a stopped car's phase is x0 = x_stop with v0 = a = 0)
  const xs = ts.map((t) => posA(t));
  let closest = null; const gap = (t) => { const a = at(PA, t), b = at(PB, t); return Math.abs((a.x0 - b.x0) + (a.v0 - b.v0) * t + 0.5 * (a.a - b.a) * t * t); };
  if (!ts.length && !always) { const cand = [0, tmax]; for (const e of eqs) { if (e.t0 <= tmax) cand.push(e.t0); if (Math.abs(e.p) > eps) { const tv = -e.q / (2 * e.p); if (tv > e.t0 && tv < e.t1 && tv <= tmax) cand.push(tv); } }
    closest = cand.map((t) => ({ t, gap: gap(t) })).reduce((a, b) => (b.gap < a.gap - 1e-12 ? b : a)); }
  const e0 = eqs[0]; return { times: ts, xs, inside: ts.filter((t) => t <= tmax + 1e-9).length, tangent, always, together, closest, eqs, p: e0.p, q: e0.q, r: e0.r, stopA: Car.stop(A), stopB: Car.stop(B) }; }

// ---- the graphs to match. kind: which graph is the target; x0 and pieces define the whole motion ----
const TRACK = { x0: 0, x1: 5, lo: 0.15, hi: 4.85 };       // m: the track, and how far the cart can go along it
const TARGETS = [
  { key: 'stand-walk', kind: 'x', stars: 1, name: 'Wait, walk away, wait', x0: 1.5, pieces: [{ d: 3, a: 0, v: 0 }, { d: 5, a: 0, v: 0.4 }, { d: 2, a: 0, v: 0 }] },
  { key: 'steady-away', kind: 'v', stars: 1, name: 'Steadily away', x0: 0.8, pieces: [{ d: 10, a: 0, v: 0.3 }] },
  { key: 'steady-toward', kind: 'x', stars: 1, name: 'Steadily toward the sensor', x0: 4, pieces: [{ d: 10, a: 0, v: -0.3 }] },
  { key: 'toward-stop', kind: 'v', stars: 2, name: 'Toward the sensor, then stop', x0: 4.2, pieces: [{ d: 6, a: 0, v: -0.45 }, { d: 4, a: 0, v: 0 }] },
  { key: 'there-back', kind: 'x', stars: 2, name: 'Out, wait, part way back', x0: 1, pieces: [{ d: 4, a: 0, v: 0.5 }, { d: 2, a: 0, v: 0 }, { d: 4, a: 0, v: -0.375 }] },
  { key: 'start-stop', kind: 'v', stars: 2, name: 'Start, cruise, stop', x0: 0.6, pieces: [{ d: 2, a: 0, v: 0 }, { d: 2, a: 0.25 }, { d: 3, a: 0 }, { d: 2, a: -0.25 }, { d: 1, a: 0 }] },
  { key: 'speed-up', kind: 'x', stars: 3, name: 'Speeding up', x0: 0.8, pieces: [{ d: 10, a: 0.06, v: 0 }] },
  { key: 'turn-v', kind: 'v', stars: 3, name: 'Slow down and come back', x0: 1.2, pieces: [{ d: 10, a: -0.1, v: 0.5 }] },
  { key: 'turn-x', kind: 'x', stars: 3, name: 'Out and back, smoothly', x0: 1, pieces: [{ d: 10, a: -0.18, v: 0.9 }] },
];
TARGETS.forEach((T) => { T.motion = new Motion(T.x0, T.pieces[0].v || 0, T.pieces); T.T = T.motion.T; });
const target = (key) => TARGETS.find((T) => T.key === key) || null;

// ---- how closely samples follow a target: 100 % for a perfect match, falling to 0 at an rms miss of `tol`.
// samples: [{ t, val }], only those inside the target's time count; coverage is the share of the time they span. ----
const SCORE_TOL = { x: 0.5, v: 0.25 };
function score(samples, T, kind) { kind = kind || T.kind; const tol = SCORE_TOL[kind]; let s2 = 0, n = 0, t0 = Infinity, t1 = -Infinity;
  for (const p of samples) { if (!isFinite(p.val) || p.t < 0 || p.t > T.T + 1e-9) continue; const want = T.motion.at(Math.min(p.t, T.T - 1e-9))[kind]; s2 += (p.val - want) ** 2; n++; t0 = Math.min(t0, p.t); t1 = Math.max(t1, p.t); }
  if (!n) return { pct: 0, rms: NaN, coverage: 0, n: 0 };
  const rms = Math.sqrt(s2 / n); return { pct: Math.round(100 * clamp(1 - rms / tol, 0, 1)), rms, coverage: n > 1 ? (t1 - t0) / T.T : 0, n }; }
const verdict = (pct) => (pct >= 90 ? 'Excellent match' : pct >= 75 ? 'Good match' : pct >= 50 ? 'Close: try again' : 'Not yet: try again');

// ---- the cart a student drives: dragged (it follows the pointer, as when you walk in front of a motion sensor), or run
// by the throttle (set a velocity; hold → or ← to speed up or slow at Driver.PUSH). The read-outs of v and a are smoothed,
// as a real sensor's software does. ----
class Driver {
  static PUSH = 0.2;          // m/s²: what holding an arrow key does to the velocity
  static VMAX = 1.5;          // m/s
  static TAU = 0.12;          // s: smoothing of the velocity and acceleration read from a dragged cart
  constructor(x) { this.place(x); }
  place(x) { this.x = clamp(x, TRACK.lo, TRACK.hi); this.cmd = 0; this.v = 0; this.a = 0; this.drag = null; this.keys = 0; }
  step(h) { const x0 = this.x, v0 = this.v;
    if (this.drag != null) { this.x = clamp(this.drag, TRACK.lo, TRACK.hi); const raw = (this.x - x0) / h, k = 1 - Math.exp(-h / Driver.TAU); this.v += (raw - this.v) * k; this.cmd = this.v; }
    else { if (this.keys) this.cmd = clamp(this.cmd + this.keys * Driver.PUSH * h, -Driver.VMAX, Driver.VMAX); let x = this.x + this.cmd * h;
      if (x < TRACK.lo || x > TRACK.hi) { x = clamp(x, TRACK.lo, TRACK.hi); this.cmd = 0; } this.x = x; this.v = this.cmd; }
    const k = 1 - Math.exp(-h / Driver.TAU); this.a += ((this.v - v0) / h - this.a) * k; if (Math.abs(this.a) < 1e-9) this.a = 0; }
}
