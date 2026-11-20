// =====================================================================
// Camera -- a perspective camera that orbits a target. Drag to orbit, wheel
// or +/− to zoom; three set views: 3D (from above and to the side), Top (looking
// straight down) and Side (level, looking along +y, the plane of a vertical
// circle). P(world) gives {x, y, d, s}: screen px, depth (larger = nearer the
// viewer) and px per metre there, which is what the G3 kit expects.
// =====================================================================
class Camera {
  static FOV = 36;                                        // degrees, vertical
  static VIEWS = { '3d': [-58, 33], top: [-90, 89], side: [-90, 3] };
  constructor() { this.w = 640; this.h = 440; this.yaw = -58; this.pitch = 33; this.zoom = 1; this.view = '3d'; this.target = { x: 0, y: 0, z: 0 }; this.size = 2; this.update(); }
  resize(w, h) { if (w === this.w && h === this.h) return false; this.w = w; this.h = h; this.update(); return true; }
  // show a scene `size` metres in radius about `target`
  frame(target, size) { this.target = target; this.size = size; this.update(); }
  setView(k) { const v = Camera.VIEWS[k]; if (!v) return false; this.view = k; [this.yaw, this.pitch] = v; this.zoom = 1; this.update(); return true; }
  orbit(dx, dy) { this.yaw -= dx * 0.4; this.pitch = Math.max(-4, Math.min(89, this.pitch + dy * 0.4)); this.view = null; this.update(); }
  zoomBy(k) { this.zoom = Math.max(0.4, Math.min(4, this.zoom * k)); this.update(); }
  get focal() { return (this.h / 2) / Math.tan(Camera.FOV * Math.PI / 360); }
  update() { const y = this.yaw * Math.PI / 180, p = this.pitch * Math.PI / 180, f = this.focal;
    // far enough back that the scene's radius fills a little under half the smaller side
    this.dist = this.size * f / (0.5 * Math.min(this.w, this.h)) / this.zoom + this.size * 0.3;
    const back = { x: Math.cos(p) * Math.cos(y), y: Math.cos(p) * Math.sin(y), z: Math.sin(p) };
    this.eye = V3.add(this.target, V3.mul(back, this.dist)); this.fwd = V3.mul(back, -1);
    this.right = V3.unit(V3.cross(this.fwd, V3.Z)); this.up = V3.cross(this.right, this.fwd); }
  P = (w) => { const d = V3.sub(w, this.eye), zc = Math.max(1e-3, V3.dot(d, this.fwd)), k = this.focal / zc;
    return { x: this.w / 2 + V3.dot(d, this.right) * k, y: this.h / 2 - V3.dot(d, this.up) * k, d: this.dist - zc, s: k }; };
}
