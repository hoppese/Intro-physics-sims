// =====================================================================
// View -- which part of the world the canvas shows: a centre and a scale
// (px per metre). Frame it on a region; zoom about a point; pan by dragging.
// =====================================================================
class View {
  constructor() { this.W = 600; this.H = 400; this.cx = 0; this.cy = 0; this.s = 100; this.home = { x: 0, y: 0, w: 3 }; }
  resize(W, H) { if (W === this.W && H === this.H) return false; const k = this.homeK; this.W = W; this.H = H; if (k != null && Math.abs(this.s - k) < 1e-9 * k) this.frame(this.home); return true; }
  // (a frame marked `fit` must fit both ways: an orbit as tall as it is wide)
  get homeK() { return (this.home.fit ? Math.min(this.W, this.H) : this.W) / this.home.w; }
  // show `w` metres across, centred on (x, y)
  frame(v) { this.home = { ...v }; this.cx = v.x; this.cy = v.y; this.s = this.homeK; }
  zoomAt(k, sx, sy) { const p = this.toWorld(sx, sy), s = Math.max(this.homeK / 400, Math.min(this.homeK * 400, this.s * k)); this.s = s; this.cx = p.x - (sx - this.W / 2) / s; this.cy = p.y + (sy - this.H / 2) / s; }
  pan(dx, dy) { this.cx -= dx / this.s; this.cy += dy / this.s; }
  P = (p) => ({ x: this.W / 2 + (p.x - this.cx) * this.s, y: this.H / 2 - (p.y - this.cy) * this.s });
  toWorld(sx, sy) { return { x: this.cx + (sx - this.W / 2) / this.s, y: this.cy - (sy - this.H / 2) / this.s }; }
  get width() { return this.W / this.s; }
  get percent() { return Math.round(100 * this.s / this.homeK); }
}
