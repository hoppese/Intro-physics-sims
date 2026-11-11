// =====================================================================
// History -- undo / redo as a stack of Circuit snapshots.
//
// An edit is recorded by handing over the snapshot taken BEFORE it. What a
// part is doing right now (a capacitor's charge, a meter's trace, whether a
// switch is closed) is not part of the layout, so stepping back through the
// layout leaves that alone: see Element.liveState().
// =====================================================================
class History {
  static RUN_MS = 1500;
  constructor(limit) { this.limit = limit || 120; this.past = []; this.future = []; this.open = null; this.openAt = 0; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  clear() { this.past = []; this.future = []; }
  // `whole` marks an edit that replaced the entire circuit (a preset, New): going
  // back over one of those brings the other circuit back exactly, state and all
  // `tag` names a run of small edits (arrow-key nudges of one part): edits with the same
  // tag made in quick succession count as a single step
  record(before, whole, tag) { const now = Date.now(), same = !!tag && tag === this.open && now - this.openAt < History.RUN_MS;
    this.open = tag || null; this.openAt = now; this.future = []; if (same) return;
    this.past.push({ snap: before, whole: !!whole }); if (this.past.length > this.limit) this.past.shift(); }
  // both return false (nothing to do), 'layout' or 'whole'
  undo(circuit) { this.open = null; return History.swap(circuit, this.past, this.future); }
  redo(circuit) { this.open = null; return History.swap(circuit, this.future, this.past); }
  static swap(circuit, from, to) { if (!from.length) return false; const e = from.pop(); to.push({ snap: circuit.snapshot(), whole: e.whole });
    if (e.whole) circuit.restore(e.snap); else circuit.restoreLayout(e.snap); return e.whole ? 'whole' : 'layout'; }
}

// =====================================================================
// View -- the pan / zoom window onto the grid, and every conversion between
// grid points, world pixels (what the painters draw in) and canvas pixels.
// =====================================================================
class View {
  static G = 24;                       // grid pitch, world px
  static M = 24;                       // margin before column / row 0
  static MIN = 0.4; static MAX = 3;
  // `board`: the world-pixel box {x0,y0,x1,y1} the grid occupies; the view never leaves it
  constructor(board) { this.scale = 1; this.ox = 0; this.oy = 0; this.w = 560; this.h = 400; this.auto = true; this.board = board || null; }
  static boardOf(nc, nr) { return { x0: 0, y0: 0, x1: 2 * View.M + (nc - 1) * View.G, y1: 2 * View.M + (nr - 1) * View.G }; }
  static CORNER = { w: 146, h: 52 };   // canvas pixels the zoom control covers in the bottom-right corner
  static xy(p) { return { x: View.M + p.c * View.G, y: View.M + p.r * View.G }; }
  static grid(x, y) { return { c: (x - View.M) / View.G, r: (y - View.M) / View.G }; }
  // the grid dot nearest a world point, if within `rad` world px
  static dot(x, y, rad) { const g = View.grid(x, y), p = { c: Math.round(g.c), r: Math.round(g.r) }, q = View.xy(p);
    return Math.hypot(q.x - x, q.y - y) <= (rad == null ? Infinity : rad) ? p : null; }
  resize(w, h) { if (w === this.w && h === this.h) return false; this.w = w; this.h = h; this.clamp(); return true; }
  // The board cannot be dragged off the canvas: its edge stops at the canvas's edge, and
  // along an axis where the whole board is narrower than the canvas it sits centred.
  clamp() { const b = this.board; if (!b) return; const s = this.scale;
    const axis = (o, lo, hi, size) => { const span = (hi - lo) * s; return span <= size ? (size - span) / 2 - lo * s : Math.max(size - hi * s, Math.min(-lo * s, o)); };
    this.ox = axis(this.ox, b.x0, b.x1, this.w); this.oy = axis(this.oy, b.y0, b.y1, this.h); }
  toWorld(sx, sy) { return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale }; }
  toCanvas(x, y) { return { x: x * this.scale + this.ox, y: y * this.scale + this.oy }; }
  get percent() { return Math.round(this.scale * 100) + '%'; }
  // text is drawn in world units; this keeps it readable when zoomed out
  get labelScale() { return Math.max(1, Math.min(1.45, 1 / this.scale)); }
  // the largest zoom "fit" will choose: 100% on the normal canvas, more on a big one
  get fitMax() { return Math.max(1, Math.min(1.75, Math.min(this.w / 560, this.h / 400))); }
  // put world point `w` at canvas point (sx, sy), at the given zoom
  place(w, sx, sy, scale) { const ns = Math.max(View.MIN, Math.min(View.MAX, scale));
    this.scale = ns; this.ox = sx - w.x * ns; this.oy = sy - w.y * ns; this.auto = false; this.clamp(); }
  zoomAbout(sx, sy, factor) { this.place(this.toWorld(sx, sy), sx, sy, this.scale * factor); }
  zoomBy(factor) { this.zoomAbout(this.w / 2, this.h / 2, factor); }
  panTo(ox, oy) { this.ox = ox; this.oy = oy; this.auto = false; this.clamp(); }
  // centre a world-pixel box {x0,y0,x1,y1}; from then on the view re-fits itself when the canvas resizes.
  // `lift`: canvas pixels along the bottom edge to keep free (see Workbench.fit)
  // (an empty bench shows the middle of the board, so there is room to build in every direction)
  fit(box, lift) { this.auto = true; if (!box) { const b = this.board; this.scale = this.fitMax; this.ox = b ? this.w / 2 - (b.x0 + b.x1) / 2 * this.scale : 0; this.oy = b ? this.h / 2 - (b.y0 + b.y1) / 2 * this.scale : 0; this.clamp(); return; }
    const bw = Math.max(1, box.x1 - box.x0), bh = Math.max(1, box.y1 - box.y0), pad = 10, H = this.h - (lift || 0);
    this.scale = Math.max(View.MIN, Math.min(this.fitMax, (this.w - 2 * pad) / bw, (H - 2 * pad) / bh));
    this.ox = (this.w - bw * this.scale) / 2 - box.x0 * this.scale; this.oy = (H - bh * this.scale) / 2 - box.y0 * this.scale; this.clamp(); }
  // the part of the grid on screen, in whole grid points
  visibleGrid() { const a = this.toWorld(0, 0), b = this.toWorld(this.w, this.h), ga = View.grid(a.x, a.y), gb = View.grid(b.x, b.y);
    return { c0: Math.ceil(ga.c), c1: Math.floor(gb.c), r0: Math.ceil(ga.r), r1: Math.floor(gb.r) }; }
}

// How numbers are written on the canvas and in the side panel.
const Fmt = {
  none: '– – –',                       // "nothing to read": spaced out so it cannot be taken for a minus sign
  V(v) { if (!isFinite(v)) return '—'; if (Math.abs(v) < 0.005) return '0.00 V'; return (v > 0 ? '+' : '−') + Math.abs(v).toFixed(2) + ' V'; },
  absV(v) { return isFinite(v) ? Math.abs(v).toFixed(2) + ' V' : '—'; },
  // a number from 0 to 1000 to three significant figures (never more than two decimals)
  sig3(x) { return x.toFixed(x < 9.995 ? 2 : x < 99.95 ? 1 : 0); },
  // A current, to three figures in whichever of µA, mA and A suits it: resistors run from 0.5 Ω to
  // 100 kΩ, so currents span µA to tens of A. Anything under ZERO_A is no current at all.
  ZERO_A: 5e-8,
  A(i) { if (!isFinite(i)) return '—'; const a = Math.abs(i); if (a < Fmt.ZERO_A) return '0 mA'; return a < 0.9995e-3 ? Fmt.sig3(a * 1e6) + ' µA' : a < 0.9995 ? Fmt.sig3(a * 1e3) + ' mA' : Fmt.sig3(a) + ' A'; },
  // a signed current, for an ammeter (which has a direction)
  signedA(i) { if (!isFinite(i)) return '—'; const s = Fmt.A(i); return (i < 0 && s !== '0 mA' ? '−' : '') + s; },
  Q(q) { if (!isFinite(q)) return '—'; const a = Math.abs(q), s = q < 0 ? '−' : ''; if (a < 5e-10) return '0 mC'; if (a >= 1e-3) return s + (a * 1e3).toFixed(2) + ' mC'; if (a >= 1e-6) return s + (a * 1e6).toFixed(1) + ' µC'; return s + (a * 1e9).toFixed(0) + ' nC'; },
  num(x, d) { const p = Math.pow(10, d == null ? 2 : d); return (Math.round(x * p) / p).toString(); },
};
