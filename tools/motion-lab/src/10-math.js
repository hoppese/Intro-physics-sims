// =====================================================================
// Number formatting (Fmt) and a clamp. Motion Lab is one-dimensional: every
// position, velocity and acceleration is a signed component along the track
// (x, v_x, a_x), positive to the right. Metres, seconds.
// =====================================================================
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

const Fmt = {
  MINUS: '−',
  none: '– – –',            // "nothing to read": spaced out so it cannot be taken for a minus sign
  // x to at most d decimals, no trailing zeros, a real minus sign, and never "-0"
  num(x, d) { if (!isFinite(x)) return x > 0 ? '∞' : x < 0 ? Fmt.MINUS + '∞' : Fmt.none; const p = Math.pow(10, d == null ? 2 : d), r = Math.round(x * p) / p;
    return (r < 0 ? Fmt.MINUS : '') + String(Math.abs(r)); },
  // always d decimals (read-outs that would otherwise jitter in width)
  fix(x, d) { if (!isFinite(x)) return Fmt.num(x); const s = Math.abs(x).toFixed(d == null ? 2 : d); return (x < 0 && Number(s) !== 0 ? Fmt.MINUS : '') + s; },
  // three significant figures, the way a worked answer is quoted
  sig(x, n) { if (!isFinite(x)) return Fmt.num(x); n = n || 3; if (Math.abs(x) < 1e-9) return '0'; const d = Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(x)))); return Fmt.fix(x, Math.min(d, 6)); },
  unit(x, u, n) { return Fmt.sig(x, n) + ' ' + u; },
  m(x) { return Fmt.unit(Math.abs(x) < 5e-4 ? 0 : x, 'm'); },
  vel(x) { return Fmt.unit(Math.abs(x) < 5e-4 ? 0 : x, 'm/s'); },
  acc(x) { return Fmt.unit(Math.abs(x) < 5e-4 ? 0 : x, 'm/s²'); },
  time(t) { return Fmt.fix(t, 2) + ' s'; },
  // a short read-out: two decimals under 10, one under 100, none above
  short(x) { if (!isFinite(x)) return Fmt.none; const a = Math.abs(x); return Fmt.fix(a < 5e-4 ? 0 : x, a >= 100 ? 0 : a >= 10 ? 1 : 2); },
};
