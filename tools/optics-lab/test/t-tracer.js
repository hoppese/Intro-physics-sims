// The tracer against results that can be worked out by hand.
const { V, Angle, Spectrum, Glass, Scene, Tracer, Element, Lens, Mirror, Prism, ok, near, done } = require('./load.js');
const scene = (els, opts) => Scene.from({ els, opts });
const trace = (els, opts) => Tracer.trace(scene(els, opts));
const rad = Angle.rad, deg = Angle.deg;
const finite = (r) => r.segs.every((s) => [s.a.x, s.a.y, s.b.x, s.b.y].every(isFinite));

// ---- the law of reflection, at a flat mirror, for many angles ----
for (let inc = 0; inc <= 85; inc += 5) for (const turn of [0, 37, 90, 201.5]) {
  // mirror at the origin facing `turn`; a laser 30 cm out along a line `inc` degrees from the mirror's normal
  const from = V.polar(turn + inc, 30), r = trace([{ t: 'laser', x: from.x, y: from.y, angle: turn + inc + 180, nm: 650 }, { t: 'mirror', x: 0, y: 0, angle: turn, flat: 1, height: 20 }]);
  const p = r.paths[0], h = p.hits[0]; ok(p.hits.length === 1 && h.how === 'reflect', 'flat mirror reflects once at ' + inc);
  near(h.th1, inc, 1e-6, 'angle of incidence ' + inc); near(h.th2, inc, 1e-6, 'angle of reflection ' + inc);
  near(Angle.diff(Angle.of(p.dirs[1]), turn - inc), 0, 1e-6, 'reflected direction at ' + inc + ', mirror turned ' + turn);
  near(V.len(h.q), 0, 1e-4, 'meets the mirror at its centre'); ok(p.open && finite(r), 'and leaves the bench'); }
// from behind, a mirror just stops the light
{ const r = trace([{ t: 'laser', x: 30, y: 2, angle: 180, nm: 650 }, { t: 'mirror', x: 0, y: 0, angle: 180, flat: 1, height: 20 }]); ok(r.paths[0].hits[0].how === 'back' && r.segs.length === 1 && !r.paths[0].open, 'the back of a mirror absorbs'); }
// past its edge, a mirror is not there
{ const r = trace([{ t: 'laser', x: -30, y: 10.5, angle: 0, nm: 650 }, { t: 'mirror', x: 0, y: 0, angle: 180, flat: 1, height: 20 }]); ok(r.paths[0].hits.length === 0 && r.paths[0].open, 'a ray past the edge misses'); }

// ---- Snell's law through a block: in, out, parallel, displaced ----
for (const n of [1.2, 1.333, 1.52, 2.42]) for (let inc = 0; inc <= 80; inc += 10) {
  const T = 20, top = 0, d = V.polar(270 + inc), from = V.at({ x: 0, y: top }, d, -25);
  const r = trace([{ t: 'laser', x: from.x, y: from.y, angle: 270 + inc, nm: 589 }, { t: 'block', x: 0, y: -T / 2, n, spread: 0, width: 150, height: T }]);
  const h = r.paths[0].hits, th2 = deg(Math.asin(Math.sin(rad(inc)) / n)); ok(h.length === 2 && h[0].how === 'refract' && h[1].how === 'refract', 'two refractions, n=' + n + ' inc=' + inc);
  near(h[0].th1, inc, 2e-3, 'incidence'); near(h[0].th2, th2, 2e-3, 'Snell in, n=' + n + ' inc=' + inc); near(h[1].th1, th2, 2e-3, 'incidence inside'); near(h[1].th2, inc, 2e-3, 'Snell out');
  near(Angle.diff(Angle.of(r.paths[0].dirs[2]), 270 + inc), 0, 1e-3, 'emerges parallel');
  const shift = T * Math.sin(rad(inc - th2)) / Math.cos(rad(th2)), out = h[1].q, straight = V.at({ x: 0, y: top }, d, T / Math.cos(rad(inc)));
  near(V.dist(out, straight) * Math.cos(rad(inc)), shift, 2e-3, 'sideways shift, n=' + n + ' inc=' + inc);
  ok(h[0].n1 === 1 && Math.abs(h[0].n2 - n) < 1e-9 && h[0].inside && !h[1].inside, 'indices recorded'); }

// ---- the critical angle, at the flat face of a half-disc ----
for (const n of [1.333, 1.49, 1.62, 2.42]) { const crit = deg(Math.asin(1 / n));
  for (let inc = 2; inc <= 88; inc += 3) { if (Math.abs(inc - crit) < 0.5) continue;
    // flat face up (the disc points down); the ray comes up through the curve at the centre of the flat face
    const from = V.polar(270 - inc, 40), r = trace([{ t: 'laser', x: from.x, y: from.y, angle: 90 - inc, nm: 589 }, { t: 'half', x: 0, y: 0, angle: 270, n, spread: 0, radius: 20 }]);
    const h = r.paths[0].hits; ok(h.length >= 2, 'enters and reaches the flat face'); near(h[0].th1, 0, 1e-4, 'crosses the curve along a radius'); near(V.len(h[1].q), 0, 1e-4, 'reaches the centre');
    near(h[1].th1, inc, 1e-4, 'incidence at the flat face');
    if (inc < crit) { ok(h[1].how === 'refract' && h.length === 2, 'below the critical angle light escapes, n=' + n + ' inc=' + inc); near(Math.sin(rad(h[1].th2)), n * Math.sin(rad(inc)), 1e-5, 'Snell out of the glass'); }
    else { ok(h[1].how === 'tir' && h.length === 3 && h[2].how === 'refract', 'above the critical angle: total internal reflection, n=' + n + ' inc=' + inc); near(h[2].th1, 0, 1e-4, 'and out through the curve along a radius');
      near(Angle.diff(Angle.of(r.paths[0].dirs[3]), 270 + inc), 0, 1e-4, 'reflected at the same angle'); } } }

// ---- the thin-lens equation, exactly, for every ray ----
const lensCase = (s, f, h, turn, at) => { const ax = V.polar(turn), up = V.left(ax), obj = V.add(at, V.add(V.mul(ax, -s), V.mul(up, h)));
  const r = trace([{ t: 'lamp', x: obj.x, y: obj.y, angle: turn - deg(Math.atan2(h, s)), nm: 0, spread: 24, count: 9 }, { t: 'lens', x: at.x, y: at.y, angle: turn, f, height: 150 }]);
  const tag = 's=' + s + ' f=' + f + ' h=' + h + ' turn=' + turn, im = r.images; ok(finite(r), 'finite ' + tag);
  if (Math.abs(s - f) < 1e-9) { ok(im.length === 0, 'object at the focal point: no image, ' + tag); return; }
  const sp = s * f / (s - f), m = -sp / s, want = V.add(at, V.add(V.mul(ax, sp), V.mul(up, m * h)));
  ok(im.length === 1, 'one image, ' + tag + ' (found ' + im.length + ')'); if (im.length !== 1) return;
  near(im[0].p.x, want.x, 1e-3, 'image x, ' + tag); near(im[0].p.y, want.y, 1e-3, 'image y, ' + tag);
  near(im[0].s, s, 1e-3, 's, ' + tag); near(im[0].sp, sp, 1e-3, "s', " + tag); near(im[0].m, m, 1e-6, 'm, ' + tag);
  ok(im[0].kind === (sp > 0 ? 'real' : 'virtual'), 'real or virtual, ' + tag); };
for (const f of [20, 12.5, -20, -35]) for (const s of [8, 20, 30, 45, 90]) for (const h of [0, 5, -7]) for (const [turn, at] of [[0, { x: 0, y: 0 }], [180, { x: 4, y: -3 }], [63, { x: -10, y: 12 }]]) lensCase(s, f, h, turn, at);
// parallel light comes to the focal point (or from it)
for (const f of [20, -20, 33]) for (const tilt of [0, 6, -11]) { const r = trace([{ t: 'beam', x: -50, y: 0, angle: tilt, nm: 650, width: 20, count: 7 }, { t: 'lens', x: 0, y: 0, f, height: 150 }]);
  ok(r.images.length === 1 && r.images[0].focus, 'a beam is focused, f=' + f); const im = r.images[0]; near(im.p.x, f, 1e-6, 'in the focal plane, f=' + f + ' tilt=' + tilt); near(im.p.y, f * Math.tan(rad(tilt)), 1e-6, 'at f tan(tilt)');
  ok(im.s === Infinity && im.m === null && Math.abs(im.sp - f) < 1e-6, "s is infinite and s' = f"); }
// a ray through the centre of a lens is not bent; a ray past its edge is not touched
{ const r = trace([{ t: 'laser', x: -30, y: -9, angle: deg(Math.atan2(9, 30)), nm: 650 }, { t: 'lens', x: 0, y: 0, f: 14, height: 30 }]); near(Angle.diff(Angle.of(r.paths[0].dirs[1]), Angle.of(r.paths[0].dirs[0])), 0, 1e-5, 'the central ray goes straight on');
  const r2 = trace([{ t: 'laser', x: -30, y: 15.5, angle: 0, nm: 650 }, { t: 'lens', x: 0, y: 0, f: 14, height: 30 }]); ok(r2.paths[0].hits.length === 0, 'a ray past the edge of a lens misses it'); }
// two lenses: the first image is the second lens's object, even when it would form beyond the second lens
{ const r = trace([{ t: 'lamp', x: -70, y: 4, nm: 0, spread: 14, count: 7 }, { t: 'lens', x: -25, y: 0, f: 15, height: 60 }, { t: 'lens', x: 30, y: 0, f: 20, height: 60 }]);
  ok(r.images.length === 2, 'two images'); near(r.images[0].p.x, -2.5, 1e-6, 'first image'); near(r.images[1].p.x, 82, 1e-6, 'second image'); near(r.images[1].s, 32.5, 1e-6, 'its object distance'); near(r.images[1].p.y, 4 * -0.5 * -1.6, 1e-6, 'total magnification');
  const c = trace([{ t: 'lamp', x: -70, y: 4, nm: 0, spread: 14, count: 7 }, { t: 'lens', x: -25, y: 0, f: 15, height: 60 }, { t: 'lens', x: -10, y: 0, f: 20, height: 60 }]);
  // lens 1 would image at x = -2.5, 7.5 cm beyond lens 2: a virtual object, s = -7.5, s' = 1/(1/20 + 1/7.5)
  ok(c.images.length === 1, 'only the final image is shown when the first never forms'); near(c.images[0].s, -7.5, 1e-6, 'a virtual object has negative s'); near(c.images[0].sp, 1 / (1 / 20 + 1 / 7.5), 1e-6, "and the thin-lens equation still gives s'"); }

// ---- the mirror equation (ideal curved mirrors and flat ones) ----
for (const f of [18, 25, -20, -12]) for (const s of [9, 30, 45, 80]) for (const h of [0, 5, -6]) for (const turn of [180, 0, 77]) {
  const N = V.polar(turn), up = V.left(N), obj = V.add(V.mul(N, s), V.mul(up, h)), tag = 'mirror s=' + s + ' f=' + f + ' h=' + h + ' turn=' + turn;
  const r = trace([{ t: 'lamp', x: obj.x, y: obj.y, angle: turn + 180 - deg(Math.atan2(h, s)), nm: 0, spread: 20, count: 9 }, { t: 'mirror', x: 0, y: 0, angle: turn, flat: 0, f, height: 150 }]);
  if (Math.abs(s - f) < 1e-9) { ok(r.images.length === 0, 'object at the focal point, ' + tag); continue; }
  const sp = s * f / (s - f), m = -sp / s, want = V.add(V.mul(N, sp), V.mul(up, m * h)), im = r.images.filter((i) => i.stage === 1);
  ok(im.length === 1, 'one image, ' + tag); if (im.length !== 1) continue;
  near(im[0].p.x, want.x, 1e-3, 'image x, ' + tag); near(im[0].p.y, want.y, 1e-3, 'image y, ' + tag); near(im[0].sp, sp, 1e-3, "s', " + tag); near(im[0].m, m, 1e-6, 'm, ' + tag); ok(im[0].kind === (sp > 0 ? 'real' : 'virtual'), 'kind, ' + tag); }
{ const r = trace([{ t: 'lamp', x: -32, y: 8, angle: -8, nm: 0, spread: 44, count: 9 }, { t: 'mirror', x: 0, y: 0, angle: 180, flat: 1, height: 56 }]), im = r.images[0];
  ok(r.images.length === 1 && im.kind === 'virtual', 'a flat mirror makes a virtual image'); near(im.p.x, 32, 1e-9, 'as far behind as the object is in front'); near(im.p.y, 8, 1e-9, 'level with it'); near(im.m, 1, 1e-9, 'the same size'); near(im.sp, -32, 1e-9, "s' = -s"); }

// ---- a real spherical mirror: f = R/2 near the axis, and aberration away from it ----
for (const f of [20, 30]) { const R = 2 * f;
  for (const h of [0.5, 4, 10, 16]) { const r = trace([{ t: 'laser', x: -60, y: h, angle: 0, nm: 650 }, { t: 'mirror', x: 0, y: 0, angle: 180, flat: 0, f, height: 38 }], { real: 1 });
    const p = r.paths[0], d = p.dirs[1], q = p.hits[0].q, cross = q.x - d.x * q.y / d.y, th = Math.asin(h / R), want = -(R - R / (2 * Math.cos(th)));
    ok(p.hits[0].how === 'reflect', 'reflects off the arc'); near(cross, want, 1e-9, 'crosses the axis where geometry says, h=' + h + ' f=' + f); near(p.hits[0].th1, deg(th), 1e-9, 'angle of incidence on the arc');
    if (h < 1) near(cross, -f, 0.01, 'paraxial rays cross at f = R/2'); else ok(cross > -f, 'marginal rays cross nearer the mirror'); }
  // convex: the reflected ray, traced back, crosses the axis behind the mirror
  const r = trace([{ t: 'laser', x: -60, y: 0.5, angle: 0, nm: 650 }, { t: 'mirror', x: 0, y: 0, angle: 180, flat: 0, f: -f, height: 38 }], { real: 1 }), p = r.paths[0], d = p.dirs[1], q = p.hits[0].q;
  near(q.x - d.x * q.y / d.y, f, 0.01, 'a convex mirror has its focus behind it'); ok(d.x < 0, 'and sends the ray back'); }
{ const r = trace([{ t: 'beam', x: -55, y: 0, nm: 650, width: 34, count: 13 }, { t: 'mirror', x: 0, y: 0, angle: 180, flat: 0, f: 20, height: 38 }], { real: 1 }); ok(r.images.length === 0, 'a wide beam on a spherical mirror has no sharp focus');
  const r2 = trace([{ t: 'beam', x: -55, y: 0, nm: 650, width: 4, count: 13 }, { t: 'mirror', x: 0, y: 0, angle: 180, flat: 0, f: 20, height: 38 }], { real: 1 }); ok(r2.images.length === 1, 'a narrow one does'); near(r2.images[0].p.x, -20, 0.1, 'at f'); }

// ---- a real lens: two spherical faces, shaped so that rays near the axis focus f from its middle ----
{ const { Lens } = require('./load.js');
  for (const f of [8, 15, 20, 40, 120, -10, -20, -60]) for (const n of [1.33, 1.52, 1.9, 2.5]) for (const height of [4, 20, 36, 160]) {
    const sc = scene([{ t: 'lens', x: 0, y: 0, f, height, n }], { real: 1 }), L = sc.els[0], s = L.form, tag = 'f=' + f + ' n=' + n + ' height=' + height;
    ok(isFinite(s.R) && s.R > 0 && s.d > 0 && s.edge > 0, 'a real lens has a shape, ' + tag); near(s.focus, f, 1e-6 * Math.abs(f), 'its paraxial focus is f from the middle, ' + tag);
    ok(s.h <= height / 2 + 1e-9 && s.h <= Lens.CAP * s.R + 1e-9, 'no taller than it was asked to be, nor than its faces allow, ' + tag);
    ok(L.outline().closed && L.surfaces().length === 4, 'drawn and traced as a piece of glass, ' + tag); }
  // paraxial rays cross the axis at f, marginal ones nearer the lens (spherical aberration)
  for (const f of [20, 40]) { const cross = (y) => { const r = trace([{ t: 'laser', x: -60, y, angle: 0, nm: 589 }, { t: 'lens', x: 0, y: 0, f, height: 60, n: 1.52 }], { real: 1 }), p = r.paths[0], q = p.pts[p.pts.length - 1], d = p.dirs[p.dirs.length - 1];
      ok(p.hits.length === 2 && p.hits.every((h) => h.how === 'refract'), 'in and out of the glass, y=' + y); return q.x - d.x * q.y / d.y; };
    near(cross(0.05), f, 0.02, 'paraxial rays focus at f, f=' + f); const L = scene([{ t: 'lens', f, height: 60, n: 1.52 }], { real: 1 }).els[0], edge = 0.9 * Math.min(L.form.h, 0.5 * L.form.R);      // (nearer the rim than half the radius, rays are totally reflected inside)
    ok(cross(edge) < cross(edge / 2) && cross(edge / 2) < f, 'farther from the axis, nearer the lens, f=' + f); }
  { const wide = trace([{ t: 'beam', x: -60, y: 0, nm: 589, width: 22, count: 9 }, { t: 'lens', x: 0, y: 0, f: 20, height: 60 }], { real: 1 }); ok(wide.images.length === 0, 'a wide beam through a strong real lens has no sharp focus');
    const thin = trace([{ t: 'beam', x: -60, y: 0, nm: 589, width: 1, count: 5 }, { t: 'lens', x: 0, y: 0, f: 20, height: 60 }], { real: 1 }); ok(thin.images.length === 1 && thin.images[0].focus, 'a narrow one has');
    near(thin.images[0].p.x, 20, 0.05, 'at f'); near(thin.images[0].sp, 20, 0.05, "s' = f for the real lens too"); ok(thin.images[0].s === Infinity, 'from infinitely far');
    const ideal = trace([{ t: 'beam', x: -60, y: 0, nm: 589, width: 22, count: 9 }, { t: 'lens', x: 0, y: 0, f: 20, height: 60 }]); ok(ideal.images.length === 1, 'the ideal lens focuses the wide beam'); }
  // a point source near the axis: s and s' are measured from the middle of the lens, as for the ideal one
  { const r = trace([{ t: 'lamp', x: -60, y: 0.2, angle: 0, nm: 589, spread: 1, count: 5 }, { t: 'lens', x: 0, y: 0, f: 20, height: 40 }], { real: 1 }); ok(r.images.length === 1 && r.images[0].kind === 'real', 'a real lens forms a real image');
    near(r.images[0].s, 60, 1e-9, 's from the middle of the lens'); // (a real lens is thick: only parallel light is sure to focus exactly f from its middle)
    near(r.images[0].sp, 30, 2.5, "s' close to the thin-lens value"); near(r.images[0].m, -0.5, 0.05, 'm close to the thin-lens value'); }
  // a diverging real lens: the rays seem to come from f behind it
  { const r = trace([{ t: 'beam', x: -60, y: 0, nm: 589, width: 0.6, count: 5 }, { t: 'lens', x: 0, y: 0, f: -20, height: 40 }], { real: 1 }); ok(r.images.length === 1 && r.images[0].kind === 'virtual', 'a diverging real lens: a virtual focus'); near(r.images[0].p.x, -20, 0.05, 'f behind it'); }
  // nothing is lost inside: no ray that enters the glass is left there
  { const r = trace([{ t: 'lamp', x: -30, y: 3, nm: 0, spread: 80, count: 31 }, { t: 'lens', x: 0, y: 0, f: 12, height: 50 }], { real: 1, chroma: 1 }); ok(finite(r) && r.paths.every((p) => p.open), 'every ray gets out of a real lens'); } }

// ---- chromatic aberration: with the glass dispersing, blue focuses nearer than red ----
{ const focus = (nm, real) => { const r = trace([{ t: 'beam', x: -60, y: 0, nm, width: real ? 1 : 20, count: 5 }, { t: 'lens', x: 0, y: 0, f: 30, height: 60, n: 1.52, spread: 0.04 }], { chroma: 1, real: real ? 1 : 0 });
    ok(r.images.length === 1, 'one focus, ' + nm + ' nm'); return r.images[0].p.x; };
  for (const real of [false, true]) { const red = focus(650, real), yellow = focus(589, real), blue = focus(450, real), tag = real ? ' (real lens)' : ' (ideal lens)';
    near(yellow, 30, real ? 0.05 : 1e-9, 'yellow light focuses at f' + tag); ok(blue < yellow && yellow < red, 'blue nearer, red farther' + tag); ok(red - blue > 0.5, 'by a visible amount' + tag); }
  // the ideal lens's f(lambda) is the lensmaker's equation with n(lambda)
  const L = scene([{ t: 'lens', f: 30, n: 1.52, spread: 0.04 }], { chroma: 1 }).els[0]; near(L.focalAt(450), 30 * 0.52 / (Glass.index(1.52, 0.04, 450) - 1), 1e-12, 'f(450 nm)');
  near(L.focalAt(589), 30, 1e-12, 'f is quoted for 589 nm');
  const off = scene([{ t: 'lens', f: 30, n: 1.52, spread: 0.04 }]).els[0]; ok(off.focalAt(450) === 30 && !off.shows('n') && !off.shows('spread'), 'with both switches off the glass does not matter (and is not shown)');
  const white = trace([{ t: 'beam', x: -60, y: 0, nm: 0, width: 20, count: 7 }, { t: 'lens', x: 0, y: 0, f: 30, height: 60, n: 1.52, spread: 0.04 }], { chroma: 1 }); ok(white.images.length === 1, 'white light: the image is given for yellow'); near(white.images[0].p.x, 30, 1e-9, 'at f'); }

// ---- a prism: deviation, minimum deviation, dispersion ----
for (const n of [1.5, 1.62]) for (const A of [40, 60]) { const half = rad(A / 2), Dmin = 2 * deg(Math.asin(n * Math.sin(half))) - A;
  let best = Infinity;
  for (let inc = 30; inc <= 80; inc += 0.25) { // the left face's outward normal points at 180 - (90 - A/2) = 90 + A/2 ... measured from +x
    const Nang = 180 - A / 2, mid = { x: -0.5 * 30 * Math.sin(half), y: 30 * Math.cos(half) * (2 / 3 - 0.5) }, from = V.at(mid, V.polar(Nang + inc), 40);
    const r = trace([{ t: 'laser', x: from.x, y: from.y, angle: Nang + inc + 180, nm: 589 }, { t: 'prism', x: 0, y: 0, n, spread: 0, apex: A, side: 30 }]), p = r.paths[0];
    if (p.hits.length !== 2 || p.hits[1].how !== 'refract' || p.hits[0].part !== 2 || p.hits[1].part !== 1 || p.hits[0].th2 >= A) continue;      // (in the left face, out the right, the usual side of the normal)
    const th1 = p.hits[0].th1, th4 = p.hits[1].th2, D = Math.abs(Angle.diff(Angle.of(p.dirs[0]), Angle.of(p.dirs[2])));
    near(th1, inc, 1e-6, 'incidence on the prism face'); near(D, th1 + th4 - A, 1e-6, 'deviation = th1 + th2 - A, n=' + n + ' A=' + A + ' inc=' + inc); near(p.hits[0].th2 + p.hits[1].th1, A, 1e-6, 'the two inside angles add to the apex angle');
    best = Math.min(best, D); }
  near(best, Dmin, 0.01, 'minimum deviation matches n = sin((A + D)/2) / sin(A/2), n=' + n + ' A=' + A); }
near(Glass.index(1.62, 0.04, 589), 1.62, 1e-12, 'the index is quoted at 589 nm'); near(Glass.index(1.62, 0.04, 400) - Glass.index(1.62, 0.04, 700), 0.04, 1e-12, 'dispersion is n(400) - n(700)');
ok(Glass.index(1.0, 0.2, 700) >= 1, 'an index never drops below 1');
{ const r = trace([{ t: 'laser', x: -54, y: -15, angle: 24, nm: 0 }, { t: 'prism', x: 0, y: 0, n: 1.62, spread: 0.04, apex: 60, side: 34 }, { t: 'screen', x: 70, y: -22, angle: 156, height: 40 }]);
  ok(r.stats.rays === Spectrum.WHITE.length && r.spots.length === Spectrum.WHITE.length, 'white light is every colour, and each reaches the screen');
  const by = r.spots.slice().sort((a, b) => a.nm - b.nm); let mono = true; for (let i = 1; i < by.length; i++) if (!(by[i].q.y > by[i - 1].q.y)) mono = false;
  ok(mono, 'the colours land in order, violet bent the most'); ok(V.dist(by[0].q, by[by.length - 1].q) > 2, 'spread over a few centimetres');
  ok(r.paths.length === 1 && r.paths[0].nm === Spectrum.REF, 'one reference path, at 589 nm');
  const flat = trace([{ t: 'laser', x: -54, y: -15, angle: 24, nm: 0 }, { t: 'prism', x: 0, y: 0, n: 1.62, spread: 0, apex: 60, side: 34 }, { t: 'screen', x: 70, y: -22, angle: 156, height: 40 }]);
  ok(flat.spots.every((s) => V.dist(s.q, flat.spots[0].q) < 1e-9), 'with no dispersion white stays white'); }
// a right-angle prism turns a beam back by two total internal reflections
{ const r = trace([{ t: 'beam', x: -50, y: 6, nm: 650, width: 6, count: 3 }, { t: 'prism', x: 8, y: 0, angle: 270, n: 1.52, spread: 0.018, apex: 90, side: 30 }]);
  for (const p of r.paths) { ok(p.hits.map((h) => h.how).join() === 'refract,tir,tir,refract', 'in, two reflections, out'); near(Angle.diff(Angle.of(p.dirs[4]), 180), 0, 1e-9, 'sent straight back'); } }

// ---- partial reflections share the light out ----
for (const n of [1.33, 1.5, 2.42]) { const r = trace([{ t: 'laser', x: -30, y: 0, angle: 0, nm: 589 }, { t: 'block', x: 0, y: 0, n, spread: 0, width: 10, height: 30 }], { partial: 1 });
  const R = ((n - 1) / (n + 1)) ** 2, back = r.segs.find((s) => !s.main && s.k === 1); ok(!!back, 'a reflection splits off the front face'); near(back.I, R, 1e-12, 'normal incidence: R = ((n - 1)/(n + 1))^2, n=' + n);
  near(r.segs.find((s) => s.main && s.k === 1).I, 1 - R, 1e-12, 'and the rest goes in'); ok(r.segs.every((s) => s.I >= Tracer.I_MIN * 0.99 && s.I <= 1 + 1e-12), 'no piece is brighter than the source'); }
{ const off = trace([{ t: 'laser', x: -30, y: 3, angle: 12, nm: 0 }, { t: 'prism', x: 0, y: 0 }]), on = trace([{ t: 'laser', x: -30, y: 3, angle: 12, nm: 0 }, { t: 'prism', x: 0, y: 0 }], { partial: 1 });
  ok(on.segs.length > off.segs.length && off.segs.every((s) => s.main), 'partial reflections are extra, and only when asked for'); }

// ---- an object: its tip's principal rays, the unseen rays from its foot, and the image of the whole ----
{ const { Figure } = require('./load.js');
  for (const f of [20, -15]) for (const s0 of [45, 30, 12]) for (const h of [10, 4]) { const tag = 'object s=' + s0 + ' f=' + f + ' h=' + h;
    const sc = scene([{ t: 'object', x: -s0, y: 0, height: h }, { t: 'lens', x: 0, y: 0, f, height: 60 }]), o = sc.els[0], r = Tracer.trace(sc);
    ok(o.target === sc.els[1], 'faces the lens, ' + tag); const pr = o.principals(); ok(pr && pr.length === 3, 'three principal rays, ' + tag);
    near(Angle.of(pr[0]), 0, 1e-9, 'one parallel to the axis'); near(V.cross(pr[1], V.sub(o.tip, { x: 0, y: 0 })), 0, 1e-9, 'one at the centre');
    const F = { x: -f, y: 0 }; near(V.cross(pr[2], V.sub(F, o.tip)), 0, 1e-9, 'one along the line through the near focal point');
    ok(r.paths.length === 3 && r.ghosts.length === 3 && r.stats.rays === 3 * o.wavelengths.length, 'three rays seen, three not, ' + tag);
    ok(r.segs.every((g) => !(g.a.x === -s0 && g.a.y === 0)), 'nothing is drawn from the foot');
    if (Math.abs(s0 - f) < 1e-9) continue;
    const sp = s0 * f / (s0 - f), m = -sp / s0, im = r.images; ok(im.length === 1, 'one image, ' + tag); if (im.length !== 1) continue;
    near(im[0].p.x, sp, 1e-6, 'image of the tip, x, ' + tag); near(im[0].p.y, m * h, 1e-6, 'image of the tip, y, ' + tag); near(im[0].m, m, 1e-6, 'm, ' + tag);
    ok(!!im[0].foot, 'the foot is imaged too, ' + tag); if (!im[0].foot) continue; near(im[0].foot.x, sp, 1e-6, 'the foot images at the same distance'); near(im[0].foot.y, 0, 1e-6, 'on the axis'); ok(im[0].tilt === 1, 'a lens turns the picture, never mirrors it'); }
  // in a flat mirror: upright, the same size, and mirrored
  { const r = trace([{ t: 'object', x: -30, y: -5, height: 8, angle: 0 }, { t: 'mirror', x: 0, y: 0, angle: 180, flat: 1, height: 60 }]), im = r.images[0];
    ok(r.images.length === 1 && im.kind === 'virtual' && !!im.foot, 'a flat mirror: a virtual image of the whole object'); near(im.p.x, 30, 1e-9, 'as far behind'); near(im.p.y - im.foot.y, 8, 1e-9, 'upright, the same height'); ok(im.tilt === -1, 'and mirrored'); }
  // a concave mirror, object outside C: real, inverted, smaller
  { const r = trace([{ t: 'object', x: -60, y: 0, height: 10 }, { t: 'mirror', x: 0, y: 0, angle: 180, flat: 0, f: 20, height: 60 }]), im = r.images.find((i) => i.stage === 1);
    ok(!!im && im.kind === 'real', 'a concave mirror makes a real image'); near(im.p.x, -30, 1e-6, "s' = 30"); near(im.p.y, -5, 1e-6, 'inverted, half the size'); ok(im.tilt === -1 && !!im.foot, 'its picture is mirrored and turned'); }
  // with nothing to aim at, an object sends a fan; and it can always be asked for one
  { const sc = scene([{ t: 'object', x: 0, y: 0, height: 10, count: 7, spread: 30 }]), o = sc.els[0]; ok(!o.principal && o.emit().filter((r) => !r.ghost).length === 7, 'no lens: a fan'); ok(o.shows('spread') && o.shows('count'), 'whose settings are shown');
    const sc2 = scene([{ t: 'object', x: -40, y: 0, rays: 'fan', count: 7 }, { t: 'lens', x: 0, y: 0, f: 20 }]); ok(Tracer.trace(sc2).paths.length === 7 && sc2.els[0].shows('spread'), 'or by choice');
    const sc3 = scene([{ t: 'object', x: -40, y: -10, height: 10 }, { t: 'lens', x: 0, y: 0, f: 20 }]), o3 = sc3.els[0]; ok(!o3.principal, 'a tip on the axis cannot have principal rays told apart');
    const sc4 = scene([{ t: 'object', x: 40, y: 0 }, { t: 'lens', x: 0, y: 0, f: 20 }]); ok(!sc4.els[0].target, 'a lens behind the object is not its target');
    const sc5 = scene([{ t: 'object', x: -40, y: 0 }, { t: 'mirror', x: 0, y: 0, angle: 0, flat: 0, f: 20 }]); ok(!sc5.els[0].target, 'nor is a mirror seen from behind'); }
  // white light from an object: still three paths, one per principal ray
  { const r = trace([{ t: 'object', x: -45, y: 0, height: 10, nm: 0 }, { t: 'lens', x: 0, y: 0, f: 20, height: 60 }]); ok(r.paths.length === 3 && r.stats.rays === 3 * Spectrum.WHITE.length, 'white: every colour traced, one path each'); } }

// ---- nothing runs for ever ----
{ const r = trace([{ t: 'laser', x: 0, y: 0, angle: 1, nm: 650 }, { t: 'mirror', x: 20, y: 0, angle: 180, flat: 1, height: 100 }, { t: 'mirror', x: -20, y: 0, angle: 0, flat: 1, height: 100 }]);
  ok(r.stats.trapped === 1 || r.paths[0].open, 'a ray between two mirrors is stopped or escapes'); ok(r.segs.length <= Tracer.MAX_HITS + 2, 'within its allowance'); }
{ const els = [{ t: 'lamp', x: 0, y: 0, nm: 0, spread: 360, count: 61 }]; for (let i = 0; i < 6; i++) { const a = i * 60, p = V.polar(a, 40); els.push({ t: 'mirror', x: p.x, y: p.y, angle: a + 180, flat: 1, height: 60 }); }
  const t0 = Date.now(), r = trace(els, { partial: 1 }); ok(r.segs.length <= Tracer.MAX_SEGS, 'a hall of mirrors stays inside the budget'); ok(r.stats.capped, 'and says it was cut short'); ok(Date.now() - t0 < 1500, 'quickly'); ok(finite(r), 'with finite numbers'); }

// ---- random benches: whatever is built, the tracer returns finite light and stops ----
{ let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff), pick = (a) => a[Math.floor(rnd() * a.length)], types = ['laser', 'beam', 'lamp', 'object', 'lens', 'mirror', 'prism', 'block', 'half', 'screen'];
  for (let trial = 0; trial < 400; trial++) { const els = [], n = 2 + Math.floor(rnd() * 7);
    for (let i = 0; i < n; i++) { const t = i === 0 ? pick(['laser', 'beam', 'lamp', 'object']) : pick(types), e = { t, x: Math.round(rnd() * 160 - 80), y: Math.round(rnd() * 100 - 50), angle: Math.round(rnd() * 72) * 5 };
      if (t === 'lens' || t === 'mirror') e.f = (rnd() < 0.5 ? -1 : 1) * (2 + Math.round(rnd() * 60)); if (t === 'mirror') { e.flat = rnd() < 0.3 ? 1 : 0; }
      if (t === 'object') { e.height = 1 + Math.round(rnd() * 30); e.picture = pick(['arrow', 'tree', 'dog']); e.rays = pick(['principal', 'fan']); }
      if (t === 'laser' || t === 'beam' || t === 'lamp') e.nm = pick([0, 450, 532, 650]); if (t === 'lamp') e.spread = pick([20, 90, 360]); els.push(e); }
    const r = trace(els, { partial: trial % 3 === 0 ? 1 : 0, real: trial % 4 < 2 ? 1 : 0, chroma: trial % 5 < 2 ? 1 : 0 });
    ok(r.ghosts.every((p) => p.dirs.every((d) => Math.abs(V.len(d) - 1) < 1e-9)), 'ghost paths stay finite, trial ' + trial);
    ok(finite(r), 'finite, trial ' + trial); ok(r.segs.length <= Tracer.MAX_SEGS, 'bounded, trial ' + trial);
    ok(r.images.every((i) => isFinite(i.p.x) && isFinite(i.p.y) && ['real', 'virtual'].includes(i.kind)), 'images are points, trial ' + trial);
    ok(r.paths.every((p) => p.dirs.every((d) => Math.abs(V.len(d) - 1) < 1e-9)), 'directions stay unit vectors, trial ' + trial);
    ok(r.paths.every((p) => p.hits.every((h) => h.th1 === undefined || (h.th1 >= 0 && h.th1 <= 90 + 1e-9))), 'angles are between 0 and 90, trial ' + trial); } }

done('tracer');
