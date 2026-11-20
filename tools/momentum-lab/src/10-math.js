// =====================================================================
// Small helpers every other file leans on: 2D vectors (V) and number
// formatting (Fmt). The world is a plane: x to the right, y up (on the track,
// y is height and every cart stays at y = 0). SI units inside: metres, kg,
// seconds. Space shows lengths in km and speeds in km/s, but keeps SI inside.
// =====================================================================
const V = {
  O: { x: 0, y: 0 },
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
  mul: (a, k) => ({ x: a.x * k, y: a.y * k }),
  dot: (a, b) => a.x * b.x + a.y * b.y,
  len: (a) => Math.hypot(a.x, a.y),
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  unit: (a) => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; },
  at: (p, d, t) => ({ x: p.x + d.x * t, y: p.y + d.y * t }),
  // the unit vector at `deg` degrees counter-clockwise from +x (multiples of 90 come out exact)
  polar(deg, r) { const t = deg * Math.PI / 180, k = r == null ? 1 : r, fix = (v) => (Math.abs(v) < 1e-15 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-15 ? Math.sign(v) : v);
    return { x: fix(Math.cos(t)) * k, y: fix(Math.sin(t)) * k }; },
  deg: (a) => Math.atan2(a.y, a.x) * 180 / Math.PI,
  toSeg(p, a, b) { const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy; let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); },
};

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const Fmt = {
  MINUS: '−',
  none: '– – –',
  HIDE: '•••',
  num(x, d) { if (!isFinite(x)) return Fmt.none; const p = Math.pow(10, d == null ? 2 : d), r = Math.round(x * p) / p; return (r < 0 ? Fmt.MINUS : '') + String(Math.abs(r)); },
  fix(x, d) { if (!isFinite(x)) return Fmt.none; const s = Math.abs(x).toFixed(d == null ? 2 : d); return (x < 0 && Number(s) !== 0 ? Fmt.MINUS : '') + s; },
  // three significant figures; very big or very small numbers as a × 10ⁿ
  sig(x, n) { if (!isFinite(x)) return Fmt.none; n = n || 3; if (x === 0) return '0'; const e = Math.floor(Math.log10(Math.abs(x)));
    if (e >= 5 || e <= -4) { let m = x / Math.pow(10, e); if (Math.abs(Math.round(m * 100) / 100) >= 10) return Fmt.sig(x * 1.0000001, n); return Fmt.fix(m, n - 1) + ' × 10' + String(e).split('').map((c) => SUP[c]).join(''); }
    const d = Math.max(0, n - 1 - e); return Fmt.fix(x, Math.min(d, 6)); },
  // as a value typed into a box: plain digits, or 5.97e24 for very big or small numbers
  plain(x) { if (!isFinite(x)) return ''; if (x === 0) return '0'; const e = Math.floor(Math.log10(Math.abs(x))); if (e >= 6 || e <= -4) return String(Number(x.toPrecision(4))).replace('+', '');
    return String(Number(x.toPrecision(6))); },
  q(x, unit, tiny) { return Fmt.sig(Math.abs(x) < (tiny || 0) ? 0 : x) + (unit ? ' ' + unit : ''); },
  deg(x) { return Fmt.fix(x, 1) + '°'; },
  // a time: seconds, or minutes, hours, days once it is long
  dur(t) { const a = Math.abs(t); if (a < 120) return Fmt.fix(t, 2) + ' s'; if (a < 7200) return Fmt.fix(t / 60, 1) + ' min'; if (a < 3 * 86400) return Fmt.fix(t / 3600, 2) + ' h'; return Fmt.fix(t / 86400, 2) + ' days'; },
  // a vector ⟨ x, y, 0 ⟩ (or one component on the track)
  vec(v, k, oneD, tiny) { const c = (x) => (Math.abs(x) < (tiny || 0) ? '0' : Fmt.sig(x)); return oneD ? c(v.x / k) : '⟨' + c(v.x / k) + ', ' + c(v.y / k) + ', 0⟩'; },
};
