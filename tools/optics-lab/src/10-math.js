// =====================================================================
// Optics Lab -- the numbers underneath everything else.
//   V         2-D vector helpers (a point or a direction is {x, y}; y points UP)
//   Angle     degrees: wrapping, snapping, differences
//   Spectrum  wavelength -> colour, and the wavelengths that stand for white light
//   Glass     materials: the index at 589 nm plus how fast it changes with colour
//   Fmt       how numbers are written on the canvas and in the side panel
// Lengths are centimetres, angles are degrees counter-clockwise from +x,
// wavelengths are nanometres.
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

const Spectrum = {
  MIN: 400, MAX: 700,
  REF: 589,                                       // the yellow sodium line: "the" index of a glass is quoted here
  // What a white source sends out. Eleven colours are enough for a prism's fan to read as a
  // continuous spectrum, and 589 is one of them so that a white ray has a reference colour.
  WHITE: [415, 445, 470, 495, 520, 545, 567, 589, 612, 640, 675],
  // sRGB for a wavelength, each channel 0..1 (Bruton's piecewise fit, with the eye's fall-off at both ends)
  rgb(nm) { let r = 0, g = 0, b = 0; const w = nm;
    if (w < 440) { r = (440 - w) / 60; b = 1; } else if (w < 490) { g = (w - 440) / 50; b = 1; } else if (w < 510) { g = 1; b = (510 - w) / 20; }
    else if (w < 580) { r = (w - 510) / 70; g = 1; } else if (w < 645) { r = 1; g = (645 - w) / 65; } else { r = 1; }
    const k = w < 420 ? 0.35 + 0.65 * (w - 380) / 40 : w > 700 ? 0.35 + 0.65 * (780 - w) / 80 : 1, f = (c) => Math.pow(Math.max(0, Math.min(1, c * Math.max(0, k))), 0.8);
    return [f(r), f(g), f(b)]; },
  css(nm, alpha) { const c = Spectrum.rgb(nm); return 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + (alpha == null ? 1 : alpha) + ')'; },
  // The colour each member of WHITE is drawn in. Rays are added on top of one another on the
  // dark canvas, so these are scaled until the whole set drawn on one line comes out white
  // (a little over, so it stays white where the line is thin) while each one alone is still a clear colour.
  _parts: null,
  parts() { if (Spectrum._parts) return Spectrum._parts; const raw = Spectrum.WHITE.map((nm) => Spectrum.rgb(nm)), sum = [0, 1, 2].map((i) => raw.reduce((s, c) => s + c[i], 0)), GAIN = 2.3, out = new Map();
    Spectrum.WHITE.forEach((nm, k) => out.set(nm, raw[k].map((c, i) => Math.min(1, c * GAIN / sum[i]))));
    return (Spectrum._parts = out); },
  partCss(nm, alpha) { const c = Spectrum.parts().get(nm) || Spectrum.rgb(nm); return 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + (alpha == null ? 1 : alpha) + ')'; },
  name(nm) { return nm < 450 ? 'violet' : nm < 492 ? 'blue' : nm < 505 ? 'cyan' : nm < 570 ? 'green' : nm < 592 ? 'yellow' : nm < 622 ? 'orange' : 'red'; },
};

const Glass = {
  // n(lambda) = n + B (1/lambda^2 - 1/0.589^2), lambda in micrometres (Cauchy's formula with two terms).
  // What the user sets is `n`, the index for yellow light, and `spread` = n(400 nm) - n(700 nm):
  // how much more the glass bends violet than red. K turns the one into the other.
  K: 1 / (0.4 * 0.4) - 1 / (0.7 * 0.7),
  index(n, spread, nm) { const l = nm / 1000; return Math.max(1, n + (spread / Glass.K) * (1 / (l * l) - 1 / (0.589 * 0.589))); },
  MATERIALS: [
    { key: 'water', label: 'Water', n: 1.333, spread: 0.013 },
    { key: 'acrylic', label: 'Acrylic', n: 1.49, spread: 0.016 },
    { key: 'crown', label: 'Crown glass', n: 1.52, spread: 0.018 },
    { key: 'flint', label: 'Flint glass', n: 1.62, spread: 0.04 },
    { key: 'diamond', label: 'Diamond', n: 2.42, spread: 0.057 },
  ],
  // the material whose two numbers these are, if any
  named(n, spread) { return Glass.MATERIALS.find((m) => Math.abs(m.n - n) < 5e-4 && Math.abs(m.spread - spread) < 5e-4) || null; },
};

const Fmt = {
  MINUS: '−',
  none: '– – –',                    // "nothing to read": spaced out so it cannot be taken for a minus sign
  // x to at most d decimals, no trailing zeros, a real minus sign, and never "-0"
  num(x, d) { if (!isFinite(x)) return x > 0 ? '∞' : x < 0 ? Fmt.MINUS + '∞' : Fmt.none; const p = Math.pow(10, d == null ? 1 : d), r = Math.round(x * p) / p;
    return (r < 0 ? Fmt.MINUS : '') + String(Math.abs(r)); },
  // the same, but always showing d decimals (for read-outs that would otherwise jitter in width)
  fix(x, d) { if (!isFinite(x)) return Fmt.num(x); const s = Math.abs(x).toFixed(d == null ? 1 : d); return (x < 0 && Number(s) !== 0 ? Fmt.MINUS : '') + s; },
  cm(x, d) { return Fmt.num(x, d) + ' cm'; },
  deg(x, d) { return Fmt.fix(x, d == null ? 1 : d) + '°'; },
  signed(x, d) { const s = Fmt.num(x, d); return x > 0 && s !== '0' ? '+' + s : s; },
  point(p, d) { return '(' + Fmt.num(p.x, d) + ', ' + Fmt.num(p.y, d) + ')'; },
};
