// =====================================================================
// Track -- the shape the student draws: a smooth curve through control
// points, side on, x to the right and y up (metres). The curve is a natural
// cubic spline in the chord-length parameter u (0 at the first point, T at
// the last), so its slope and its curvature both change smoothly: the normal
// force (which depends on the curvature) has no jumps. The object rides on
// the LEFT side of the direction of travel along u: the top of a hill, the
// inside of a loop. A dense sampling (`S`) serves drawing, nearest-point
// searches, arc length and the landing test.
// =====================================================================
class Track {
  static WORLD = { x0: 0, x1: 32, y0: -1, y1: 22.5 };   // what the picture shows (m); the ground is y = 0
  static MINGAP = 0.6;                                   // m: the least distance between neighbouring points
  static YMIN = 0.3;                                     // m: the track stays this far above the ground
  static MINPTS = 3;
  constructor(pts) { this.set(pts); }
  set(pts) { this.pts = pts.map((p) => ({ x: p.x, y: p.y })); this.build(); }
  clone() { return new Track(this.pts); }
  get n() { return this.pts.length; }

  // ---- the spline ----
  build() { const P = this.pts; this.t = [0]; for (let i = 1; i < P.length; i++) this.t.push(this.t[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y));
    this.T = this.t[this.t.length - 1]; this.Mx = Track.natural(this.t, P.map((p) => p.x)); this.My = Track.natural(this.t, P.map((p) => p.y)); this.sample(); }
  // second derivatives of the natural cubic spline through (t_i, v_i): zero at both ends
  static natural(t, v) { const n = v.length, M = new Array(n).fill(0); if (n < 3) return M;
    const a = [], b = [], c = [], d = []; for (let i = 1; i < n - 1; i++) { const h0 = t[i] - t[i - 1], h1 = t[i + 1] - t[i]; a.push(h0); b.push(2 * (h0 + h1)); c.push(h1); d.push(6 * ((v[i + 1] - v[i]) / h1 - (v[i] - v[i - 1]) / h0)); }
    const m = b.length; for (let i = 1; i < m; i++) { const w = a[i] / b[i - 1]; b[i] -= w * c[i - 1]; d[i] -= w * d[i - 1]; }
    const x = new Array(m); x[m - 1] = d[m - 1] / b[m - 1]; for (let i = m - 2; i >= 0; i--) x[i] = (d[i] - c[i] * x[i + 1]) / b[i]; for (let i = 0; i < m; i++) M[i + 1] = x[i]; return M; }
  seg(u) { const t = this.t; let lo = 0, hi = t.length - 2; if (u <= t[0]) return 0; if (u >= t[hi]) return hi; while (hi > lo) { const mid = (lo + hi + 1) >> 1; if (t[mid] <= u) lo = mid; else hi = mid - 1; } return lo; }
  // position and its first two derivatives with respect to u
  at(u) { u = Math.max(0, Math.min(this.T, u)); const i = this.seg(u), t = this.t, h = t[i + 1] - t[i], A = (t[i + 1] - u) / h, B = (u - t[i]) / h, P = this.pts;
    const f = (v0, v1, M0, M1) => [A * v0 + B * v1 + ((A * A * A - A) * M0 + (B * B * B - B) * M1) * h * h / 6, (v1 - v0) / h + (-(3 * A * A - 1) * M0 + (3 * B * B - 1) * M1) * h / 6, A * M0 + B * M1];
    const [x, dx, ddx] = f(P[i].x, P[i + 1].x, this.Mx[i], this.Mx[i + 1]), [y, dy, ddy] = f(P[i].y, P[i + 1].y, this.My[i], this.My[i + 1]); return { x, y, dx, dy, ddx, ddy }; }
  // the geometry there: point p, unit tangent T (the way u runs), unit normal N (the riding side), signed curvature k
  // (positive where the track bends toward the riding side, as in a dip or a loop), and |dc/du|
  geo(u) { const q = this.at(u), sp = Math.hypot(q.dx, q.dy) || 1e-9, T = { x: q.dx / sp, y: q.dy / sp };
    return { p: { x: q.x, y: q.y }, T, N: { x: -T.y, y: T.x }, k: (q.dx * q.ddy - q.dy * q.ddx) / (sp * sp * sp), sp, q }; }

  // ---- the dense sampling: points every few centimetres, with the arc length to each ----
  sample() { const N = Math.max(240, Math.ceil(this.T / 0.06)), S = []; let s = 0, prev = null;
    for (let j = 0; j <= N; j++) { const u = this.T * j / N, p = this.at(u); if (prev) s += Math.hypot(p.x - prev.x, p.y - prev.y); S.push({ u, x: p.x, y: p.y, s }); prev = p; }
    this.S = S; this.len = s; }
  // arc length <-> u, by the sampling
  sAt(u) { const S = this.S, j = Math.max(0, Math.min(S.length - 2, Math.floor(u / this.T * (S.length - 1)))), a = S[j], b = S[j + 1], f = (u - a.u) / (b.u - a.u || 1); return a.s + (b.s - a.s) * Math.max(0, Math.min(1, f)); }
  uAt(s) { const S = this.S; if (s <= 0) return 0; if (s >= this.len) return this.T; let lo = 0, hi = S.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m].s <= s) lo = m; else hi = m; }
    const a = S[lo], b = S[hi]; return a.u + (b.u - a.u) * (s - a.s) / (b.s - a.s || 1); }
  // the nearest point of the track to p: { u, d, x, y }
  nearest(p) { const S = this.S; let best = { d: Infinity };
    for (let j = 0; j + 1 < S.length; j++) { const a = S[j], b = S[j + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1e-12, f = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)), x = a.x + f * dx, y = a.y + f * dy, d = Math.hypot(p.x - x, p.y - y);
      if (d < best.d) best = { u: a.u + f * (b.u - a.u), d, x, y }; } return best; }
  get bounds() { let y0 = Infinity, y1 = -Infinity; for (const q of this.S) { y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); } return { y0, y1 }; }
  // where the track is at height h: the crossing nearest (along the track) to arc length s, or null
  atHeight(h, s) { const S = this.S; let best = null;
    for (let j = 0; j + 1 < S.length; j++) { const a = S[j], b = S[j + 1]; if ((a.y - h) * (b.y - h) > 0 || a.y === b.y) continue; const f = (h - a.y) / (b.y - a.y), sc = a.s + f * (b.s - a.s);
      if (!best || Math.abs(sc - s) < Math.abs(best - s)) best = sc; } return best; }

  // ---- the lowest height to start from (at rest, no friction) that keeps n >= 0 everywhere ----
  // n = m (k v^2 + g N_y) and v^2 = 2 g (h - y), so n >= 0 needs h >= y - N_y / (2k) wherever the track is upside
  // down (N_y < -0.5: a loop, not the slight overhang of a half-pipe's rim) and curving toward the riding side (k > 0). Null if the track never asks for that.
  get hmin() { let best = null; for (const q of this.S) { const g = this.geo(q.u); if (g.N.y < -0.5 && g.k > 1e-6) { const h = g.p.y - g.N.y / (2 * g.k); if (best === null || h > best.h) best = { h, u: q.u, y: g.p.y, r: 1 / g.k }; } } return best; }
  // the loop, if there is one: its top (highest upside-down point), the radius of curvature there, its bottom
  get loop() { let top = null; for (const q of this.S) { const g = this.geo(q.u); if (g.N.y < -0.98 && (!top || g.p.y > top.y)) top = { y: g.p.y, x: g.p.x, u: q.u, r: g.k > 1e-9 ? 1 / g.k : Infinity }; }
    if (!top || !isFinite(top.r)) return null; let bottom = Infinity; for (const q of this.S) if (Math.abs(q.x - top.x) < 0.6 * top.r) bottom = Math.min(bottom, q.y); return { ...top, bottom }; }

  // ---- editing: every change keeps the track valid (inside the picture, above the ground, no two neighbours closer than MINGAP) ----
  static clampPt(p) { const W = Track.WORLD; return { x: Math.max(W.x0 + 0.3, Math.min(W.x1 - 0.3, p.x)), y: Math.max(Track.YMIN, Math.min(W.y1 - 0.5, p.y)) }; }
  okAt(i, p) { const P = this.pts; return (i === 0 || Math.hypot(p.x - P[i - 1].x, p.y - P[i - 1].y) >= Track.MINGAP) && (i === P.length - 1 || Math.hypot(p.x - P[i + 1].x, p.y - P[i + 1].y) >= Track.MINGAP); }
  move(i, p) { if (i < 0 || i >= this.n) return false; p = Track.clampPt(p); if (!this.okAt(i, p)) return false; this.pts[i] = p; this.build(); return true; }
  // a new point on the track at u (the curve hardly changes); returns its index, or -1
  insert(u) { const i = this.seg(u), q = this.at(u), p = Track.clampPt({ x: q.x, y: q.y }), P = this.pts;
    if (Math.hypot(p.x - P[i].x, p.y - P[i].y) < Track.MINGAP || Math.hypot(p.x - P[i + 1].x, p.y - P[i + 1].y) < Track.MINGAP) return -1; P.splice(i + 1, 0, p); this.build(); return i + 1; }
  remove(i) { if (this.n <= Track.MINPTS || i < 0 || i >= this.n) return false; const P = this.pts.slice(); P.splice(i, 1);
    for (let j = 1; j < P.length; j++) if (Math.hypot(P[j].x - P[j - 1].x, P[j].y - P[j - 1].y) < Track.MINGAP) return false; this.pts = P; this.build(); return true; }
  get valid() { const P = this.pts, W = Track.WORLD; if (P.length < Track.MINPTS) return false;
    for (let i = 0; i < P.length; i++) { const p = P[i]; if (!isFinite(p.x) || !isFinite(p.y) || p.y < Track.YMIN - 1e-9 || p.x < W.x0 || p.x > W.x1 || p.y > W.y1) return false; if (i && Math.hypot(p.x - P[i - 1].x, p.y - P[i - 1].y) < Track.MINGAP - 1e-9) return false; }
    return this.S.every((q) => isFinite(q.x) && isFinite(q.y)) && this.len > 0; }
}

// =====================================================================
// CircleLoop -- the loop-the-loop built from exact pieces, not a spline: a
// straight ramp, a circular bend (radius BEND) into a short level run, a loop
// that is an exact circle of radius r, and a level run out. On the loop the
// curvature is exactly 1/r, so the textbook results hold exactly: a ball
// starting from rest (no friction) needs a start at least 2.5 r above the
// bottom, n at the top is m(v²/r − g) and at the bottom m(v²/r + g). Where a
// straight piece meets a curved one the curvature jumps, and so does n: that
// is real for a loop made like this. The parameter u is the arc length.
// The loop is not reshaped by control points (it has none); r is a setting.
// =====================================================================
class CircleLoop extends Track {
  static TOP = 18;            // m: the top of the ramp
  static X0 = 1.5;            // m: where the ramp starts
  static ANGLE = 50;          // degrees: the ramp's slope
  static BEND = 5;            // m: the radius of the bend at the foot of the ramp
  static BASE = 0.6;          // m: the height of the level runs and of the loop's bottom
  static CX = 19;             // m: x of the loop's bottom (and centre)
  static END = 31;            // m: where the run out ends
  static RMIN = 2.5; static RMAX = 5.5;
  static START = 11.3;        // m: the ready-made start (above 2.5 r + BASE = 10.6 m for r = 4 m)
  constructor(r) { super([]); this.r = Math.max(CircleLoop.RMIN, Math.min(CircleLoop.RMAX, r)); this.build(); }
  clone() { return new CircleLoop(this.r); }
  build() { if (this.r == null) return; const C = CircleLoop, th = C.ANGLE * Math.PI / 180, R = C.BEND, r = this.r, b = C.BASE, P = [];
    const dropBend = R * (1 - Math.cos(th)), rampH = C.TOP - b - dropBend, rampX = C.X0 + rampH / Math.tan(th), bendEndX = rampX + R * Math.sin(th);
    P.push({ type: 'line', p: { x: C.X0, y: C.TOP }, d: { x: Math.cos(th), y: -Math.sin(th) }, L: rampH / Math.sin(th) });
    // the bend: centre straight above the bend's end, turning counter-clockwise from the ramp's direction to level
    P.push({ type: 'arc', c: { x: bendEndX, y: b + R }, R, a0: -Math.PI / 2 - th, sweep: th });
    P.push({ type: 'line', p: { x: bendEndX, y: b }, d: { x: 1, y: 0 }, L: C.CX - bendEndX });
    P.push({ type: 'arc', c: { x: C.CX, y: b + r }, R: r, a0: -Math.PI / 2, sweep: 2 * Math.PI, loop: true });
    P.push({ type: 'line', p: { x: C.CX, y: b }, d: { x: 1, y: 0 }, L: C.END - C.CX });
    let u = 0; for (const q of P) { q.u0 = u; q.len = q.type === 'line' ? q.L : q.R * q.sweep; u += q.len; } this.pieces = P; this.T = u; this.t = [0, u];
    this.uLoop0 = P[3].u0; this.uLoop1 = P[3].u0 + P[3].len; this.uTop = P[3].u0 + Math.PI * r;
    // where the ride notes the normal force as it passes: just inside the circle at the bottom, and the top
    this.marks = [{ key: 'bottom', u: this.uLoop0 + 1e-7 }, { key: 'top', u: this.uTop }]; this.sample(); }
  piece(u) { const P = this.pieces; for (let i = P.length - 1; i >= 0; i--) if (u >= P[i].u0 - 1e-12) return P[i]; return P[0]; }
  at(u) { u = Math.max(0, Math.min(this.T, u)); const q = this.piece(u), s = u - q.u0;
    if (q.type === 'line') return { x: q.p.x + q.d.x * s, y: q.p.y + q.d.y * s, dx: q.d.x, dy: q.d.y, ddx: 0, ddy: 0 };
    const a = q.a0 + s / q.R, c = Math.cos(a), sn = Math.sin(a); return { x: q.c.x + q.R * c, y: q.c.y + q.R * sn, dx: -sn, dy: c, ddx: -c / q.R, ddy: -sn / q.R }; }
  // exact, from the geometry
  get hmin() { return { h: CircleLoop.BASE + 2.5 * this.r, u: this.uTop, y: CircleLoop.BASE + 2 * this.r, r: this.r, exact: true }; }
  get loop() { return { y: CircleLoop.BASE + 2 * this.r, x: CircleLoop.CX, u: this.uTop, r: this.r, bottom: CircleLoop.BASE, exact: true }; }
  get valid() { return this.S.every((q) => isFinite(q.x) && isFinite(q.y)) && this.len > 0; }
  move() { return false; } insert() { return -1; } remove() { return false; }
}

// ---- the ready-made tracks; `start` is the release height (m), found on the first way down ----
const circlePts = (cx, cy, r, from, to, n) => { const out = []; for (let i = 0; i <= n; i++) { const a = (from + (to - from) * i / n) * Math.PI / 180; out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); } return out; };
const PRESETS = {
  hill: { rider: 'car', name: 'One hill', icon: '⌒', start: 12.6, note: 'Released high on the left, the coaster car runs down, over the hill, up the far slope and back. Watch kinetic and potential energy trade places; with friction off their total stays the same. Over the crest the rail has to pull the car down (n < 0): switch to a ball and it flies off there.',
    pts: [{ x: 1, y: 14.4 }, { x: 3.5, y: 12 }, { x: 6.5, y: 7.6 }, { x: 9.5, y: 4.8 }, { x: 12.5, y: 4.7 }, { x: 15.5, y: 6.1 }, { x: 18, y: 6.6 }, { x: 20.5, y: 6.1 }, { x: 23.5, y: 4.7 }, { x: 26.5, y: 4.9 }, { x: 29.2, y: 8.2 }, { x: 31.3, y: 14.6 }] },
  twoHills: { rider: 'car', name: 'Two hills', icon: '〰', start: 9.3, note: 'The second hill is taller than the start. The energy line shows where the cart runs out of kinetic energy: it gets over the first hill but turns back before the top of the second.',
    pts: [{ x: 1, y: 12.4 }, { x: 4, y: 9.2 }, { x: 7.5, y: 4.6 }, { x: 10.5, y: 4.6 }, { x: 13, y: 5.2 }, { x: 15.5, y: 4.8 }, { x: 18.5, y: 4.2 }, { x: 22, y: 7.2 }, { x: 25, y: 10.6 }, { x: 28, y: 7.4 }, { x: 31, y: 4 }] },
  valley: { rider: 'ball', name: 'Valley', icon: '∪', start: 8.3, note: 'Without friction the cart rocks back and forth for ever, turning round at the same height on each side. Turn friction on and it settles at the bottom, its energy gone to thermal energy.',
    pts: [{ x: 2, y: 11 }, { x: 6, y: 6 }, { x: 11, y: 1.5 }, { x: 16, y: 1 }, { x: 21, y: 1.5 }, { x: 26, y: 6 }, { x: 30, y: 11 }] },
  loop: { rider: 'ball', name: 'Loop-the-loop', icon: '➰', start: 12.3, note: 'To stay on the track at the top of the loop the ball needs v² ≥ g r there. Starting from rest with no friction, that means starting at least 2.5 r above the bottom of the circle. Try a little lower.',
    pts: [{ x: 1, y: 15 }, { x: 4, y: 11 }, { x: 8, y: 3 }, { x: 11.5, y: 0.7 }].concat(circlePts(15, 4.6, 4, -90, 270, 12)).concat([{ x: 18.5, y: 0.7 }, { x: 23, y: 1.1 }, { x: 31, y: 1.6 }]) },
  ski: { rider: 'ball', name: 'Ski jump', icon: '⤴', start: 7.4, note: 'The track ends in an upturned lip: the cart leaves it as a projectile. Its kinetic energy at the lip sets how far it flies; the landing jolt turns some into thermal energy.',
    pts: [{ x: 1, y: 13 }, { x: 4, y: 9.5 }, { x: 8, y: 3.2 }, { x: 11, y: 1.5 }, { x: 13.5, y: 1.6 }, { x: 15, y: 2.6 }] },
  halfPipe: { rider: 'ball', name: 'Half-pipe', icon: '◡', start: 6.4, note: 'Released on one wall, the cart rises to the same height on the other. Give it a starting speed and it can fly out over the rim, straight up, and drop back in.',
    pts: [{ x: 8.85, y: 9.6 }, { x: 8.6, y: 6.5 }, { x: 9.8, y: 3.3 }, { x: 12.5, y: 1.3 }, { x: 16, y: 0.8 }, { x: 19.5, y: 1.3 }, { x: 22.2, y: 3.3 }, { x: 23.4, y: 6.5 }, { x: 23.15, y: 9.6 }] },
};
