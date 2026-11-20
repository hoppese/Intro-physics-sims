// =====================================================================
// Workbench -- the scene plus everything that is done to it: adding,
// moving, turning, typing a value, undo. Every change goes through here,
// so the traced light (`result`) is always the light of the scene as it is.
// =====================================================================
class Workbench {
  constructor() { this.scene = new Scene(); this.history = new History(); this.view = new View(); this.selId = 0; this.hoverId = 0; this.hotFocus = null;
    this.notice = null; this.hidden = false; this._result = null; this.dirty = true; this.typing = null; this.stroke = null;
    this.rev = 0;                      // counts changes to what is on the bench (the side panel follows it)
    this.jumps = new Set();            // whole-bench changes (a preset, New), as "before\nafter": undoing one re-fits the view
    this.measure = new Measure(this); }  // the tape and the angle tool (not part of the scene)

  // the light, traced when first asked for after a change
  get result() { if (!this._result) this._result = Tracer.trace(this.scene); return this._result; }
  touch() { this._result = null; this.dirty = true; this.rev++; }
  hide(on) { on = !!on; if (on === this.hidden) return; this.endTyping(); this.hidden = on; this.dirty = true; this.rev++; }
  get selected() { return this.scene.get(this.selId); }
  select(el) { this.endTyping(); const id = el ? el.id : 0; if (id !== this.selId) { this.selId = id; this.dirty = true; } }
  say(text) { this.notice = { text, at: Date.now() }; this.dirty = true; }

  // Run a change to the scene; it becomes one undo step if anything really changed.
  edit(fn, tag) { this.endTyping(); const before = this.scene.snapshot(), r = fn(this.scene); if (this.scene.snapshot() === before) return r;
    this.history.record(before, tag); this.touch(); return r; }

  // ---- adding and removing ----
  // where a new element goes: sources to the left of what is on screen, screens to the right, the rest in
  // the middle; then down and to the right until it is not on top of something already there
  spot(el) { const v = this.view.visible, w = v.x1 - v.x0, cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2;
    let x = Math.round(cx + (el.emits ? -0.3 : el instanceof Screen ? 0.3 : 0) * w), y = Math.round(cy);
    for (let i = 0; i < 30 && this.scene.els.some((e) => Math.abs(e.x - x) < 3 && Math.abs(e.y - y) < 3); i++) { x += 5; y -= 5; }
    return { x, y }; }
  add(key) { const m = ADD_MENU.find((a) => a.key === key); if (!m) return null;
    if (this.scene.full) { this.say('The bench holds ' + Scene.MAX + ' elements. Remove one to add another.'); return null; }
    return this.edit((s) => { const el = Element.from(m.make), at = this.spot(el); el.set('x', at.x); el.set('y', at.y); s.add(el); this.selId = el.id; return el; }); }
  remove() { const el = this.selected; if (!el) return false; this.edit((s) => s.remove(el.id)); this.selId = 0; return true; }
  duplicate() { const el = this.selected; if (!el) return null;
    if (this.scene.full) { this.say('The bench holds ' + Scene.MAX + ' elements. Remove one to add another.'); return null; }
    // the copy goes beside the original: down and right if that is on screen and free, else another diagonal
    const v = this.view.visible, m = 4, seen = (x, y) => x > v.x0 + m && x < v.x1 - m && y > v.y0 + m && y < v.y1 - m, free = (x, y) => !this.scene.els.some((e) => Math.abs(e.x - x) < 1 && Math.abs(e.y - y) < 1);
    const at = [[6, -6], [6, 6], [-6, 6], [-6, -6], [12, 0], [-12, 0], [0, 12], [0, -12]].map(([dx, dy]) => ({ x: el.x + dx, y: el.y + dy })), to = at.find((p) => seen(p.x, p.y) && free(p.x, p.y)) || at.find((p) => free(p.x, p.y)) || at[0];
    const made = this.edit((s) => { const c = el.clone(); c.id = 0; c.set('x', to.x); c.set('y', to.y); s.add(c); this.selId = c.id; return c; });
    if (made && !seen(made.x, made.y)) this.fit();        // (never a copy that lands out of sight)
    return made; }

  // ---- changing the selected element ----
  rotate(deg) { const el = this.selected; if (!el) return; this.edit(() => el.set('angle', el.angle + deg), 'turn' + el.id); }
  nudge(dx, dy) { const el = this.selected; if (!el) return; this.edit(() => { el.set('x', el.x + dx); el.set('y', el.y + dy); }, 'nudge' + el.id); }
  pick(item) { this.edit(() => item.pick()); }
  // Typing in a number box: the value follows every keystroke, and the whole run is one undo step
  // (or none at all, if it is cancelled with Escape).
  type(key, v) { const el = this.selected; if (!el || !isFinite(v) || !el.spec(key)) return false;
    if (!this.typing) this.typing = { id: el.id, before: this.scene.snapshot() };
    if (key === 'nm' && v === 0) return false;                 // (0 is how "white" is stored; white is chosen with its button)
    el.set(key, v); this.touch(); return true; }
  endTyping(cancel) { const t = this.typing; if (!t) return; this.typing = null;
    if (cancel) { this.scene = Scene.restore(t.before); this.touch(); return; }
    if (this.scene.snapshot() !== t.before) this.history.record(t.before); this.dirty = true; }

  // ---- a drag (move or turn) is one undo step: begin(), then change the element freely, then commit() ----
  begin() { this.endTyping(); this.stroke = this.scene.snapshot(); }
  commit() { const s = this.stroke; this.stroke = null; if (s && this.scene.snapshot() !== s) this.history.record(s); this.dirty = true; }
  abandon() { const s = this.stroke; this.stroke = null; if (s) { this.scene = Scene.restore(s); this.touch(); } }
  moveTo(el, x, y) { el.set('x', x); el.set('y', y); this.touch(); }

  // ---- whole-bench changes ----
  replace(scene) { const before = this.scene.snapshot(); this.edit(() => { this.scene = scene; }); const after = this.scene.snapshot();
    if (after !== before) { if (this.jumps.size > 300) this.jumps.clear(); this.jumps.add(before + '\n' + after); }
    this.selId = 0; this.hoverId = 0; this.fit(); }
  loadPreset(key) { const p = PRESET(key); if (!p) return false; this.replace(Scene.from({ els: p.els, opts: p.opts })); return true; }
  clear() { this.replace(new Scene()); }
  toggle(opt) { if (!(opt in Scene.OPTS)) return; this.edit((s) => { s.opts[opt] = !s.opts[opt]; }); }
  step(snap) { if (snap == null) return false; const now = this.scene.snapshot(); this.scene = Scene.restore(snap); if (!this.selected) this.selId = 0; this.hoverId = 0; this.touch();
    // (a different bench altogether has come back: show it, whatever the view was set to for the other one)
    if (this.jumps.has(snap + '\n' + now) || this.jumps.has(now + '\n' + snap)) this.fit();
    return true; }
  undo() { this.endTyping(); return this.step(this.history.undo(this.scene.snapshot())); }
  redo() { this.endTyping(); return this.step(this.history.redo(this.scene.snapshot())); }

  // ---- the measuring tools (they change nothing on the bench, so they are not undo steps) ----
  toggleTape() { const on = this.measure.toggleTape(); this.dirty = true; this.rev++; return on; }
  toggleAngle() { const on = this.measure.toggleAngle(); this.dirty = true; this.rev++; return on; }

  // ---- the view ----
  // everything on the bench, and the images that fall on it
  box() { const b = this.scene.bounds(); if (!b) return null; const out = { ...b };
    for (const im of this.hidden ? [] : this.result.images) { const p = im.p; if (p.x < BOARD.x0 || p.x > BOARD.x1 || p.y < BOARD.y0 || p.y > BOARD.y1) continue;
      // (with room past it, so that the rays can be seen to go on through a real image)
      const m = 9; out.x0 = Math.min(out.x0, p.x - m); out.x1 = Math.max(out.x1, p.x + m); out.y0 = Math.min(out.y0, p.y - m); out.y1 = Math.max(out.y1, p.y + m); }
    // ... and the first stretch of the light that leaves the last thing it meets
    for (const path of this.hidden ? [] : this.result.paths) { if (!path.open || path.pts.length < 2) continue; const p = V.at(path.pts[path.pts.length - 1], path.dirs[path.dirs.length - 1], 14);
      out.x0 = Math.max(BOARD.x0, Math.min(out.x0, p.x)); out.x1 = Math.min(BOARD.x1, Math.max(out.x1, p.x)); out.y0 = Math.max(BOARD.y0, Math.min(out.y0, p.y)); out.y1 = Math.min(BOARD.y1, Math.max(out.y1, p.y)); }
    return out; }
  fit() { this.view.fit(this.box()); this.dirty = true; }

  // ---- what the page reports to whoever embeds it ----
  snapshot() { const L = this.scene.labels(), r = this.result, num = (x) => (x == null ? null : isFinite(x) ? Math.round(x * 1000) / 1000 : String(x));
    return { hidden: this.hidden, selected: this.selId ? L.get(this.selId) || null : null, opts: { ...this.scene.opts },
      elements: this.scene.els.map((e) => ({ label: L.get(e.id), kind: e.kind, ...e.toJSON() })),
      images: this.hidden ? [] : r.images.map((i) => ({ no: i.no, kind: i.kind, focus: i.focus, x: num(i.p.x), y: num(i.p.y), by: L.get(i.el) || null, s: num(i.s), sPrime: num(i.sp), m: num(i.m) })),
      stats: { ...r.stats } }; }
}
