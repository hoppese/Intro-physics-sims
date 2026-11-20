// =====================================================================
// History -- undo / redo as a stack of scene snapshots (plain text).
// An edit is recorded by handing over the snapshot taken BEFORE it.
// =====================================================================
class History {
  static RUN_MS = 1500;
  constructor(limit) { this.limit = limit || 150; this.past = []; this.future = []; this.open = null; this.openAt = 0; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  clear() { this.past = []; this.future = []; this.open = null; }
  // `tag` names a run of small edits (arrow-key nudges of one element): edits with the
  // same tag made in quick succession count as a single step
  record(before, tag) { const now = Date.now(), same = !!tag && tag === this.open && now - this.openAt < History.RUN_MS;
    this.open = tag || null; this.openAt = now; this.future = []; if (same) return;
    this.past.push(before); if (this.past.length > this.limit) this.past.shift(); }
  // both take the scene as it is now (as text) and return the one to go to, or null
  undo(now) { this.open = null; if (!this.past.length) return null; this.future.push(now); return this.past.pop(); }
  redo(now) { this.open = null; if (!this.future.length) return null; this.past.push(now); return this.future.pop(); }
}

// =====================================================================
// View -- the pan / zoom window onto the bench, and the conversion between
// bench centimetres (y up) and canvas pixels (y down).
//
// At 100% the canvas is View.SPAN centimetres wide whatever its size in
// pixels, so the enlarged canvas shows the same piece of bench, bigger.
// =====================================================================
class View {
  static SPAN = 140;                      // cm across the canvas at 100%
  static ZMIN = 0.4; static ZMAX = 6;
  static FITMAX = 1.25;                   // "fit" never zooms in further than this
  constructor() { this.w = 560; this.h = 400; this.zoom = 1; this.cx = 0; this.cy = 0; this.auto = true; }
  get scale() { return this.w / View.SPAN * this.zoom; }           // canvas px per cm
  resize(w, h) { if (w === this.w && h === this.h) return false; this.w = w; this.h = h; return true; }
  toCanvas(p) { const s = this.scale; return { x: this.w / 2 + (p.x - this.cx) * s, y: this.h / 2 - (p.y - this.cy) * s }; }
  toWorld(sx, sy) { const s = this.scale; return { x: this.cx + (sx - this.w / 2) / s, y: this.cy - (sy - this.h / 2) / s }; }
  // the middle of the canvas never leaves the bench
  clamp() { this.cx = Math.max(BOARD.x0, Math.min(BOARD.x1, this.cx)); this.cy = Math.max(BOARD.y0, Math.min(BOARD.y1, this.cy)); }
  get percent() { return Math.round(this.zoom * 100) + '%'; }
  // the piece of bench on the canvas
  get visible() { const a = this.toWorld(0, this.h), b = this.toWorld(this.w, 0); return { x0: a.x, y0: a.y, x1: b.x, y1: b.y }; }
  zoomAbout(sx, sy, k) { const p = this.toWorld(sx, sy); this.zoom = Math.max(View.ZMIN, Math.min(View.ZMAX, this.zoom * k)); const s = this.scale;
    this.cx = p.x - (sx - this.w / 2) / s; this.cy = p.y + (sy - this.h / 2) / s; this.auto = false; this.clamp(); }
  zoomBy(k) { this.zoomAbout(this.w / 2, this.h / 2, k); }
  panBy(dx, dy) { const s = this.scale; this.cx -= dx / s; this.cy += dy / s; this.auto = false; this.clamp(); }
  // show a box of bench {x0, y0, x1, y1} with some room round it; an empty bench shows its middle.
  // From then on the view re-fits itself when the canvas changes size.
  fit(box) { this.auto = true; if (!box) { this.zoom = 1; this.cx = 0; this.cy = 0; return; }
    const pad = 12, bw = box.x1 - box.x0 + 2 * pad, bh = box.y1 - box.y0 + 2 * pad;
    this.zoom = Math.max(View.ZMIN, Math.min(View.FITMAX, View.SPAN / bw, View.SPAN * this.h / this.w / bh));
    this.cx = (box.x0 + box.x1) / 2; this.cy = (box.y0 + box.y1) / 2; this.clamp(); }
}
