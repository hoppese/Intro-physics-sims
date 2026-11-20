// =====================================================================
// Workbench -- the set-up (scene), the bench in motion (world), and every
// change made to them: adding, moving, typing a value, joining things with
// a rope, undo, and the clock. Any change to the set-up puts the clock back
// to zero, so what runs is always what is on the bench.
// =====================================================================
const ADD_MENU = [
  { group: 'Objects', key: 'block', label: 'Block', hint: 'A box with a mass. Drop it on a surface or another block, or let it hang from a rope', make: { t: 'block' } },
  { group: 'Surfaces', key: 'floor', label: 'Floor or table', hint: 'A level surface', make: { t: 'surface', angle: 0, length: 3 } },
  { group: 'Surfaces', key: 'ramp', label: 'Ramp', hint: 'An incline; drag its gold handle to change the angle', make: { t: 'surface', angle: 30, length: 2.5 } },
  { group: 'Surfaces', key: 'wall', label: 'Wall', hint: 'A vertical surface, facing left (turn it to face right)', make: { t: 'surface', angle: 90, length: 2 } },
  { group: 'Surfaces', key: 'ceiling', label: 'Ceiling', hint: 'Something to hang things from', make: { t: 'surface', angle: 180, length: 3 } },
  { group: 'Fixings', key: 'pulley', label: 'Pulley', hint: 'An ideal, fixed pulley: a rope over it keeps the same tension on both sides', make: { t: 'pulley' } },
  { group: 'Fixings', key: 'anchor', label: 'Anchor', hint: 'A fixed point to tie a rope or a spring to', make: { t: 'anchor' } },
  { group: 'Connections', key: 'rope', label: 'Rope', hint: 'Click a block or anchor, then any pulleys it runs over, then the block or anchor at its other end', link: 'rope' },
  { group: 'Connections', key: 'spring', label: 'Spring', hint: 'Click a block, then another block or an anchor', link: 'spring' },
  { group: 'Connections', key: 'push', label: 'Applied force', hint: 'Click a block to push or pull it with a steady force', link: 'push' },
];

class Workbench {
  static SPEEDS = [0.25, 0.5, 1];
  constructor() { this.scene = new Scene(); this.history = new History(); this.view = new View(); this.selId = 0; this.hoverId = 0;
    this.notice = null; this.hidden = false; this.typing = null; this.stroke = null; this.rev = 0; this.jumps = new Set();
    this._world = null; this.playing = false; this.speed = 1; this.link = null; this.dirty = true; this.measure = new Measure(this);
    this.graph = 'motion'; this.axis = 'x'; }   // which graphs show under the bench (null: none), and the axis the motion graphs use

  // ---- the bench in motion ----
  get world() { if (!this._world) this._world = new World(this.scene); return this._world; }
  get time() { return this._world ? this._world.t : 0; }
  get started() { return this.time > 0; }
  // the set-up changed: the clock goes back to zero and stops
  touch() { this._world = null; this.playing = false; this.dirty = true; this.rev++; }
  play() { if (this.scene.blocks.length === 0) { this.say('Add a block first: there is nothing to move.'); return; } if (this.world.stopped) this.reset(); this.playing = true; this.rev++; this.dirty = true; }
  pause() { if (!this.playing) return; this.playing = false; this.rev++; this.dirty = true; }
  toggle() { if (this.playing) this.pause(); else this.play(); }
  reset() { this._world = null; this.playing = false; this.rev++; this.dirty = true; }
  // run the clock on by `dt` seconds of wall time; true if anything moved
  tick(dt) { if (!this.playing) return false; const w = this.world, before = w.events.length; w.advance(Math.min(dt, 0.1) * this.speed);
    for (const e of w.events.slice(before)) this.say(this.scene.label(this.scene.get(e.id)) + ' ' + e.text + '.');
    if (w.stopped) { this.playing = false; this.say(w.stopped.id ? this.scene.label(this.scene.get(w.stopped.id)) + ' ' + w.stopped.text + '. Press ↺ to start again.' : 'The clock stopped: ' + w.stopped.text + '.'); this.rev++; }
    this.dirty = true; return true; }
  // back (or on) to a moment already run: the clock stops there, and runs on from there when played
  seek(t) { const w = this._world; if (!w || !w.rec.length) return false; this.playing = false; w.restore(w.at(Math.max(0, t))); this.rev++; this.dirty = true; return true; }
  setGraph(kind) { this.graph = kind || null; this.rev++; this.dirty = true; }
  setAxis(axis) { this.axis = axis; this.rev++; this.dirty = true; }
  stepOnce() { if (this.scene.blocks.length === 0) return; this.playing = false; this.world.advance(1 / 30); this.rev++; this.dirty = true; }
  hide(on) { on = !!on; if (on === this.hidden) return; this.endTyping(); this.hidden = on; this.dirty = true; this.rev++; }

  get selected() { return this.scene.get(this.selId); }
  select(el) { this.endTyping(); const id = el ? el.id : 0; if (id !== this.selId) { this.selId = id; this.dirty = true; this.rev++; } }
  say(text) { this.notice = { text, at: Date.now() }; this.dirty = true; }

  // Run a change to the set-up; it becomes one undo step if anything really changed.
  edit(fn, tag) { this.endTyping(); const before = this.scene.snapshot(), r = fn(this.scene); if (this.scene.snapshot() === before) return r;
    this.history.record(before, tag); this.touch(); return r; }

  // ---- adding and removing ----
  spot(el) { const v = this.view.visible, w = v.x1 - v.x0, cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2;
    let x = Math.round((cx + (el instanceof Surface ? -0.25 * w : 0)) * 10) / 10, y = Math.round((cy + (el instanceof Block ? 0.15 * (v.y1 - v.y0) : el instanceof Pulley || el instanceof Anchor || (el instanceof Surface && el.angle === 180) ? 0.3 * (v.y1 - v.y0) : -0.2 * (v.y1 - v.y0))) * 10) / 10;
    for (let i = 0; i < 30 && this.scene.els.some((e) => !e.isLink && Math.abs(e.x - x) < 0.15 && Math.abs(e.y - y) < 0.15); i++) { x += 0.3; y -= 0.2; }
    return { x, y }; }
  add(key) { const m = ADD_MENU.find((a) => a.key === key); if (!m) return null;
    if (m.link) { this.startLink(m.link); return null; }
    if (this.scene.full) { this.say('The bench holds ' + Scene.MAX + ' things. Remove one to add another.'); return null; }
    return this.edit((s) => { const el = Element.from(m.make), at = this.spot(el); el.set('x', at.x); el.set('y', at.y); s.add(el); if (el instanceof Block) this.snap(el); this.selId = el.id; return el; }); }
  remove() { const el = this.selected; if (!el) return false; this.edit((s) => s.remove(el.id)); this.selId = 0; return true; }
  duplicate() { const el = this.selected; if (!el || el.isLink) return null;
    if (this.scene.full) { this.say('The bench holds ' + Scene.MAX + ' things. Remove one to add another.'); return null; }
    return this.edit((s) => { const c = el.clone(); c.id = 0; c.set('x', el.x + 0.3); c.set('y', el.y + (el instanceof Block ? 0.4 : -0.3)); s.add(c); if (c instanceof Block) this.snap(c); this.selId = c.id; return c; }); }

  // ---- joining things: a rope, a spring, an applied force ----
  // While joining, clicks pick what to join (see pickLink); Escape or a click on nothing gives up.
  startLink(kind) { this.reset(); this.link = { kind, picks: [] }; this.select(null); this.rev++; this.dirty = true; }
  cancelLink() { if (!this.link) return false; this.link = null; this.rev++; this.dirty = true; return true; }
  get linkHint() { const l = this.link; if (!l) return ''; const n = l.picks.length;
    if (l.kind === 'push') return 'Click the block to push or pull';
    if (l.kind === 'spring') return n === 0 ? 'Spring: click a block or an anchor' : 'Spring: now click the other end (a block or an anchor)';
    return n === 0 ? 'Rope: click a block or an anchor to start' : 'Rope: click any pulleys it goes over, then the block or anchor at its far end'; }
  // the element clicked while joining: true if it was taken
  pickLink(el) { const l = this.link; if (!l || !el) return false; const ok = (e) => e instanceof Block || e instanceof Anchor;
    if (l.kind === 'push') { if (!(el instanceof Block)) { this.say('An applied force acts on a block.'); return false; } this.link = null; this.edit((s) => { const p = s.add({ t: 'push', on: el.id }); if (p) this.selId = p.id; }); return true; }
    if (l.kind === 'spring') { if (!ok(el)) { this.say('A spring joins blocks and anchors.'); return false; }
      if (!l.picks.length) { l.picks.push(el.id); this.rev++; this.dirty = true; return true; }
      const a = this.scene.get(l.picks[0]); if (el.id === a.id || (!(a instanceof Block) && !(el instanceof Block))) { this.say(el.id === a.id ? 'Click the other end.' : 'One end of a spring must be a block.'); return false; }
      this.link = null; this.edit((s) => { const sp = s.add({ t: 'spring', from: a.id, to: el.id, rest: Math.max(0.05, Math.round(V.dist(a.pos, el.pos) * 20) / 20) }); if (sp) this.selId = sp.id; }); return true; }
    // a rope: an end, any pulleys, an end
    if (!l.picks.length) { if (!ok(el)) { this.say('A rope starts at a block or an anchor.'); return false; } l.picks.push(el.id); this.rev++; this.dirty = true; return true; }
    if (el instanceof Pulley) { if (l.picks.includes(el.id)) { this.say('The rope already goes over that pulley.'); return false; } l.picks.push(el.id); this.rev++; this.dirty = true; return true; }
    if (!ok(el) || el.id === l.picks[0]) { this.say(el.id === l.picks[0] ? 'A rope needs two different ends.' : 'Click a pulley, or the block or anchor at the far end.'); return false; }
    const [from, ...via] = l.picks; this.link = null;
    this.edit((s) => { const r = s.add({ t: 'rope', from, to: el.id, via }); if (r) this.selId = r.id; else this.say('That rope cannot be laid: does it go round a pulley too tightly?'); }); return true; }

  // ---- a block put down near a surface or another block settles onto it ----
  // Returns true if it was snapped. Only what is below it (along the support's normal) and close counts.
  snap(el, reach) { reach = reach == null ? 0.25 : reach; let best = null;
    for (const s of this.scene.ofType(Surface)) { const n = s.normal; if (n.y < 0.2) continue; const rel = V.sub(el.pos, s.a), along = V.dot(rel, s.dir), up = V.dot(rel, n), gap = up - el.h / 2;
      if (along < 0 || along > s.length || gap < -el.h || gap > reach) continue; if (!best || Math.abs(gap) < Math.abs(best.gap)) best = { gap, at: V.add(V.at(s.a, s.dir, along), V.mul(n, el.h / 2)), ang: World.tilt(s.dir) }; }
    for (const o of this.scene.blocks) { if (o === el) continue; const ov = V.polar(o.angle + 90), ou = V.polar(o.angle), rel = V.sub(el.pos, o.pos), along = V.dot(rel, ou), up = V.dot(rel, ov), gap = up - o.h / 2 - el.h / 2;
      if (Math.abs(along) > o.w / 2 || gap < -el.h || gap > reach) continue; if (!best || Math.abs(gap) < Math.abs(best.gap)) best = { gap, at: V.add(V.add(o.pos, V.mul(ou, along)), V.mul(ov, o.h / 2 + el.h / 2)), ang: o.angle }; }
    if (!best) return false; el.set('angle', best.ang); el.x = Math.round(best.at.x * 1e6) / 1e6; el.y = Math.round(best.at.y * 1e6) / 1e6; return true; }

  // ---- changing the selected element ----
  rotate(deg) { const el = this.selected; if (!el || !(el instanceof Surface || el instanceof Push)) return; this.edit(() => el.set('angle', el.angle + deg), 'turn' + el.id); }
  nudge(dx, dy) { const el = this.selected; if (!el || el.isLink) return; this.edit(() => { el.set('x', el.x + dx); el.set('y', el.y + dy); }, 'nudge' + el.id); }
  pick(item) { this.edit(() => item.pick()); }
  type(key, v) { const el = this.selected; if (!el || !isFinite(v) || !el.spec(key)) return false;
    if (!this.typing) this.typing = { id: el.id, before: this.scene.snapshot() };
    el.set(key, v); this.touch(); return true; }
  endTyping(cancel) { const t = this.typing; if (!t) return; this.typing = null;
    if (cancel) { this.scene = Scene.restore(t.before); this.touch(); return; }
    if (this.scene.snapshot() !== t.before) this.history.record(t.before); this.dirty = true; }
  setG(g) { this.edit((s) => { s.opts.g = g; }); }
  toggleOpt(opt) { if (!(opt in Scene.OPTS) || typeof Scene.OPTS[opt] !== 'boolean') return;
    // (what is drawn is not the set-up: showing or hiding it leaves the clock where it is)
    if (Workbench.LOOKS.includes(opt)) { this.scene.opts[opt] = !this.scene.opts[opt]; this.rev++; this.dirty = true; return; }
    this.edit((s) => { s.opts[opt] = !s.opts[opt]; }); }
  static LOOKS = ['fbd', 'grid', 'components', 'trails'];

  // ---- a drag is one undo step: begin(), change freely, then commit() ----
  begin() { this.endTyping(); this.reset(); this.stroke = this.scene.snapshot(); }
  commit() { const s = this.stroke; this.stroke = null; if (s && this.scene.snapshot() !== s) this.history.record(s); this.touch(); }
  abandon() { const s = this.stroke; this.stroke = null; if (s) { this.scene = Scene.restore(s); this.touch(); } }
  moveTo(el, x, y) { el.set('x', x); el.set('y', y); this.touch(); }

  // ---- whole-bench changes ----
  replace(scene) { this.frame = null; const before = this.scene.snapshot(); this.edit(() => { this.scene = scene; }); const after = this.scene.snapshot();
    if (after !== before) { if (this.jumps.size > 300) this.jumps.clear(); this.jumps.add(before + '\n' + after); }
    this.selId = 0; this.hoverId = 0; this.link = null; this.fit(); }
  loadPreset(key) { const p = PRESET(key); if (!p) return false; this.replace(Scene.from({ els: p.els, opts: p.opts })); if (p.view) { this.frame = p.view; this.fit(); } this.graph = p.graph === undefined ? 'motion' : p.graph; this.axis = p.axis || 'x'; return true; }
  clear() { this.replace(new Scene()); }
  step(snap) { if (snap == null) return false; const now = this.scene.snapshot(); this.scene = Scene.restore(snap); if (!this.selected) this.selId = 0; this.hoverId = 0; this.touch();
    if (this.jumps.has(snap + '\n' + now) || this.jumps.has(now + '\n' + snap)) this.fit(); return true; }
  undo() { this.endTyping(); this.link = null; return this.step(this.history.undo(this.scene.snapshot())); }
  redo() { this.endTyping(); this.link = null; return this.step(this.history.redo(this.scene.snapshot())); }

  // ---- the measuring tools (not part of the set-up, so not undo steps) ----
  toggleTape() { const on = this.measure.toggleTape(); this.dirty = true; this.rev++; return on; }
  toggleAngle() { const on = this.measure.toggleAngle(); this.dirty = true; this.rev++; return on; }

  // ---- the view ----
  // (a preset may name the part of the bench to show: a floor that runs on off the side need not shrink the view)
  box() { return this.frame || this.scene.bounds(); }
  fit() { this.view.fit(this.box()); this.dirty = true; }

  // ---- what the page reports to whoever embeds it ----
  snapshot() { const L = this.scene.labels(), w = this.world, num = (x) => (isFinite(x) ? Math.round(x * 1000) / 1000 : null);
    return { hidden: this.hidden, time: num(w.t), playing: this.playing, selected: this.selId ? L.get(this.selId) || null : null, opts: { ...this.scene.opts },
      elements: this.scene.els.map((e) => ({ label: L.get(e.id), kind: e.kind, ...e.toJSON() })),
      blocks: this.hidden ? [] : w.bodies.map((b) => ({ label: L.get(b.id), x: num(b.p.x), y: num(b.p.y), vx: num(b.v.x), vy: num(b.v.y), ax: num(w.sol.a[b.i].x), ay: num(w.sol.a[b.i].y),
        forces: w.forcesOn(b.id).map((f) => ({ kind: f.kind, by: f.by ? L.get(f.by.id) || null : null, Fx: num(f.F.x), Fy: num(f.F.y) })) })),
      ropes: this.hidden ? [] : w.sol.ropes.map((r) => ({ label: L.get(r.rope.id), T: num(r.T) })) }; }
}
