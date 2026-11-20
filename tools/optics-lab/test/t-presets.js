// The built-in benches, checked against what the textbook equations say they should show.
const L = require('./load.js'), { ok, near, done, PRESETS, PRESET, Scene, Tracer, Workbench, Panel, ShareLink } = L;
const scene = (key) => { const p = PRESET(key); return Scene.from({ els: p.els, opts: p.opts }); };
const run = (key) => Tracer.trace(scene(key));
const image = (r, i, kind, x, y, msg) => { const im = r.images[i]; ok(!!im, msg + ': image ' + (i + 1) + ' exists'); if (!im) return {};
  ok(im.kind === kind, msg + ': ' + kind + ' (got ' + im.kind + ')'); near(im.p.x, x, 0.02, msg + ' x'); near(im.p.y, y, 0.02, msg + ' y'); return im; };

// every preset: loads, traces completely, survives a share link, and has a distinct name
const seen = new Set();
for (const p of PRESETS) { ok(!seen.has(p.key) && !seen.has(p.label), p.key + ': unique key and label'); seen.add(p.key); seen.add(p.label);
  ok(p.label.length <= 28 && p.note.length > 8, p.key + ': has a short label and a note');
  const s = scene(p.key), r = Tracer.trace(s);
  ok(s.els.length >= 2 && s.sources.length >= 1, p.key + ': has a source and something in its way');
  ok(!r.stats.capped && !r.stats.trapped, p.key + ': traced to the end');
  ok(r.paths.length >= 1 && r.segs.length >= r.paths.length, p.key + ': has light');
  ok(r.segs.every((g) => isFinite(g.a.x) && isFinite(g.a.y) && isFinite(g.b.x) && isFinite(g.b.y)), p.key + ': every ray is finite');
  const back = Scene.decode(s.encode()); ok(back && back.snapshot() === s.snapshot(), p.key + ': share code round-trips');
  ok(ShareLink.scene({ preset: p.key }).snapshot() === s.snapshot(), p.key + ': opens from ?preset=');
  const b = new Workbench(); ok(b.loadPreset(p.key), p.key + ': loads on a bench'); ok(b.view.zoom >= L.View.ZMIN && b.view.zoom <= L.View.FITMAX + 1e-9, p.key + ': fits the view');
  const v = b.view.visible; for (const el of b.scene.els) ok(el.x > v.x0 && el.x < v.x1 && el.y > v.y0 && el.y < v.y1, p.key + ': ' + el.name + ' is in view'); }
ok(PRESET('nope') == null && ShareLink.scene({ preset: 'nope' }) === null, 'an unknown preset is nothing');

// ---- thin lens: s = 45, f = 20 -> s' = 36, m = -0.8 ----
{ const r = run('lens'), im = image(r, 0, 'real', 36, -4, 'lens'); ok(r.images.length === 1, 'lens: one image');
  near(im.s, 45, 1e-6, 'lens s'); near(im.sp, 36, 1e-6, "lens s'"); near(im.m, -0.8, 1e-6, 'lens m'); near(1 / im.s + 1 / im.sp, 1 / 20, 1e-9, 'lens: thin-lens equation'); ok(!im.focus, 'lens: an image, not a focus'); }

// ---- diverging lens, parallel light: a virtual focus at f = -20 ----
{ const r = run('diverging'), im = image(r, 0, 'virtual', -20, 0, 'diverging'); ok(im.focus === true, 'diverging: called a focus'); ok(im.s === Infinity, 'diverging: s is infinite'); near(im.sp, -20, 1e-6, "diverging s'"); ok(im.m === null, 'diverging: no magnification'); }

// ---- concave mirror: s = 45, f = 18 -> s' = 30, m = -2/3 ----
{ const r = run('concave'), im = image(r, 0, 'real', -30, -10 / 3, 'concave'); near(im.s, 45, 1e-6, 'concave s'); near(im.sp, 30, 1e-6, "concave s'"); near(im.m, -2 / 3, 1e-6, 'concave m'); }

// ---- convex mirror: s = 40, f = -20 -> s' = -13.33, m = +1/3 ----
{ const r = run('convex'), im = image(r, 0, 'virtual', 40 / 3, 2, 'convex'); near(im.s, 40, 1e-6, 'convex s'); near(im.sp, -40 / 3, 1e-6, "convex s'"); near(im.m, 1 / 3, 1e-6, 'convex m'); }

// ---- flat mirror: the image is as far behind as the object is in front ----
{ const r = run('flat'), im = image(r, 0, 'virtual', 32, 8, 'flat'); near(im.s, 32, 1e-6, 'flat s'); near(im.sp, -32, 1e-6, "flat s'"); near(im.m, 1, 1e-6, 'flat m'); }

// ---- Snell's law through a block: 40 deg -> 25.06 deg -> 40 deg, and the ray leaves parallel to how it came ----
{ const r = run('snell'), p = r.paths[0], h = p.hits; ok(h.length === 2 && h[0].how === 'refract' && h[1].how === 'refract', 'snell: refracts in and out');
  near(h[0].th1, 40, 1e-6, 'snell: in at 40'); near(h[0].th2, L.Angle.deg(Math.asin(Math.sin(L.Angle.rad(40)) / 1.52)), 1e-6, 'snell: what n = 1.52 gives'); near(h[0].th2, 25.02, 0.01, 'snell: 25.02');
  near(h[1].th1, h[0].th2, 1e-6, 'snell: same angle at the far face'); near(h[1].th2, 40, 1e-6, 'snell: out at 40');
  ok(h[0].inside === true && h[1].inside === false, 'snell: inside the glass between the faces');
  near(L.V.cross(p.dirs[0], p.dirs[2]), 0, 1e-9, 'snell: leaves parallel to the way it came'); ok(L.V.dist(p.pts[1], p.pts[2]) > 5, 'snell: crosses the block'); }

// ---- total internal reflection in a half-disc: no bend at the curved face, TIR at the flat one ----
{ const r = run('tir'), h = r.paths[0].hits; ok(r.stats.tir === 1, 'tir: one total reflection'); ok(h.length === 3 && h[1].how === 'tir', 'tir: at the flat face');
  near(h[0].th1, 0, 1e-3, 'tir: meets the curved face head-on'); near(h[2].th1, 0, 1e-3, 'tir: and leaves through it head-on');
  ok(h[1].th1 > L.Angle.deg(Math.asin(1 / 1.49)), 'tir: beyond the critical angle'); near(L.V.len(h[1].dout), 1, 1e-9, 'tir: reflected direction is a unit vector'); }

// ---- prism and white light: violet is turned more than red, and the colours land in order on the screen ----
{ const r = run('prism'), spots = r.spots.slice().sort((a, b) => a.nm - b.nm); ok(spots.length === L.Spectrum.WHITE.length, 'prism: every colour reaches the screen');
  const along = spots.map((s) => s.q.y); let mono = true; for (let i = 1; i < along.length; i++) if (!(along[i] > along[i - 1]) && !(along[i] < along[i - 1])) mono = false;
  const up = along[along.length - 1] > along[0]; for (let i = 1; i < along.length; i++) if ((along[i] > along[i - 1]) !== up) mono = false; ok(mono, 'prism: the spectrum is in order');
  ok(Math.abs(along[along.length - 1] - along[0]) > 1, 'prism: the spectrum is wide enough to see'); ok(r.stats.tir === 0, 'prism: no total reflection'); }

// ---- two lenses: the first image is the second lens's object ----
{ const r = run('two'); ok(r.images.length === 2, 'two: two images'); const a = image(r, 0, 'real', -2.5, -2, 'two, first'), b = image(r, 1, 'real', 82, 3.2, 'two, second');
  near(a.m, -0.5, 1e-6, 'two: m1'); near(b.s, 32.5, 1e-6, 'two: s2 is measured from the first image'); near(b.sp, 52, 1e-6, "two: s2'"); near(a.m * b.m, 0.8, 1e-6, 'two: overall magnification'); }

// ---- a spherical mirror has no sharp focus; the same mirror made ideal has one ----
{ const s = scene('aberration'), r = Tracer.trace(s); ok(r.images.length === 0, 'aberration: no sharp image');
  const m = s.els.find((e) => e instanceof L.Mirror); ok(m.sphere, 'aberration: the mirror is spherical'); s.opts.real = false; const r2 = Tracer.trace(s);
  ok(r2.images.length === 1 && r2.images[0].focus && r2.images[0].kind === 'real', 'aberration: made ideal, it focuses'); near(r2.images[0].sp, m.f, 1e-6, 'aberration: at f'); }
{ const s = scene('reallens'), r = Tracer.trace(s), lens = s.els.find((e) => e instanceof L.Lens); ok(r.images.length === 0 && lens.glassy, 'reallens: a glass lens, no sharp focus');
  ok(r.paths.every((p) => p.hits.length === 2 && p.open), 'reallens: every ray goes in and out once'); s.opts.real = false; ok(Tracer.trace(s).images.length === 1, 'reallens: made ideal, it focuses'); }
{ const s = scene('chromatic'), r = Tracer.trace(s); ok(r.images.length === 1 && Math.abs(r.images[0].p.x - 30) < 1e-9, 'chromatic: the image is given for yellow, at f');
  const lens = s.els.find((e) => e instanceof L.Lens), spread = lens.focalAt(700) - lens.focalAt(400); ok(spread > 1.5 && spread < 4, 'chromatic: red and violet focus a couple of centimetres apart (' + spread.toFixed(2) + ')');
  ok(lens.material && lens.material.key === 'flint', 'chromatic: a real glass (flint)'); }
{ const s = scene('object'), r = Tracer.trace(s), im = r.images; ok(im.length === 1 && im[0].kind === 'real' && !!im[0].foot, 'object: one real image of the whole arrow');
  near(im[0].p.x, 36, 1e-6, "object: s' = 36"); near(im[0].m, -0.8, 1e-9, 'object: m = -0.8'); near(im[0].p.y - im[0].foot.y, -6.4, 1e-6, 'object: an inverted image 6.4 cm tall'); ok(r.paths.length === 3, 'object: three principal rays'); }

// ---- reflecting prism: two total reflections send the beam back the way it came ----
{ const r = run('periscope'); ok(r.stats.tir === 2 * r.paths.length, 'periscope: two total reflections per ray');
  for (const p of r.paths) { const d0 = p.dirs[0], d1 = p.dirs[p.dirs.length - 1]; near(L.V.dot(d0, d1), -1, 1e-9, 'periscope: comes back antiparallel'); ok(p.open, 'periscope: and leaves the bench'); } }

// ---- hidden mode and the panel never throw, whatever is loaded and selected ----
{ const app = { state: {}, big: false, run: (f) => () => f(), setState() {}, setCanvas() {}, refresh() {}, typeField() {}, endField() {}, copyShare() {}, submitBug() {} };
  for (const p of PRESETS) for (const hidden of [false, true]) { const b = new Workbench(); app.bench = b; b.loadPreset(p.key); b.hide(hidden); const panel = new Panel(app);
    for (const el of [null, ...b.scene.els]) { b.select(el); let v = null; try { v = panel.all(); } catch (e) { ok(false, p.key + ': panel threw with ' + (el ? el.name : 'nothing') + ' selected: ' + e.message); continue; }
      ok(v.hasSel === !!el && v.noSel === !el, p.key + ': selection flags'); ok(typeof v.summaryText === 'string' && v.summaryText.length > 10 && !/undefined|NaN/.test(v.summaryText + v.statusText + v.noImagesText + v.selNote), p.key + ': summary reads cleanly');
      ok(v.hasImages === (v.imageList.length > 0) && (v.hasImages || v.noImagesText.length > 0), p.key + ': images or a reason there are none');
      if (hidden) ok(!v.hasImages && !v.hasLog, p.key + ': nothing given away while hidden');
      for (const f of v.selFields) ok(f.label && isFinite(Number(f.value)) && f.min < f.max && f.step > 0, p.key + ': field ' + f.label);
      for (const row of [...v.imageList, ...v.selLog]) ok(!/undefined|NaN|null/.test(JSON.stringify(row)), p.key + ': rows read cleanly');
      for (const im of v.imageList) ok(!im.tex || /^s = /.test(im.tex), p.key + ': image formula'); }
    ok(JSON.stringify(b.snapshot()).length > 50, p.key + ': snapshot serialises'); if (hidden) ok(b.snapshot().images.length === 0, p.key + ': snapshot hides images too'); } }

done('t-presets');
