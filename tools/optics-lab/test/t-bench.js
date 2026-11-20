// The workbench and the pointer: everything a person can do to the bench, and that every bit of it can be undone.
const L = require('./load.js'), { ok, near, done, Workbench, PointerTool, Scene, View, History, ShareLink, ADD_MENU, Lens, Mirror, Prism, Block, Laser, V } = L;
const snap = (b) => b.scene.snapshot();
// a pointer event at a place on the bench, as the Component would hand it over
const at = (b, p, extra) => { const c = b.view.toCanvas(p); return { sx: c.x, sy: c.y, ...b.view.toWorld(c.x, c.y), coarse: false, shift: false, ...extra }; };
const px = (b, sx, sy, extra) => ({ sx, sy, ...b.view.toWorld(sx, sy), coarse: false, shift: false, ...extra });

// ---- adding: every menu entry makes its element, selects it, and is one undo step ----
for (const m of ADD_MENU) { const b = new Workbench(), before = snap(b), el = b.add(m.key);
  ok(!!el && b.scene.els.length === 1 && b.selected === el, m.key + ': added and selected'); ok(el.type === m.make.t, m.key + ': right type');
  ok(Number.isInteger(el.x) && Number.isInteger(el.y), m.key + ': lands on the grid'); const v = b.view.visible; ok(el.x > v.x0 && el.x < v.x1 && el.y > v.y0 && el.y < v.y1, m.key + ': lands in view');
  ok(b.history.past.length === 1, m.key + ': one undo step'); ok(b.undo() && snap(b) === before && b.selId === 0, m.key + ': undo removes it'); ok(b.redo() && b.scene.els.length === 1, m.key + ': redo brings it back');
  ok(isFinite(b.result.stats.rays), m.key + ': traces alone on the bench'); }
ok(new Workbench().add('nonsense') === null, 'an unknown key adds nothing');

// two of the same kind do not land on top of one another
{ const b = new Workbench(), a = b.add('lens+'), c = b.add('lens+'), d = b.add('lens+'); ok(V.dist(a.pos, c.pos) > 3 && V.dist(c.pos, d.pos) > 3 && V.dist(a.pos, d.pos) > 3, 'new elements are placed apart');
  ok(b.scene.label(a) === 'Lens 1' && b.scene.label(d) === 'Lens 3', 'and are numbered'); }

// the bench is full at Scene.MAX: nothing is added, nothing is recorded, and it says why
{ const b = new Workbench(); for (let i = 0; i < Scene.MAX; i++) b.add('flat'); ok(b.scene.els.length === Scene.MAX && b.scene.full, 'fills up'); const n = b.history.past.length, rev = b.rev;
  ok(b.add('flat') === null && b.scene.els.length === Scene.MAX && b.history.past.length === n, 'refuses one more'); ok(b.notice && /24/.test(b.notice.text), 'and says so'); ok(b.rev === rev, 'without touching the bench');
  b.select(b.scene.els[0]); ok(b.duplicate() === null && b.scene.els.length === Scene.MAX, 'nor a copy'); ok(b.remove() && b.scene.els.length === Scene.MAX - 1 && b.add('flat'), 'room again after removing one'); }

// ---- remove, duplicate, rotate, nudge ----
{ const b = new Workbench(); b.loadPreset('lens'); b.history.clear(); const lens = b.scene.els.find((e) => e instanceof Lens), s0 = snap(b);
  ok(b.remove() === false && b.duplicate() === null, 'nothing selected: nothing happens'); b.rotate(15); b.nudge(1, 0); ok(snap(b) === s0 && !b.history.canUndo, 'still nothing');
  b.select(lens); const c = b.duplicate(); ok(c && c.id !== lens.id && c.x === lens.x + 6 && c.y === lens.y - 6 && c.f === lens.f, 'duplicate: a shifted copy'); ok(b.selected === c, 'the copy is selected');
  ok(b.scene.label(c) === 'Lens 2', 'the copy is numbered'); b.undo(); ok(snap(b) === s0, 'duplicate undone');
  b.select(b.scene.get(lens.id)); b.rotate(15); b.rotate(15); ok(b.selected.angle === 30, 'two turns'); ok(b.history.past.length === 1, 'quick turns are one undo step'); b.undo(); ok(snap(b) === s0, 'turns undone together');
  b.select(b.scene.get(lens.id)); b.nudge(1, 0); b.nudge(0, -1); b.nudge(0.1, 0); near(b.selected.x, lens.x + 1.1, 1e-9, 'nudge x'); near(b.selected.y, lens.y - 1, 1e-9, 'nudge y'); ok(b.history.past.length === 1, 'a run of nudges is one step');
  b.rotate(-15); ok(b.history.past.length === 2, 'a different kind of change is its own step'); b.undo(); b.undo(); ok(snap(b) === s0, 'both undone'); ok(!b.undo(), 'nothing more to undo'); ok(b.redo() && b.redo() && !b.redo(), 'redo twice');
  b.select(b.scene.get(lens.id)); b.remove(); ok(b.scene.els.length === 1 && b.selId === 0, 'removed'); ok(b.result.images.length === 0, 'the light follows: no lens, no image'); b.undo(); ok(b.result.images.length === 1, 'and back'); }

// ---- typing a value: follows every keystroke, one undo step for the run, Escape puts it back ----
{ const b = new Workbench(); b.loadPreset('lens'); b.history.clear(); const id = b.scene.els.find((e) => e instanceof Lens).id, s0 = snap(b); b.select(b.scene.get(id));
  ok(b.type('f', 2) && b.selected.f === 2, 'first keystroke'); ok(b.type('f', 25) && b.selected.f === 25, 'second keystroke'); ok(!b.history.canUndo, 'not recorded mid-run'); near(b.result.images[0].sp, 1 / (1 / 25 - 1 / 45), 1e-6, 'the image follows the typing');
  b.endTyping(); ok(b.history.past.length === 1, 'one step when done'); b.undo(); ok(snap(b) === s0, 'undo restores the old value');
  b.select(b.scene.get(id)); b.type('f', 33); b.endTyping(true); ok(snap(b) === s0 && !b.history.canUndo, 'Escape: as if nothing was typed'); ok(b.selected && b.selected.f === 20, 'and the element is still selected');
  ok(!b.type('f', NaN) && !b.type('nope', 3), 'nonsense is ignored'); b.endTyping(); ok(snap(b) === s0, 'and changes nothing');
  b.type('f', 9999); ok(b.selected.f === 200, 'clamped to the range'); b.type('f', 0); ok(b.selected.f !== 0, 'a lens never has f = 0'); b.endTyping(true);
  b.type('height', 50); b.select(null); ok(b.history.past.length === 1 && b.scene.get(id).height === 50, 'clicking away ends the run and keeps the value');
  const laser = new Workbench(); laser.add('laser'); ok(!laser.type('nm', 0) && laser.selected.nm === 650, 'typing 0 nm does not turn a laser white'); ok(laser.type('nm', 532) && laser.selected.nm === 532, 'typing a wavelength works'); }

// ---- chips: pick() ----
{ const b = new Workbench(); const m = b.add('concave'); ok(!m.choices().some((g) => g.label === 'Shape'), 'a mirror has no shape of its own'); b.toggle('real');
  ok(b.selected.sphere === true, 'Real makes it spherical'); ok(b.history.past.length === 2, 'the switch is a step'); b.undo(); ok(b.selected && !b.selected.sphere, 'undone');
  const type = b.selected.choices().find((g) => g.label === 'Type'); b.pick(type.items.find((i) => /convex/i.test(i.label))); ok(b.selected.kind === 'Convex mirror', 'a pick');
  // a lens shows its glass only once it is real or disperses
  const l = b.add('lens+'); ok(!l.fields().some((f) => f.key === 'n') && !l.choices().some((g) => g.label === 'Material'), 'an ideal lens has no glass to set');
  b.toggle('real'); ok(b.selected.fields().some((f) => f.key === 'n') && !b.selected.fields().some((f) => f.key === 'spread') && b.selected.choices().some((g) => g.label === 'Material'), 'a real one has an index');
  b.toggle('chroma'); ok(b.selected.fields().some((f) => f.key === 'spread'), 'and with Chromatic on, a dispersion'); b.toggle('real'); ok(b.selected.fields().some((f) => f.key === 'n'), 'an ideal lens that disperses still has an index');
  b.toggle('chroma'); ok(!b.selected.fields().some((f) => f.key === 'n'), 'both off: no glass');
  // the switches survive undo, copies and share links
  b.toggle('real'); const c = b.duplicate(); ok(c.real && c.glassy, 'a copy is on the same bench'); const back = Scene.decode(b.scene.encode()); ok(back.opts.real && back.els.every((e) => e.scene === back), 'a share link keeps the switch');
  b.undo(); b.undo(); ok(!b.scene.opts.real && b.scene.els.every((e) => e.scene === b.scene), 'undo restores the switch, and every element knows its bench');
  // an object: picture and rays chips
  const o = b.add('object'); ok(o.picture === 'arrow' && o.rays === 'principal', 'an object starts as an arrow with principal rays'); const pic = o.choices().find((g) => g.label === 'Picture'); b.pick(pic.items.find((i) => /dog/i.test(i.label)));
  ok(b.selected.picture === 'dog', 'it can be a dog'); b.undo(); ok(b.selected.picture === 'arrow', 'and back'); b.remove(); b.remove(); b.select(b.scene.els[0]);
  const p = b.add('prism'), mat = p.choices().find((g) => g.label === 'Material'); b.pick(mat.items.find((i) => /water/i.test(i.label))); near(b.selected.n, 1.333, 1e-9, 'material sets n'); near(b.selected.spread, 0.013, 1e-9, 'and dispersion');
  ok(b.selected.choices().find((g) => g.label === 'Material').items.filter((i) => i.on).length === 1, 'and its chip is lit'); }

// ---- view switches are part of the scene, and undoable ----
{ const b = new Workbench(); b.loadPreset('lens'); b.history.clear(); for (const k of Object.keys(Scene.OPTS)) { const was = b.scene.opts[k]; b.toggle(k); ok(b.scene.opts[k] === !was, k + ' toggles'); b.undo(); ok(b.scene.opts[k] === was, k + ' undo'); }
  b.toggle('nope'); ok(!b.history.canUndo && !('nope' in b.scene.opts), 'an unknown switch is ignored');
  b.toggle('partial'); const lit = b.result.segs.length; b.toggle('partial'); ok(b.result.segs.length <= lit, 'partial reflections add light, never remove it'); }

// ---- presets, clear, hide ----
{ const b = new Workbench(); b.loadPreset('prism'); const s1 = snap(b); b.loadPreset('lens'); ok(b.selId === 0, 'a preset deselects'); b.undo(); ok(snap(b) === s1, 'loading a preset is undoable'); ok(!b.loadPreset('nope') && snap(b) === s1, 'unknown preset: untouched');
  b.clear(); ok(b.scene.isEmpty && b.view.zoom === 1 && b.view.cx === 0, 'clear empties the bench and resets the view'); const n = b.history.past.length; b.clear(); ok(b.history.past.length === n, 'clearing an empty bench records nothing'); b.undo(); ok(snap(b) === s1, 'clear is undoable');
  const rev = b.rev; b.hide(true); ok(b.hidden && b.rev === rev + 1, 'hide'); b.hide(true); ok(b.rev === rev + 1, 'hiding twice is once'); ok(b.snapshot().hidden && b.snapshot().images.length === 0, 'reported as hidden'); b.hide(false); ok(!b.hidden, 'show');
  }

// ---- history: a new change forgets the redo list; it is bounded ----
{ const b = new Workbench(); b.add('laser'); b.add('block'); b.undo(); ok(b.history.canRedo, 'can redo'); b.add('prism'); ok(!b.history.canRedo, 'a new change clears redo');
  const h = new History(5); for (let i = 0; i < 12; i++) h.record('s' + i); ok(h.past.length === 5, 'history is bounded'); ok(h.undo('now') === 's11', 'and keeps the newest'); }

// ---- the view: canvas <-> bench round trips, zoom about a point, pan, fit ----
{ const v = new View(); v.resize(560, 400); for (const z of [0.5, 1, 2.3]) { v.zoom = z; v.cx = 7; v.cy = -3;
    for (const p of [{ x: 0, y: 0 }, { x: -31.5, y: 12 }, { x: 60, y: -44 }]) { const c = v.toCanvas(p), w = v.toWorld(c.x, c.y); near(w.x, p.x, 1e-9, 'round trip x'); near(w.y, p.y, 1e-9, 'round trip y'); } }
  v.zoom = 1; v.cx = 0; v.cy = 0; const up = v.toCanvas({ x: 0, y: 10 }), o = v.toCanvas({ x: 0, y: 0 }); ok(up.y < o.y, 'y points up on the bench, down on the canvas'); near(o.x, 280, 1e-9, 'origin is centred'); near(o.y, 200, 1e-9, 'origin is centred');
  const before = v.toWorld(400, 120); v.zoomAbout(400, 120, 1.7); const after = v.toWorld(400, 120); near(after.x, before.x, 1e-9, 'zoom keeps the point under the pointer'); near(after.y, before.y, 1e-9, 'zoom keeps the point under the pointer'); ok(v.auto === false, 'zooming takes over from auto-fit');
  v.zoomAbout(0, 0, 1e9); ok(v.zoom === View.ZMAX, 'zoom is capped'); v.zoomAbout(0, 0, 1e-9); ok(v.zoom === View.ZMIN, 'and floored'); ok(/^\d+%$/.test(v.percent), 'percent reads ' + v.percent);
  v.zoom = 1; v.cx = 0; v.cy = 0; const w0 = v.toWorld(100, 100); v.panBy(30, -20); const w1 = v.toWorld(130, 80); near(w1.x, w0.x, 1e-9, 'pan carries the bench with the pointer'); near(w1.y, w0.y, 1e-9, 'pan carries the bench with the pointer');
  v.panBy(1e7, 1e7); const vis = v.visible; ok(vis.x1 > L.BOARD.x0 && vis.x0 < L.BOARD.x1 && vis.y1 > L.BOARD.y0 && vis.y0 < L.BOARD.y1, 'the bench cannot be panned out of sight');
  v.fit({ x0: -50, y0: -10, x1: 50, y1: 10 }); ok(v.auto && Math.abs(v.cx) < 1e-9 && Math.abs(v.cy) < 1e-9, 'fit centres'); const f = v.visible; ok(f.x0 <= -50 && f.x1 >= 50 && f.y0 <= -10 && f.y1 >= 10, 'fit shows the whole box');
  v.fit({ x0: -1, y0: -1, x1: 1, y1: 1 }); ok(v.zoom <= View.FITMAX + 1e-9, 'fit does not zoom in absurdly on a small bench'); v.fit(null); ok(v.zoom === 1 && v.cx === 0 && v.cy === 0, 'fitting nothing resets');
  ok(v.resize(560, 400) === false && v.resize(900, 500) === true, 'resize reports a change'); const c2 = v.toCanvas({ x: 0, y: 0 }); near(c2.x, 450, 1e-9, 'centre follows the size'); near(c2.y, 250, 1e-9, 'centre follows the size'); }

// ---- the pointer: click to select, drag to move (one undo step), Escape to put back ----
{ const b = new Workbench(); b.view.resize(560, 400); b.loadPreset('lens'); b.history.clear(); const t = new PointerTool(b), live = b.scene.els.find((e) => e instanceof Lens), lens = { id: live.id, x: live.x, y: live.y, pos: { ...live.pos } }, s0 = snap(b);
  t.move(at(b, lens.pos)); ok(b.hoverId === lens.id, 'hover finds the lens');
  t.down(at(b, lens.pos)); ok(b.selId === lens.id && t.busy, 'press selects'); t.up(at(b, lens.pos)); ok(snap(b) === s0 && !b.history.canUndo && !t.busy, 'a click moves nothing');
  // a drag: 12.4 cm right, 7.7 cm up -> snapped to whole centimetres
  const from = at(b, lens.pos), to = at(b, { x: lens.x + 12.4, y: lens.y + 7.7 }); t.down(from); t.move(at(b, { x: lens.x + 5, y: lens.y + 2 })); t.move(to);
  const moved = b.scene.get(lens.id); ok(moved.x === lens.x + 12 && moved.y === lens.y + 8, 'drag moves it, snapped to 1 cm (' + moved.x + ', ' + moved.y + ')'); ok(!b.history.canUndo, 'not recorded mid-drag');
  near(b.result.images[0].s, 45 + 12, 1e-6, 'the light follows the drag'); t.up(to); ok(b.history.past.length === 1, 'the drag is one undo step'); b.undo(); ok(snap(b) === s0, 'undo puts it back');
  // Shift: 0.1 cm
  b.select(null); t.down(at(b, b.scene.get(lens.id).pos)); t.move(at(b, { x: lens.x + 3.34, y: lens.y }, { shift: true })); near(b.scene.get(lens.id).x, lens.x + 3.3, 1e-6, 'Shift-drag snaps to 0.1 cm');
  ok(t.cancel() === true && snap(b) === s0 && !b.history.canUndo && !t.busy, 'Escape mid-drag puts it back'); ok(t.cancel() === false, 'nothing to cancel afterwards');
  // a tiny wobble is still a click
  t.down(px(b, from.sx, from.sy)); t.move(px(b, from.sx + 2, from.sy + 1)); t.up(px(b, from.sx + 2, from.sy + 1)); ok(snap(b) === s0 && !b.history.canUndo, 'a 2 px wobble is a click, not a drag');
  // pressing empty bench: a click deselects, a drag pans
  const empty = px(b, 30, 370); ok(t.pick(empty) === null, 'the corner is empty'); t.down(empty); t.up(empty); ok(b.selId === 0, 'a click on empty bench deselects');
  b.select(b.scene.get(lens.id)); const cx = b.view.cx; t.down(empty); t.move(px(b, 80, 340)); ok(b.view.cx !== cx && t.busy, 'a drag on empty bench pans'); t.up(px(b, 80, 340)); ok(b.selId === lens.id, 'and keeps the selection'); ok(snap(b) === s0 && !b.history.canUndo, 'panning is not an edit');
  t.down(px(b, 80, 340)); t.move(px(b, 200, 200)); t.cancel(); t.leave(); ok(b.hoverId === 0 && t.pointer === null, 'leaving clears the hover'); }

// ---- the turning handle ----
{ const b = new Workbench(); b.view.resize(560, 400); b.loadPreset('lens'); b.history.clear(); const t = new PointerTool(b), live = b.scene.els.find((e) => e instanceof Lens), lens = { id: live.id, angle: live.angle, height: live.height, pos: { ...live.pos } }, s0 = snap(b); b.select(live);
  const h = t.handle(live), hp = at(b, h); ok(V.dist(h, lens.pos) > lens.height / 2, 'the handle is beyond the end of the lens'); ok(t.onHandle(hp), 'and can be hit'); ok(!t.onHandle(at(b, lens.pos)), 'the middle of the lens is not the handle');
  t.move(hp); ok(t.overHandle, 'hovering the handle is noticed'); t.down(hp); ok(t.mode === 'turn' && t.busy && !t.turning, 'pressing it starts a turn (not yet a drag)');
  // carry the handle a quarter turn round the lens
  const r = V.dist(h, lens.pos), a0 = L.Angle.of(V.sub(h, lens.pos)); t.move(at(b, V.add(lens.pos, V.polar(a0 + 47, r)))); const turned = b.scene.get(lens.id); ok(t.turning === turned, 'now it is turning');
  near(L.Angle.diff(lens.angle, turned.angle), 45, 1e-6, 'turned, in 5-degree steps'); t.up(at(b, V.add(lens.pos, V.polar(a0 + 47, r)))); ok(b.history.past.length === 1, 'one undo step'); b.undo(); ok(snap(b) === s0, 'undone');
  b.select(b.scene.get(lens.id)); const h2 = t.handle(b.selected); t.down(at(b, h2)); t.move(at(b, V.add(lens.pos, V.polar(a0 + 12.4, r)), { shift: true })); near(L.Angle.diff(lens.angle, b.selected.angle), 12, 1e-6, 'Shift turns in 1-degree steps'); t.cancel(); ok(snap(b) === s0, 'cancelled'); }

// ---- stretching ----
{ const b = new Workbench(); b.view.resize(560, 400); b.edit((s) => { s.add({ t: 'lens', x: 0, y: 0, f: 20, height: 30 }); s.add({ t: 'mirror', x: 60, y: 0, flat: 0, f: 15, height: 30 }); s.add({ t: 'object', x: -40, y: 0, height: 10 }); }); b.fit(); b.history.clear();
  const t = new PointerTool(b), [lens, mir, obj] = b.scene.els, s0 = snap(b), live = (e) => b.scene.get(e.id);
  b.select(live(lens)); const top = at(b, { x: 0, y: 15 }); ok(t.onStretch(top) && t.onStretch(at(b, { x: 0, y: -15 })), "a lens's two ends are stretch squares"); ok(!t.onHandle(top), 'and are clear of the turning handle');
  t.move(top); ok(t.overStretch && t.cursor === 'ns-resize', 'hovering one offers an up-down resize');
  t.down(top); ok(t.mode === 'stretch', 'pressing it starts a stretch'); t.move(at(b, { x: 3, y: 22.3 })); near(live(lens).height, 45, 1e-9, 'dragging the top end to 22.3 cm gives a 45 cm lens (about its middle)'); ok(live(lens).x === 0 && live(lens).y === 0 && live(lens).f === 20, 'which stays put, with f unchanged');
  t.up(at(b, { x: 3, y: 22.3 })); ok(b.history.past.length === 1, 'one undo step');
  t.down(at(b, { x: 0, y: -22.5 })); t.move(at(b, { x: 0, y: -8.13 }, { shift: true })); near(live(lens).height, 16.3, 1e-9, 'the bottom end works too; Shift gives 0.1 cm'); t.cancel(); near(live(lens).height, 45, 1e-9, 'Escape puts it back');
  b.select(live(mir)); const me = live(mir).ends[0]; ok(t.onStretch(at(b, me)), "a mirror's end is a stretch square"); t.down(at(b, me)); t.move(at(b, { x: 60, y: -20 })); near(live(mir).height, 40, 1e-9, 'a mirror stretches about its middle'); t.up(at(b, { x: 60, y: -20 }));
  b.select(live(obj)); const tip = at(b, live(obj).tip); ok(t.onStretch(tip) && !t.onHandle(tip), "an object's tip is a stretch square, clear of its turning handle");
  t.down(tip); t.move(at(b, { x: -40, y: 16 })); ok(live(obj).height === 16 && live(obj).y === 0, 'stretching the tip changes the height; the foot stays'); t.move(at(b, { x: -40, y: -5 })); ok(live(obj).height === 1, 'it cannot go below its smallest height'); t.up(at(b, { x: -40, y: -5 }));
  b.select(null); ok(!t.onStretch(tip), 'nothing to stretch with nothing selected');
  while (b.history.canUndo) b.undo(); ok(snap(b) === s0, 'all undone'); }

// ---- dragging a focal point ----
{ const b = new Workbench(); b.view.resize(560, 400); b.edit((s) => { s.add({ t: 'lens', x: 0, y: 0, f: 20, height: 30 }); s.add({ t: 'mirror', x: 60, y: 0, flat: 0, f: 15, height: 30 }); }); b.fit(); b.history.clear();
  const t = new PointerTool(b), [lens, mir] = b.scene.els, s0 = snap(b), A = (x) => at(b, V.at(lens.pos, lens.dir, x));
  const F = at(b, V.at(lens.pos, lens.dir, 20)); t.move(F); ok(t.overFocus && b.hotFocus && b.hotFocus.k === 1, 'hovering F is noticed'); ok(t.cursor === 'grab', 'and the cursor offers to grab it');
  t.down(F); ok(t.mode === 'focus' && b.selId === lens.id, 'pressing F starts a focus drag and selects the lens');
  t.move(A(32.4)); near(b.scene.get(lens.id).f, 32, 1e-9, 'dragging F out lengthens f, in 1 cm steps'); t.up(A(32.4)); ok(b.history.past.length === 1 && !b.hotFocus, 'one undo step, and the highlight goes');
  t.down(A(32)); t.move(A(-25)); const L2 = b.scene.get(lens.id); near(L2.f, -25, 1e-9, 'dragged through the lens, it turns diverging'); ok(!L2.converging, 'and says so');
  near(V.dist(V.at(L2.pos, L2.dir, L2.f), V.at(lens.pos, lens.dir, -25)), 0, 1e-9, 'the F that was dragged stays under the pointer'); t.move(A(18)); near(b.scene.get(lens.id).f, 18, 1e-9, 'and back to converging'); t.up(A(18));
  const Fb = at(b, V.at(lens.pos, lens.dir, -18)); t.down(Fb); t.move(at(b, V.at(lens.pos, lens.dir, -30))); near(b.scene.get(lens.id).f, 30, 1e-9, 'the F on the other side works too'); t.cancel(); near(b.scene.get(lens.id).f, 18, 1e-9, 'Escape puts f back');
  t.down(Fb); t.move(at(b, V.at(lens.pos, lens.dir, -12.37), { shift: true })); near(b.scene.get(lens.id).f, 12.4, 1e-9, 'Shift gives 0.1 cm steps'); t.cancel();
  const M = (x) => at(b, V.at(mir.pos, mir.dir, x)); t.down(M(30)); ok(t.mode === 'focus' && t.k === 2, "a mirror's C can be dragged"); t.move(M(50)); near(b.scene.get(mir.id).f, 25, 1e-9, 'C at 50 cm means f = 25 cm'); t.up(M(50));
  t.down(M(25)); t.move(M(-10)); ok(b.scene.get(mir.id).f === -10 && b.scene.get(mir.id).kind === 'Convex mirror', 'F dragged behind the mirror makes it convex'); t.up(M(-10));
  while (b.history.canUndo) b.undo(); ok(snap(b) === s0, 'all undone'); }

// ---- picking: a thin element in front of glass wins; of two overlapping, the later one ----
{ const b = new Workbench(); b.view.resize(560, 400); b.edit((s) => { s.add({ t: 'block', x: 0, y: 0, width: 40, height: 40 }); s.add({ t: 'lens', x: 0, y: 0, f: 20, height: 30 }); s.add({ t: 'block', x: 30, y: 0, width: 40, height: 40 }); }); b.fit();
  const t = new PointerTool(b), [b1, lens, b2] = b.scene.els; ok(t.pick(at(b, { x: 0, y: 5 })) === lens, 'the lens inside the block is picked'); ok(t.pick(at(b, { x: -12, y: 5 })) === b1, 'the block elsewhere');
  ok(t.pick(at(b, { x: 15, y: 0 })) === b2, 'where two blocks overlap, the later one'); ok(t.pick(at(b, { x: 80, y: 60 })) === null, 'nothing far away');
  const fine = at(b, { x: 0, y: 15 + 10 / b.view.scale }), coarse = { ...fine, coarse: true }; ok(t.pick({ ...at(b, { x: 40, y: 20 + 11 / b.view.scale }), coarse: true }) === b2, 'a finger has a wider reach'); ok(t.pick(at(b, { x: 40, y: 20 + 11 / b.view.scale })) === null, 'than a mouse'); }

// ---- fingers: one drags, two pinch (and the pinch abandons the drag) ----
{ const b = new Workbench(); b.view.resize(560, 400); b.loadPreset('lens'); b.history.clear(); const t = new PointerTool(b), live = b.scene.els.find((e) => e instanceof Lens), lens = { id: live.id, x: live.x, pos: { ...live.pos } }, s0 = snap(b), f = (p) => ({ ...p, coarse: true });
  const c = b.view.toCanvas(lens.pos); t.touchDown(1, f(px(b, c.x, c.y))); ok(b.selId === lens.id, 'a finger selects'); t.touchMove(1, f(px(b, c.x + 60, c.y))); ok(b.scene.get(lens.id).x > lens.x, 'and drags');
  t.touchDown(2, f(px(b, c.x + 160, c.y))); ok(snap(b) === s0 && !t.busy && t.pinch, 'a second finger abandons the drag and starts a pinch');
  const z = b.view.zoom; t.touchMove(2, f(px(b, c.x + 260, c.y))); ok(b.view.zoom > z, 'spreading the fingers zooms in'); const cy0 = b.view.cy; t.touchMove(1, f(px(b, c.x + 60, c.y + 40))); t.touchMove(2, f(px(b, c.x + 260, c.y + 40))); ok(b.view.cy !== cy0, 'moving both pans');
  t.touchUp(2, f(px(b, 0, 0))); ok(!t.pinch, 'lifting one ends the pinch'); t.touchMove(1, f(px(b, c.x - 100, c.y))); ok(snap(b) === s0, 'the finger left behind does not drag anything'); t.touchUp(1, f(px(b, 0, 0))); ok(t.touches.size === 0 && !b.history.canUndo, 'all up, nothing changed');
  ok(t.touchMove(9, f(px(b, 1, 1))) === false && t.touchUp(9, f(px(b, 1, 1))) === false, 'an unknown finger is ignored');
  t.touchDown(3, f(px(b, c.x, c.y))); t.touchMove(3, f(px(b, c.x + 60, c.y))); t.touchUp(3, f(px(b, c.x + 60, c.y)), true); ok(snap(b) === s0, 'a cancelled touch puts things back'); t.touchDown(4, f(px(b, 5, 5))); t.reset(); ok(t.touches.size === 0, 'reset forgets the fingers'); }

// ---- share links ----
{ const b = new Workbench(); b.loadPreset('two'); b.toggle('extend'); const url = ShareLink.url(b.scene, true), q = url.slice(url.indexOf('?')), link = ShareLink.read(q);
  ok(link.hide === true && typeof link.lab === 'string' && link.preset === null, 'the link carries the bench and the hidden flag'); const s = ShareLink.scene(link); ok(s && s.snapshot() === snap(b) && s.opts.extend === true, 'and opens as the same bench');
  ok(ShareLink.read('?hide=0').hide === false && ShareLink.read('?hide=false').hide === false && ShareLink.read('?hide=1').hide === true && ShareLink.read('').hide === false, 'hide flag');
  ok(ShareLink.scene(ShareLink.read('?lab=garbage%%%')) === null && ShareLink.scene(ShareLink.read('?lab=')) === null && ShareLink.scene(null) === null, 'a broken link is no bench');
  ok(ShareLink.scene(ShareLink.read('?lab=garbage&preset=tir')).els.length === 2, 'a broken bench falls back to the preset named'); ok(!/[^\x21-\x7e]/.test(url), 'the link is plain ASCII'); ok(url.length < 600, 'and short (' + url.length + ')');
  const big = new Workbench(); for (let i = 0; i < Scene.MAX; i++) big.add(ADD_MENU[i % ADD_MENU.length].key); const long = ShareLink.url(big.scene, false); ok(long.length < 2000, 'a full bench still fits in a URL (' + long.length + ')');
  ok(ShareLink.scene(ShareLink.read(long.slice(long.indexOf('?')))).snapshot() === snap(big), 'and round-trips'); }

// ---- the report for whoever embeds the page ----
{ const b = new Workbench(); b.loadPreset('lens'); const s = b.snapshot(); ok(s.elements.length === 2 && s.elements[1].label === 'Lens 1' && s.elements[1].kind === 'Converging lens', 'elements are named'); ok(s.images.length === 1 && s.images[0].kind === 'real' && s.images[0].sPrime === 36 && s.images[0].m === -0.8 && s.images[0].by === 'Lens 1', 'the image is reported');
  ok(s.selected === null, 'nothing selected'); b.select(b.scene.els[1]); ok(b.snapshot().selected === 'Lens 1', 'selection is reported'); b.loadPreset('diverging'); ok(b.snapshot().images[0].s === 'Infinity', 'an infinite object distance survives JSON'); JSON.stringify(b.snapshot()); }

// ---- the Add menu's pictures are well-formed SVG (a repeated attribute makes the browser draw nothing) ----
const UI = L.UI;
if (UI) { for (const m of ADD_MENU) { const css = UI.icons[m.key]; ok(typeof css === 'string' && css.includes('data:image/svg+xml,'), m.key + ' has a picture'); if (!css) continue;
    const svg = decodeURIComponent(css.slice(css.indexOf('svg+xml,') + 8, css.lastIndexOf("')")));
    for (const tag of svg.match(/<[a-z]+ [^>]*>/g) || []) { const names = (tag.match(/ ([a-z-]+)=/g) || []); ok(new Set(names).size === names.length, m.key + ': no attribute twice in ' + tag.slice(0, 40)); } } }
else ok(false, 'UI is not loaded in the tests');

// ---- copies made one after another stay in sight, and no two land on the same spot ----
{ const b = new Workbench(); b.loadPreset('prism'); b.select(b.scene.els[0]);
  for (let i = 0; i < 12; i++) { const c = b.duplicate(), v = b.view.visible; ok(c && c.x > v.x0 && c.x < v.x1 && c.y > v.y0 && c.y < v.y1, 'copy ' + (i + 1) + ' is on screen'); }
  const at = b.scene.els.map((e) => e.x + ',' + e.y); ok(new Set(at).size === at.length, 'every copy has its own place'); }

// ---- the tape measure and the angle tool ----
{ const b = new Workbench(); b.view.resize(560, 400); b.loadPreset('snell'); b.history.clear(); const t = new PointerTool(b), m = b.measure, s0 = snap(b);
  const click = (q, extra) => { const p = at(b, q, extra); t.down(p); t.up(p); }, drag = (from, to, extra) => { t.down(at(b, from)); t.move(at(b, V.add(from, V.mul(V.sub(to, from), 0.5)), extra)); t.move(at(b, to, extra)); t.up(at(b, to, extra)); };
  ok(b.toggleTape() && !!m.tape && m.length > 1, 'the tape comes out'); const len0 = m.length, a0 = { ...m.tape.a };
  drag(m.tape.b, V.add(m.tape.b, { x: 7.3, y: 0 })); ok(Math.abs(m.length - len0 - 7.5) < 1e-9 || Math.abs(m.length - len0 - 7) < 1e-9, 'dragging its hook pulls it out, to 0.5 cm (' + m.length + ')'); ok(V.dist(m.tape.a, a0) < 1e-9, 'the case stays put');
  drag(m.tape.b, V.add(m.tape.b, { x: 1.23, y: 0 }), { shift: true }); near((m.length * 10) % 1, 0, 1e-6, 'with Shift, 0.1 cm');
  const mid = V.mul(V.add(m.tape.a, m.tape.b), 0.5), L1 = m.length; drag(mid, V.add(mid, { x: 0, y: -10 })); near(m.length, L1, 1e-9, 'dragging the tape moves it whole'); near(m.tape.a.y, a0.y - 10, 1e-9, 'by the drag');
  ok(snap(b) === s0 && !b.history.canUndo, 'the tape is no part of the bench and no undo step');
  // Escape halfway through a drag puts it back
  { const before = JSON.stringify(m.tape); t.down(at(b, m.tape.a)); t.move(at(b, V.add(m.tape.a, { x: 20, y: 5 }))); ok(t.cancel() && JSON.stringify(m.tape) === before, 'Escape mid-drag puts the tape back'); }
  ok(!b.toggleTape() && m.tape === null, 'and it goes away'); ok(m.grab(at(b, { x: 0, y: 0 })) === null, 'nothing to grab then');
  // the laser comes down at 50 degrees below the horizontal onto the flat top of the block
  ok(b.toggleAngle(), 'the angle tool is on'); const r = b.result, inc = r.paths[0], q0 = inc.pts[1];
  const onRay = V.add(q0, V.mul(V.sub(inc.pts[0], q0), 0.5)), onTop = { x: q0.x + 12, y: q0.y };
  click(onRay); ok(m.fresh().length === 1 && m.fresh()[0].what === 'ray', 'a click on the ray picks it'); ok(m.angle === null, 'one line is no angle yet');
  click(onTop); ok(m.fresh().length === 2 && m.fresh()[1].what === 'surface', 'a click on the top of the block picks it');
  const A = m.angle; ok(!!A && !!A.at, 'two lines that meet'); near(A.at.x, q0.x, 1e-6, 'they meet where the ray enters'); near(A.at.y, q0.y, 1e-6, '...');
  near(A.deg, 130, 1e-6, 'the angle on the side clicked: the ray comes in from the left, the face was clicked on the right (180 - 50)'); near(A.other, 50, 1e-6, 'and 50 degrees on the other side');
  click({ x: q0.x - 12, y: q0.y }); ok(m.fresh().length === 1, 'a third click starts again'); click(onRay); near(m.angle.deg, 50, 1e-6, 'clicked on the near side: 50 degrees');
  ok(snap(b) === s0 && b.selId === 0, 'picking lines changes nothing on the bench, nor what is selected');
  click({ x: 150, y: 100 }); ok(m.fresh().length === 0, 'a click on nothing lets the lines go');
  click(onRay); b.nudge && (b.select(b.scene.els[1]), b.nudge(1, 0)); ok(m.fresh().length === 0, 'when the bench changes, the picked lines are let go');
  // parallel lines: two faces of the block
  b.undo(); const blk = b.scene.els[1], top = blk.y + blk.height / 2, bot = blk.y - blk.height / 2; click({ x: blk.x + 20, y: top }); click({ x: blk.x + 20, y: bot }); ok(m.angle && m.angle.at === null && m.angle.deg === 0, 'parallel faces: no meeting point');
  ok(!b.toggleAngle() && m.fresh().length === 0, 'off again, and the lines are gone');
  // with the tape out, it is a line too
  b.toggleTape(); b.toggleAngle(); const tm = V.mul(V.add(m.tape.a, m.tape.b), 0.5); click(tm); ok(m.fresh().length === 1 && m.fresh()[0].what === 'tape', 'the tape can be one of the lines'); }

// ---- undoing (or redoing) a whole-bench change shows the bench that comes back, whatever the view was ----
{ const b = new Workbench(); b.loadPreset('prism'); b.history.clear(); const inView = () => { const bb = b.scene.bounds(), v = b.view.visible; return bb.x0 > v.x0 && bb.x1 < v.x1 && bb.y0 > v.y0 && bb.y1 < v.y1; };
  ok(inView(), 'a preset is fitted when it loads'); b.clear(); ok(b.scene.isEmpty && b.view.zoom === 1, 'New empties the bench and centres the view');
  b.view.zoomBy(2.5); b.undo(); ok(!b.scene.isEmpty && inView(), 'undoing New brings the bench back in view'); b.redo(); ok(b.scene.isEmpty && b.view.zoom === 1 && b.view.cx === 0, 'redoing New centres the empty bench');
  b.undo(); b.loadPreset('two'); b.view.zoomBy(3); b.undo(); ok(inView(), 'undoing a preset load fits the bench before it'); b.view.zoomBy(3); b.redo(); ok(inView(), 'redoing it fits the preset');
  // ... while undoing an ordinary edit leaves a view the user has set alone
  b.select(b.scene.els[0]); b.nudge(3, 0); b.view.zoomBy(2); const z = b.view.zoom, cx = b.view.cx; b.undo(); ok(b.view.zoom === z && b.view.cx === cx, 'undoing a nudge does not move the view'); }

// ---- the renderer's one piece of geometry: how much of a line lies inside a label's box ----
{ const W = L.Renderer.within; near(W([0, 5, 100, 5], 20, 0, 60, 10), 40, 1e-9, 'a level line crosses the whole box');
  near(W([0, 50, 100, 50], 20, 0, 60, 10), 0, 1e-9, 'a line that passes under the box');
  near(W([30, -20, 30, 40], 20, 0, 60, 10), 10, 1e-9, 'an upright line crosses its height');
  near(W([25, 5, 35, 5], 20, 0, 60, 10), 10, 1e-9, 'a line that starts and ends inside');
  near(W([0, 0, 100, 100], 20, 20, 60, 60), 40 * Math.SQRT2, 1e-9, 'a diagonal across the box');
  near(W([70, 5, 100, 5], 20, 0, 60, 10), 0, 1e-9, 'a line that starts past the box'); }

done('t-bench');
