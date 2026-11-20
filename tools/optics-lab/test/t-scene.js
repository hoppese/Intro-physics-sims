// Elements and the scene: limits, naming, and the round trip through text.
const { V, Angle, Fmt, Spectrum, Glass, BOARD, Element, Laser, Beam, Lamp, Figure, Lens, Mirror, Prism, Block, HalfDisc, Screen, ELEMENTS, ADD_MENU, Scene, Tracer, PRESETS, PRESET, ok, near, done } = require('./load.js');

// ---- every element type: defaults are sane, settings stay inside their limits ----
for (const t of Object.keys(ELEMENTS)) { const el = Element.from({ t });
  ok(el && el.type === t, t + ' can be made from its type alone'); ok(el.kind.length > 0 && el.name.length > 0, t + ' has a name');
  for (const s of el.specs()) { if (s.options) { ok(s.options.includes(el[s.key]), t + '.' + s.key + ' starts on one of its options'); ok(!el.set(s.key, 'nonsense') && s.options.includes(el[s.key]), t + '.' + s.key + ' refuses an unknown option'); continue; }
    ok(typeof el[s.key] === 'number' && isFinite(el[s.key]), t + '.' + s.key + ' starts as a number'); const was = el[s.key];
    ok(!el.set(s.key, 'abc') && el[s.key] === was, t + '.' + s.key + ' ignores text'); ok(!el.set(s.key, NaN) && !el.set(s.key, Infinity) && el[s.key] === was, t + '.' + s.key + ' ignores NaN and infinity');
    if (s.key === 'angle') { el.set('angle', 725); near(el.angle, 5, 1e-9, 'angles wrap'); el.set('angle', -90); near(el.angle, 270, 1e-9, 'negative angles wrap'); el.set('angle', was); continue; }
    if (s.key === 'nm') { el.set('nm', 0); ok(el.nm === 0 && el.white, t + ': 0 nm means white'); el.set('nm', 5); ok(el.nm === Spectrum.MIN, t + ': a wavelength below the visible is raised to it'); el.set('nm', was); continue; }
    el.set(s.key, 1e9); ok(el[s.key] === s.max, t + '.' + s.key + ' stops at its maximum'); el.set(s.key, -1e9); ok(el[s.key] === s.min, t + '.' + s.key + ' stops at its minimum'); el.set(s.key, was); ok(el[s.key] === was, t + '.' + s.key + ' goes back'); }
  ok(!el.set('nothing', 3), t + ' has no setting called "nothing"');
  // the shape is where the element is, and moves and turns with it
  const b0 = el.bounds(); ok(b0.x0 <= el.x && b0.x1 >= el.x - 1e-9 && b0.y0 <= el.y + 8 && b0.y1 >= el.y - 8, t + ' sits at its position');
  el.set('x', 30); el.set('y', -12); const b1 = el.bounds(); near(b1.x0 - b0.x0, 30, 1e-9, t + ' moves in x'); near(b1.y0 - b0.y0, -12, 1e-9, t + ' moves in y');
  ok(el.near(el.outline().pts[0]) === 0, t + ': a point of its outline is on it'); ok(el.near({ x: 150, y: 100 }) > 50, t + ': a far point is far');
  const copy = el.clone(); ok(copy !== el && JSON.stringify(copy.toJSON()) === JSON.stringify(el.toJSON()), t + ' clones exactly');
  // turning by the handle: the grip ends up under the pointer
  for (const a of [0, 45, 200]) { const target = V.add(el.pos, V.polar(a, 20)); el.aim(target); const g = el.toWorld(el.grip), d = Angle.diff(Angle.of(V.sub(g, el.pos)), a); near(d, 0, 1e-4, t + ' turns to face the pointer at ' + a); }
  el.aim(V.add(el.pos, V.polar(33, 20)), 5); near(el.angle % 5, 0, 1e-9, t + ' snaps to 5 degrees when asked'); }

// focal lengths: never zero, and the type buttons only change the sign
{ const l = new Lens({ f: 0.5 }); ok(l.f === Lens.FMIN, 'a focal length is never smaller than ' + Lens.FMIN + ' cm'); l.set('f', -0.1); ok(l.f === -Lens.FMIN, 'either sign'); l.set('f', 0); ok(l.f === Lens.FMIN, 'and zero becomes the smallest positive');
  l.set('f', 25); const [conv, div] = l.choices()[0].items; ok(conv.on && !div.on, 'converging is lit'); div.pick(); ok(l.f === -25 && l.kind === 'Diverging lens', 'Diverging flips the sign'); div.pick(); ok(l.f === -25, 'and is not a toggle'); conv.pick(); ok(l.f === 25 && l.kind === 'Converging lens', 'Converging flips it back');
  ok(l.tag === 'f = 25 cm', 'tag: ' + l.tag); l.set('f', -12.5); ok(l.tag === 'f = −12.5 cm', 'a real minus sign in the tag'); }
{ const m = new Mirror(); ok(m.flat === 1 && m.kind === 'Flat mirror' && m.tag === '' && !m.fields().some((f) => f.key === 'f'), 'a flat mirror shows no focal length'); ok(m.choices().length === 1, 'and one row of chips');
  const [flat, cave, vex] = m.choices()[0].items; cave.pick(); ok(!m.flat && m.f > 0 && m.kind === 'Concave mirror' && m.fields().some((f) => f.key === 'f'), 'Concave'); vex.pick(); ok(m.f < 0 && m.kind === 'Convex mirror', 'Convex');
  ok(m.choices().length === 1 && !m.sphere && m.surfaces()[0].kind === 'seg', 'on its own a curved mirror is ideal'); const on = Scene.from({ opts: { real: 1 } }); on.add(m); ok(m.sphere && m.surfaces()[0].kind === 'arc', 'on a bench with Real on, it is an arc');
  flat.pick(); ok(m.flat === 1 && !m.sphere && m.surfaces()[0].kind === 'seg', 'Flat again'); on.remove(m.id); ok(m.scene === null, 'taken off the bench, it forgets it');
  // a spherical mirror is never taller than its sphere, and its ends lie on the arc
  const real = Scene.from({ opts: { real: 1 } }), s = real.add(new Mirror({ flat: 0, f: 5, height: 100 })); ok(s.span <= 2 * s.radius, 'the aperture fits the sphere'); for (const e of s.ends) near(V.dist(e, s.centre), s.radius, 1e-9, 'ends on the arc');
  near(V.dist(s.pos, s.centre), s.radius, 1e-9, 'the vertex is on the arc'); const o = s.outline().pts; ok(o.every((p) => Math.abs(V.dist(p, s.centre) - s.radius) < 1e-9), 'the outline is the arc');
  for (const f of [20, -20]) { const c = real.add(new Mirror({ flat: 0, f, height: 30, angle: 180 })); near(c.centre.x, -2 * f, 1e-9, 'centre of curvature: in front if concave, behind if convex'); } }
// glass: materials, and a boundary that closes with outward normals
for (const t of ['prism', 'block', 'half']) { const g = Element.from({ t, x: 3, y: -4, angle: 25 });
  const [first] = g.choices()[0].items; first.pick(); ok(g.material && g.material.key === 'water' && g.n === 1.333, t + ': Water sets n'); g.set('n', 1.7); ok(g.material === null, t + ': a custom index is no named material');
  const surfs = g.surfaces(), o = g.outline(); ok(o.closed && o.pts.length >= 3, t + ' has a closed outline');
  let cx = 0, cy = 0; for (const p of o.pts) { cx += p.x; cy += p.y; } const c = { x: cx / o.pts.length, y: cy / o.pts.length };
  for (const s of surfs) if (s.kind === 'seg') { near(V.len(s.n), 1, 1e-12, t + ': unit normal'); ok(V.dot(s.n, V.sub(V.mul(V.add(s.a, s.b), 0.5), c)) > 0, t + ': normals point outward'); }
  ok(g.near(c) === 0, t + ': inside counts as on it'); }
{ const p = new Prism({ apex: 60, side: 30 }), c = p.corners(); near(V.dist(c[0], c[2]), 30, 1e-9, 'prism side'); near(V.dist(c[1], c[2]), 30, 1e-9, 'prism side'); near(V.dist(c[0], c[1]), 30, 1e-9, 'a 60 degree prism is equilateral');
  near(c[0].x + c[1].x + c[2].x, 0, 1e-9, 'centred on its centroid'); near(c[0].y + c[1].y + c[2].y, 0, 1e-9, 'centred on its centroid'); }
// sources
{ const b = new Beam({ width: 20, count: 5, angle: 90 }), r = b.emit(); ok(r.length === 5, 'a beam has its rays'); near(V.dist(r[0].p, r[4].p), 20, 1e-9, 'spread over its width'); ok(r.every((x) => Math.abs(x.d.x) < 1e-12 && x.d.y === 1), 'all parallel');
  const l = new Lamp({ spread: 40, count: 9, angle: 10 }), q = l.emit(); near(Angle.of(q[0].d), -10, 1e-9, 'a lamp fans from one edge'); near(Angle.of(q[8].d), 30, 1e-9, 'to the other'); ok(q.every((x) => x.p.x === l.x && x.p.y === l.y), 'from one point');
  const full = new Lamp({ spread: 360, count: 12 }).emit(), angs = full.map((x) => Angle.wrap(Angle.of(x.d))).sort((a, c) => a - c); let even = true; for (let i = 1; i < 12; i++) if (Math.abs(angs[i] - angs[i - 1] - 30) > 1e-6) even = false; ok(even, 'a full circle is shared out evenly, with no doubled ray');
  const w = new Laser({ nm: 0 }); ok(w.white && w.wavelengths.length === Spectrum.WHITE.length && w.refNm === 589 && w.tag === 'white', 'a white laser'); ok(!w.fields().some((f) => f.key === 'nm'), 'shows no wavelength box');
  const [white, red] = w.choices()[0].items; red.pick(); ok(w.nm === 650 && !w.white && w.tag === '650 nm' && w.fields().some((f) => f.key === 'nm'), 'Red'); white.pick(); ok(w.white, 'White');
  ok(Spectrum.WHITE.includes(Spectrum.REF), 'white includes the reference colour'); }
// colours: the parts of white add up to white, and each is a colour
{ const sum = [0, 0, 0]; for (const nm of Spectrum.WHITE) { const c = Spectrum.parts().get(nm); c.forEach((v, i) => { sum[i] += v; }); ok(Math.max(...c) > 0 && Math.max(...c) <= 1, 'part ' + nm + ' is a colour'); }
  ok(sum.every((v) => v >= 1), 'the parts of white add up to white (' + sum.map((v) => v.toFixed(2)) + ')'); ok(Math.max(...sum) / Math.min(...sum) < 1.6, 'without a strong tint');
  const r = Spectrum.rgb(650), g = Spectrum.rgb(532), b = Spectrum.rgb(450); ok(r[0] > 0.9 && r[1] < 0.1 && g[1] > 0.9 && b[2] > 0.9 && b[0] < 0.1, 'red is red, green is green, blue is blue');
  ok(/^rgba\(\d+,\d+,\d+,0\.5\)$/.test(Spectrum.css(532, 0.5)), 'css colour'); }
// numbers
ok(Fmt.num(-0.04, 1) === '0' && Fmt.num(-2.5, 1) === '−2.5' && Fmt.num(36, 1) === '36' && Fmt.num(13.333, 2) === '13.33', 'numbers: no minus zero, a real minus sign, no trailing zeros');
ok(Fmt.num(Infinity) === '∞' && Fmt.cm(20) === '20 cm' && Fmt.deg(19.47) === '19.5°' && Fmt.fix(-0.001, 1) === '0.0' && Fmt.point({ x: 1.26, y: -3 }) === '(1.3, −3)', 'infinity, units, points');

// ---- the scene ----
{ const s = new Scene(); ok(s.isEmpty && s.bounds() === null, 'a new scene is empty');
  const a = s.add({ t: 'lens' }), b = s.add({ t: 'lens', f: -10 }), c = s.add({ t: 'laser' }), d = s.add({ t: 'mirror' });
  ok(a.id === 1 && b.id === 2 && c.id === 3 && d.id === 4, 'ids count up'); const L = s.labels(); ok(L.get(1) === 'Lens 1' && L.get(2) === 'Lens 2' && L.get(3) === 'Laser 1' && L.get(4) === 'Mirror 1', 'labels number each kind');
  s.remove(1); ok(s.label(b) === 'Lens 1' && s.get(1) === null && s.els.length === 3, 'removing renumbers'); const e = s.add({ t: 'prism' }); ok(e.id === 5, 'an id is never reused'); ok(s.add({ t: 'warp-drive' }) === null && s.els.length === 4, 'an unknown type is not added');
  ok(s.remove(99) === null, 'removing what is not there does nothing');
  for (let i = 0; i < 40; i++) s.add({ t: 'screen' }); ok(s.els.length === Scene.MAX && s.full, 'the bench holds at most ' + Scene.MAX); }
// text and back
for (const p of PRESETS) { const s = Scene.from({ els: p.els, opts: p.opts }); ok(s.els.length === p.els.length, p.key + ': every element is understood');
  const back = Scene.restore(s.snapshot()); ok(back.snapshot() === s.snapshot(), p.key + ': snapshot round trip'); const code = s.encode(), dec = Scene.decode(code);
  ok(/^[A-Za-z0-9_-]+$/.test(code), p.key + ': a share code is safe in a URL'); ok(dec && dec.snapshot() === s.snapshot(), p.key + ': share-link round trip'); ok(code.length < 600, p.key + ': and short (' + code.length + ')');
  ok(JSON.stringify(Tracer.trace(dec).segs) === JSON.stringify(Tracer.trace(s).segs), p.key + ': the decoded bench traces identically');
  const b = s.bounds(); ok(b.x0 >= BOARD.x0 && b.x1 <= BOARD.x1 && b.y0 >= BOARD.y0 && b.y1 <= BOARD.y1, p.key + ' is on the bench'); ok(p.label && p.note, p.key + ' has a label and a note'); }
ok(new Set(PRESETS.map((p) => p.key)).size === PRESETS.length && PRESET('lens') === PRESETS[0] && PRESET('nope') === null, 'preset keys are unique');
{ const s = Scene.from({ els: PRESET('lens').els }); s.opts.angles = true; s.opts.grid = false; const d = Scene.decode(s.encode()); ok(d.opts.angles === true && d.opts.grid === false && d.opts.images === true, 'view switches travel in the link');
  for (const junk of ['', '!!!', 'AAAA', 'eyJ4IjoxfQ', Scene.b64('{"e":[["lens","a",null,{}],["??",1,2,3],7,null,["laser",1e99,-1e99,1e99,-5]]}'), 'x'.repeat(30000), null, 12]) { const d2 = Scene.decode(junk);
    ok(d2 === null || (d2 instanceof Scene && d2.els.every((e) => e.x >= BOARD.x0 && e.x <= BOARD.x1 && isFinite(e.angle))), 'junk decodes to nothing or to something valid'); }
  const j = Scene.decode(Scene.b64('{"e":[["lens","a",null,{}],["??",1,2,3],7,null,["laser",1e99,-1e99,1e99,-5]]}')); ok(j && j.els.length === 2 && j.els[1].x === BOARD.x1 && j.els[1].y === BOARD.y0 && j.els[1].nm === Spectrum.MIN, 'bad numbers are clamped, bad entries dropped');
  ok(Scene.from(null).isEmpty && Scene.from({ els: 'no' }).isEmpty && Scene.restore('{{{').isEmpty, 'nonsense makes an empty scene');
  const many = Scene.from({ els: Array.from({ length: 100 }, () => ({ t: 'laser' })) }); ok(many.els.length === Scene.MAX, 'too many elements are cut to the limit'); }
// the Add menu
{ ok(ADD_MENU.every((m) => Element.from(m.make) && m.label && m.hint && m.group), 'everything on the Add menu can be made'); ok(new Set(ADD_MENU.map((m) => m.key)).size === ADD_MENU.length, 'with unique keys');
  const kinds = ADD_MENU.map((m) => Element.from(m.make).kind); for (const want of ['Laser', 'Parallel beam', 'Point source', 'Converging lens', 'Diverging lens', 'Flat mirror', 'Concave mirror', 'Convex mirror', 'Prism', 'Glass block', 'Semicircular block', 'Screen']) ok(kinds.includes(want), 'the menu offers a ' + want); }

done('scene');
