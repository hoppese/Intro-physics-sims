// The workbench, the pointer, the panel and the renderer: every user-level path runs without error,
// and building by hand gives the same physics as the presets.
const L = require('./load.js'), { V, Workbench, PointerTool, Scene, World, PRESETS, Panel, Renderer, Block, Surface, Rope, Spring, Push, ok, near, done } = L;
const at = (b, p, extra) => { const c = b.view.toCanvas(p); return { sx: c.x, sy: c.y, ...b.view.toWorld(c.x, c.y), coarse: false, shift: false, ...extra }; };
const click = (b, t, p) => { const q = at(b, p); t.down(q); t.up(q); };
const drag = (b, t, from, to, extra) => { t.down(at(b, from)); for (let i = 1; i <= 6; i++) t.move(at(b, V.add(from, V.mul(V.sub(to, from), i / 6)), extra)); t.up(at(b, to, extra)); };
// a canvas that draws nothing but notices every call
const grad = { addColorStop() {} }, g = new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 30 }) : (k === 'createRadialGradient' || k === 'createLinearGradient') ? () => grad : (typeof k === 'string' && /^[a-z]/.test(k) && !(k in t) ? () => {} : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
const fakeApp = (b) => ({ bench: b, state: { peek: {} }, big: false, run: (fn) => fn, refresh() {}, setState() {}, setCanvas() {}, typeField() {}, endField() {}, copyShare() {}, submitBug() {} });

// ---- building the table-and-hanging-block problem by hand ----
{ const b = new Workbench(); b.view.resize(560, 400); const t = new PointerTool(b);
  const tbl = b.add('floor'); b.type('x', -3); b.type('y', 1.2); b.type('length', 3); b.endTyping(); ok(tbl instanceof Surface && tbl.y === 1.2, 'a table');
  // a block dropped just above it settles onto it
  const blk = b.add('block'); b.type('x', -1.5); b.type('y', 1.5); b.endTyping(); b.select(blk); drag(b, t, blk.pos, { x: -1.5, y: 1.4 });
  near(blk.y, 1.35, 1e-9, 'a block dropped near the table settles on it'); near(blk.angle, 0, 1e-9, 'level');
  const p = b.add('pulley'); b.type('x', 0.1); b.type('y', 1.35 - 0.08); b.endTyping();
  const hang = b.add('block'); b.type('x', 0.18); b.type('y', 0.5); b.endTyping();
  ok(Math.abs(hang.y - 0.5) < 1e-9, 'a block placed in mid-air stays there');
  // the rope: click the block, the pulley, the hanging block
  b.add('rope'); ok(!!b.link && /Rope/.test(b.linkHint), 'Rope starts joining');
  click(b, t, blk.pos); click(b, t, p.pos); click(b, t, hang.pos);
  const rope = b.scene.ofType(Rope)[0]; ok(!!rope && rope.from === blk.id && rope.to === hang.id && rope.via.length === 1 && rope.via[0] === p.id, 'the rope runs block - pulley - block');
  ok(!b.link && b.selId === rope.id, 'joining ends, with the rope selected');
  const a = (2 - 0.3 * 2) * 9.8 / 4; b.select(tbl); b.pick(tbl.choices()[0].items[1]); // rough: 0.4 / 0.3
  ok(b.world.accel(blk.id).x > 0, 'the hanging block drags the table block'); near(b.world.accel(blk.id).x, a, 1e-6, 'at (m2 - mu_k m1) g / (m1 + m2)');
  // run, then edit: the clock goes back to zero
  b.play(); b.tick(0.05); b.tick(0.05); ok(b.time > 0.09, 'the clock runs'); ok(b.world.body(blk.id).p.x > -1.5, 'and the block moves');
  b.select(hang); b.type('mass', 3); b.endTyping(); ok(b.time === 0 && !b.playing, 'an edit stops the clock and puts it back to zero');
  b.undo(); near(b.scene.get(hang.id).mass, 2, 1e-9, 'undo');
  // a spring and an applied force
  b.add('spring'); click(b, t, b.scene.get(blk.id).pos); click(b, t, p.pos); ok(b.scene.ofType(Spring).length === 0 && !!b.link, 'a spring cannot end on a pulley');
  b.cancelLink(); ok(!b.link, 'Esc stops joining');
  b.add('push'); click(b, t, b.scene.get(hang.id).pos); ok(b.scene.ofType(Push).length === 1, 'an applied force on a block');
  // deleting a block takes its rope and force with it
  b.select(b.scene.get(hang.id)); b.remove(); ok(!b.scene.ofType(Rope).length && !b.scene.ofType(Push).length, 'deleting a block takes away what was tied to it');
  b.undo(); ok(b.scene.ofType(Rope).length === 1 && b.scene.ofType(Push).length === 1, 'and undo brings it all back'); }

// ---- the surface handle: tilt and stretch ----
{ const b = new Workbench(); b.view.resize(560, 400); const t = new PointerTool(b), s = b.add('floor'); b.select(s);
  const h = t.handle(s); drag(b, t, h, V.add(s.a, V.polar(30, 2.4 + 22 / b.view.scale))); near(s.angle, 30, 1e-9, 'the handle tilts a surface'); near(s.length, 2.4, 1e-9, 'and stretches it'); ok(s.kind === 'Ramp', 'into a ramp');
  // swung on over the top, it slopes the other way and still faces up (a block can sit on it)
  const foot = { ...s.a }; drag(b, t, t.handle(s), V.add(foot, V.polar(150, 2.4 + 22 / b.view.scale)));
  near(s.angle, 330, 1e-9, 'swung over, the ramp slopes down to the right'); ok(s.normal.y > 0.5, 'and still faces up'); near(s.length, 2.4, 1e-9, 'the same length');
  ok(V.dist(s.b, foot) < 1e-6, 'its foot stays where it was'); ok(t.handle(s).y > s.a.y && t.handle(s).x < s.a.x, 'and the handle is at its top again');
  drag(b, t, t.handle(s), V.add(foot, V.polar(135, 2 + 22 / b.view.scale))); near(s.angle, 315, 1e-9, 'held there, it turns about its foot again'); ok(V.dist(s.b, foot) < 1e-6, 'which stays put');
  const blk = b.add('block'); b.type('x', s.a.x + 1.2 * s.dir.x); b.type('y', s.a.y + 1.2 * s.dir.y + 0.3); b.endTyping(); b.select(blk); drag(b, t, blk.pos, V.add(blk.pos, { x: 0, y: -0.1 }));
  near(blk.angle, -45, 1e-6, 'a block dropped on it settles onto it, tilted with it');
  // a ceiling keeps facing down
  const c = b.add('floor'); b.type('angle', 180); b.endTyping(); b.select(c); const cf = { ...c.a }; drag(b, t, t.handle(c), V.add(cf, V.polar(-20, 2 + 22 / b.view.scale)));
  ok(c.normal.y < -0.5, 'a ceiling swung under still faces down'); }

// ---- every preset: the panel, the renderer, every selection, forces hidden or not ----
for (const p of PRESETS) { const b = new Workbench(); b.view.resize(560, 400); b.loadPreset(p.key); const panel = new Panel(fakeApp(b)), t = new PointerTool(b), r = new Renderer();
  let fine = true; const check = (what) => { try { panel.all(); r.draw(g, b, t); } catch (e) { fine = false; console.log(p.key, what, e.stack.split('\n').slice(0, 3).join(' | ')); } };
  for (const hid of [false, true]) { b.hide(hid); check('none'); for (const el of b.scene.els) { b.select(el); check(el.type); } b.select(null); }
  b.scene.opts.components = true; b.select(b.scene.blocks[0]); check('components');
  b.play(); for (let i = 0; i < 20; i++) b.tick(0.05); check('running'); b.toggleTape(); b.toggleAngle(); check('measuring');
  ok(fine, p.key + ': the panel and the canvas draw in every state');
  b.hide(false); b.select(b.scene.blocks[0]); const block = panel.inspector(); ok(block.hasForces && block.forceRows.length >= 1 && block.forceRows.every((r) => r.mag !== '?'), p.key + ': a block shows its forces');
  b.hide(true); ok(panel.inspector().forceRows.length === 0 && /hidden/.test(panel.inspector().netText) && b.snapshot().blocks.length === 0, p.key + ': hidden, no forces named or valued anywhere'); b.hide(false);
  const snap = b.snapshot(); ok(snap.blocks.length === b.scene.blocks.length && snap.blocks.every((x) => x.forces.length >= 1), p.key + ': the page reports every block'); }

// ---- no label is written over another (or over the corner controls), in any preset, state or canvas size ----
{ let font = 13; const gw = new Proxy({}, { get: (t, k) => k === 'measureText' ? (str) => ({ width: str.length * font * 0.6 }) : (k === 'createRadialGradient' || k === 'createLinearGradient') ? () => grad : (typeof k === 'string' && /^[a-z]/.test(k) && !(k in t) ? () => {} : t[k]),
    set: (t, k, v) => { if (k === 'font') font = parseFloat(String(v).match(/(\d+(\.\d+)?)px/)[1]); t[k] = v; return true; } });
  for (const [W, H, Z] of [[560, 400, 0], [900, 520, 0], [700, 450, 0.5], [700, 450, 2.5]]) for (const p of PRESETS) { const b = new Workbench(); b.view.resize(W, H); b.loadPreset(p.key); if (Z) { b.view.zoom = Z; b.view.auto = false; } const t = new PointerTool(b), r = new Renderer(); let worst = '';
    const look = (what) => { r.draw(gw, b, t); const L = r.boxes;
      for (let i = 0; i < L.length; i++) for (let j = Math.max(i + 1, 3); j < L.length; j++) { const a = L[i], c = L[j], ox = Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0), oy = Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0); if (ox > 0.5 && oy > 0.5 && !worst) worst = what + ' (boxes ' + i + ', ' + j + ')'; } };
    for (const fbd of [true, false]) { b.scene.opts.fbd = fbd; look(fbd ? 'diagrams' : 'no diagrams'); for (const el of b.scene.blocks) { b.select(el); look('block selected'); b.scene.opts.components = true; look('components'); b.scene.opts.components = false; } b.select(null); }
    b.scene.opts.fbd = true; b.play(); for (let i = 0; i < 6; i++) { b.tick(0.05); look('running'); }
    ok(!worst, p.key + ' at ' + W + ' x ' + H + (Z ? ', zoom ' + Z : '') + ': no label over another, ' + worst); } }

// ---- every preset, left running, comes to a quiet end: nothing drops off the bottom, and once things are still
// the numbers on the page stay still (no flicker between touching and not, taut and slack) ----
{ const Fmt = L.Fmt; for (const p of PRESETS) { const b = new Workbench(); b.view.resize(700, 450); b.loadPreset(p.key); b.play(); let still = null, flick = 0;
    const shown = () => { const w = b.world; return w.bodies.map((x) => Fmt.vec(w.accel(x.id)) + w.forcesOn(x.id).map((f) => Fmt.comp(V.len(f.F))).join(',')).join('|') + w.ropes.map((r) => Fmt.comp(w.tension(r.id) || 0)).join(','); };
    for (let i = 0; i < 1800 && !b.world.stopped; i++) { b.tick(1 / 60); const w = b.world, quiet = w.bodies.every((x) => x.gone || V.len(x.v) < 1e-3);
      if (i >= 1500 && quiet) { const s = shown(); if (still !== null && s !== still) flick++; still = s; } }
    const w = b.world; ok(!w.events.some((e) => /fell/.test(e.text)), p.key + ': left running, nothing falls off the bottom');
    ok(flick === 0, p.key + ': once still, the read-outs hold steady'); } }

// ---- an applied-force arrow is picked by clicking anywhere along it, as drawn, before and after a run ----
for (const key of ['pair', 'push', 'stack']) { const b = new Workbench(); b.view.resize(700, 450); b.loadPreset(key); const t = new PointerTool(b), push = b.scene.ofType(Push)[0];
  const mid = (w) => { const body = w.body(push.on), [a, c] = push.arrowAt(body.p, body.ang, body.w, body.h); return { tail: V.add(a, V.mul(V.sub(c, a), 0.15)), middle: V.mul(V.add(a, c), 0.5) }; };
  for (const where of ['tail', 'middle']) { b.select(null); click(b, t, mid(b.world)[where]); ok(b.selId === push.id, key + ': a click near the ' + where + ' of the force arrow selects it'); }
  b.play(); for (let i = 0; i < 12; i++) b.tick(0.05); b.toggle(); b.select(null); click(b, t, mid(b.world).middle); ok(b.selId === push.id, key + ': and so does one on the arrow where it is now, after a run'); }

// ---- the recording, and going back to a moment in it ----
{ const b = new Workbench(); b.loadPreset('incline'); b.play(); for (let i = 0; i < 60; i++) b.tick(1 / 60); const w = b.world, R = w.rec;
  ok(R.length >= 60 && R.length <= 62 && R[0].t === 0, 'a run is recorded 60 times a second, from t = 0');
  const mid = R[30], blk = b.scene.blocks[0].id; b.seek(mid.t); ok(!b.playing && Math.abs(b.time - mid.t) < 1e-9, 'seeking stops the clock at that moment');
  near(w.body(blk).p.x, mid.b[0].p.x, 1e-12, 'with the block where it was'); near(w.body(blk).v.y, mid.b[0].v.y, 1e-12, 'moving as it was');
  ok(R.length >= 60, 'and the rest of the recording kept'); b.play(); b.tick(1 / 60); ok(w.rec[w.rec.length - 1].t < mid.t + 0.05, 'running on from there records afresh'); }

// ---- a push that grows: static friction keeps up with it to the limit, then kinetic friction takes over ----
{ const b = new Workbench(); b.loadPreset('harder'); b.play(); const w = b.world, fr = (r) => r.f[0].find((f) => f.kind === 'static' || f.kind === 'kinetic');
  for (let i = 0; i < 300; i++) b.tick(1 / 60); const R = w.rec, g = 9.8, lim = 0.4 * 4 * g;
  const at = (t) => R[Math.round(t * 60)]; near(V.len(fr(at(2)).F), 8, 1e-6, 'growing push: at 2 s static friction matches the 8 N push'); ok(fr(at(2)).kind === 'static' && V.len(at(2).b[0].v) < 1e-9, 'and nothing moves');
  ok(fr(at(4.5)).kind === 'kinetic' && at(4.5).b[0].v.x > 0, 'past μs n (' + lim.toFixed(1) + ' N, at ' + (lim / 4).toFixed(2) + ' s) it slides'); near(V.len(fr(at(4.5)).F), 0.3 * 4 * g, 1e-6, 'against kinetic friction, 11.8 N'); }

// ---- the energy books: kept where nothing is lost, thermal where friction acts ----
{ for (const [key, t, lossy] of [['spring', 10, false], ['hanging', 10, false], ['pendulum', 10, false], ['incline', 5, true]]) { const b = new Workbench(); b.loadPreset(key); b.play(); for (let i = 0; i < t * 60; i++) b.tick(1 / 60);
    const R = b.world.rec, E = (r) => r.e.K + r.e.Ug + r.e.Us, last = R[R.length - 1];
    if (lossy) ok(last.e.th > 1 && Math.abs(E(last) + last.e.th - E(R[0])) < 1e-6, key + ': what friction takes shows as thermal energy, and the total holds');
    else ok(Math.abs(E(last) - E(R[0])) < 0.01 * Math.max(1, E(R[0])) && last.e.th < 0.05, key + ': energy is conserved over ' + t + ' s (' + E(R[0]).toFixed(2) + ' → ' + E(last).toFixed(2) + ' J)'); } }

// ---- the graphs and the motion diagram draw in every mode, for every preset, before, during and after a rewind ----
{ const gr = new L.Graphs(), r = new Renderer(); for (const p of PRESETS) { const b = new Workbench(); b.view.resize(700, 450); b.loadPreset(p.key); const t = new PointerTool(b); let fine = true;
    const look = (what) => { for (const k of ['motion', 'forces', 'energy']) for (const ax of ['x', 'y', 's']) { b.graph = k; b.axis = ax; try { gr.draw(g, b, 700, 214); r.draw(g, b, t); } catch (e) { fine = false; console.log(p.key, what, k, ax, e.stack.split('\n').slice(0, 3).join(' | ')); } } };
    b.scene.opts.trails = true; look('set up'); b.play(); for (let i = 0; i < 90; i++) b.tick(1 / 60); look('running'); b.seek(0.5); look('rewound'); b.hide(true); look('hidden');
    ok(fine, p.key + ': graphs and motion diagram draw in every mode'); ok(gr.timeAt(gr.area ? gr.area.x0 : 0) === 0 || !gr.area, p.key + ': the left edge of the graphs is t = 0'); } }

// ---- a selected force's handle is not left behind when the block moves off ----
{ const b = new Workbench(); b.view.resize(560, 400); b.loadPreset('push'); const t = new PointerTool(b), push = b.scene.ofType(Push)[0];
  b.select(push); b.type('F', 20); b.endTyping(); ok(!!t.handle(push), 'a selected force has its handle at the set-up');
  b.play(); for (let i = 0; i < 10; i++) b.tick(0.05); ok(b.world.body(push.on).p.x > b.scene.get(push.on).x + 0.05, 'pushed with 20 N the crate moves');
  ok(t.handle(push) === null, 'and the handle goes away instead of staying where the crate was');
  b.reset(); ok(b.time === 0 && !!t.handle(push), 'back at the start, the handle is back'); }

// ---- Values: the arrows keep their symbols, the numbers come and go ----
{ const { ShareLink } = L; let texts = []; const rec = new Proxy({}, { get: (t, k) => k === 'fillText' ? (str) => texts.push(String(str)) : k === 'measureText' ? () => ({ width: 30 }) : (k === 'createRadialGradient' || k === 'createLinearGradient') ? () => grad : (typeof k === 'string' && /^[a-z]/.test(k) && !(k in t) ? () => {} : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
  const r = new Renderer(), num = () => texts.some((x) => /=\s*-?[0-9]/.test(x) && /N\b/.test(x));
  for (const p of PRESETS) { const b = new Workbench(); b.view.resize(900, 520); b.loadPreset(p.key); const t = new PointerTool(b), panel = new Panel(fakeApp(b));
    texts = []; r.draw(rec, b, t); const had = num(); b.showValues(false); texts = []; r.draw(rec, b, t); const gone = !num();
    const syms = texts.some((x) => /^[wnTfF]$/.test(x)); ok(!had || (gone && syms), p.key + ': Values off drops the numbers, keeps the symbols');
    b.scene.opts.fbd = false; texts = []; r.draw(rec, b, t); ok(!num(), p.key + ': and a rope’s T has no number either'); b.scene.opts.fbd = true;
    b.showValues(true); texts = []; r.draw(rec, b, t); ok(num() === had, p.key + ': back on, the numbers return');
  }
  const b = new Workbench(); b.loadPreset('incline'); b.history.clear(); const panel = new Panel(fakeApp(b)), item = () => panel.all().viewItems.find((x) => x.label === 'Values');
  ok(item() && item().mark === '✓', 'the View menu has Values, ticked'); item().onClick(); ok(!b.values && item().mark === '', 'clicking it turns the numbers off'); ok(!b.history.canUndo, 'which is not an undo step');
  b.loadPreset('table'); ok(!b.values, 'and stays off on another preset');
  const u = ShareLink.url(b.scene, false, b.values); ok(/values=0/.test(u), 'the share link carries values=0'); const back = ShareLink.read(u.slice(u.indexOf('?'))); ok(back.values === false, 'and reads back off');
  ok(ShareLink.read('?preset=incline').values === true && !/values/.test(ShareLink.url(b.scene, false, true)), 'on is the default, left out of the link'); }

done('bench');
