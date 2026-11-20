// =====================================================================
// Small helpers every other file leans on: 2D vectors (V), angles in degrees
// (Angle), and number formatting (Fmt). Lengths are metres, masses kg, forces
// newtons, times seconds; angles degrees counter-clockwise from +x.
// =====================================================================
const V = {
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
  mul: (a, k) => ({ x: a.x * k, y: a.y * k }),
  dot: (a, b) => a.x * b.x + a.y * b.y,
  cross: (a, b) => a.x * b.y - a.y * b.x,
  len: (a) => Math.hypot(a.x, a.y),
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  unit: (a) => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; },
  left: (a) => ({ x: -a.y, y: a.x }),                // a turned 90 degrees counter-clockwise
  at: (p, d, t) => ({ x: p.x + d.x * t, y: p.y + d.y * t }),
  // the unit vector at `deg` (times r). Multiples of 90 degrees come out exact, so an
  // element lined up with the grid has no 6e-17 in its geometry.
  polar(deg, r) { const t = deg * Math.PI / 180, k = r == null ? 1 : r, fix = (v) => (Math.abs(v) < 1e-15 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-15 ? Math.sign(v) : v);
    return { x: fix(Math.cos(t)) * k, y: fix(Math.sin(t)) * k }; },
  rot(a, deg) { const u = V.polar(deg); return { x: a.x * u.x - a.y * u.y, y: a.x * u.y + a.y * u.x }; },
  // distance from point p to the segment a-b
  toSeg(p, a, b) { const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy; let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); },
  // is p inside the closed polygon pts?
  inside(p, pts) { let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside; }
    return inside; },
};

const Angle = {
  rad: (deg) => deg * Math.PI / 180,
  deg: (rad) => rad * 180 / Math.PI,
  // into [0, 360), to a millionth of a degree
  wrap(deg) { let a = deg % 360; if (a < 0) a += 360; a = Math.round(a * 1e6) / 1e6; return a >= 360 ? 0 : a; },
  snap: (deg, step) => Math.round(deg / step) * step,
  of: (v) => Math.atan2(v.y, v.x) * 180 / Math.PI,
  // the signed turn from a to b, in (-180, 180]
  diff(a, b) { let d = (b - a) % 360; if (d > 180) d -= 360; if (d <= -180) d += 360; return d; },
};

const Fmt = {
  MINUS: '−',
  none: '– – –',            // "nothing to read": spaced out so it cannot be taken for a minus sign
  // x to at most d decimals, no trailing zeros, a real minus sign, and never "-0"
  num(x, d) { if (!isFinite(x)) return x > 0 ? '∞' : x < 0 ? Fmt.MINUS + '∞' : Fmt.none; const p = Math.pow(10, d == null ? 2 : d), r = Math.round(x * p) / p;
    return (r < 0 ? Fmt.MINUS : '') + String(Math.abs(r)); },
  // always d decimals (read-outs that would otherwise jitter in width)
  fix(x, d) { if (!isFinite(x)) return Fmt.num(x); const s = Math.abs(x).toFixed(d == null ? 2 : d); return (x < 0 && Number(s) !== 0 ? Fmt.MINUS : '') + s; },
  // three significant figures, the way a worked answer is quoted
  sig(x, n) { if (!isFinite(x)) return Fmt.num(x); if (x === 0) return '0'; n = n || 3; const d = Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(x)))); return Fmt.fix(x, Math.min(d, 6)); },
  unit(x, u, n) { return Fmt.sig(x, n) + ' ' + u; },
  N(x) { return Fmt.unit(Math.abs(x) < 5e-4 ? 0 : x, 'N'); },
  m(x) { return Fmt.unit(x, 'm'); },
  kg(x) { return Fmt.unit(x, 'kg'); },
  acc(x) { return Fmt.unit(Math.abs(x) < 5e-5 ? 0 : x, 'm/s²'); },
  vel(x) { return Fmt.unit(Math.abs(x) < 5e-5 ? 0 : x, 'm/s'); },
  deg(x, d) { return Fmt.fix(x, d == null ? 1 : d) + '°'; },
  point(p, d) { return '(' + Fmt.num(p.x, d) + ', ' + Fmt.num(p.y, d) + ')'; },
  time(t) { return Fmt.fix(t, 2) + ' s'; },
  // a vector in three-component form, ⟨ x, y, 0 ⟩: two decimals below 10, one from 10 up, and 0 for anything under `tiny`
  comp(x, tiny) { if (!isFinite(x)) return Fmt.num(x); if (Math.abs(x) < (tiny || 5e-4)) return '0'; return Fmt.fix(x, Math.abs(x) >= 9.995 ? 1 : 2); },
  vec(v, tiny) { return '⟨ ' + Fmt.comp(v.x, tiny) + ', ' + Fmt.comp(v.y, tiny) + ', 0 ⟩'; },
  HIDDEN: '⟨ •••, •••, ••• ⟩',
};
