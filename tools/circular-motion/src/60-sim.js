// =====================================================================
// Sim -- the state of the page: which situation, its settings, the clock,
// what is drawn, and the camera. Every situation keeps its own settings, so
// switching away and back finds them as they were. A change of setting puts
// the clock back to zero. Loads paused.
// =====================================================================
class Sim {
  static SPEEDS = [0.25, 0.5, 1];
  static SHOW = [['v', 'Velocity', 'The velocity: along the path, at a tangent to the circle'], ['a', 'Acceleration', 'The acceleration: toward the centre (plus a part along the path where the speed changes)'],
    ['forces', 'Forces', 'Every force on the object'], ['comps', 'Components', 'Each force split into its part toward the centre (r) and its part along z'], ['axes', 'r, t, z axes', 'The axes that go round with the object: r toward the centre, t along the path, z across the circle'],
    ['nums', 'Values', 'The size of each arrow written beside it (off: just the symbol, W, n, v, a …)']];
  constructor() { this.all = {}; for (const k of Object.keys(SITUATIONS)) this.all[k] = new SITUATIONS[k]();
    this.key = 'puck'; this.playing = false; this.speed = 1; this.hidden = false; this.show = { v: true, a: true, forces: true, comps: false, axes: false, nums: true };
    this.cam = new Camera(); this.rev = 0; this.dirty = true; this.trail = []; this.frame(); }
  get sit() { return this.all[this.key]; }
  bump() { this.rev++; this.dirty = true; if (this.sit.t === 0) this.trail = []; }

  // ---- which situation, and its settings ----
  choose(k) { if (!SITUATIONS[k]) return false; this.key = k; this.playing = false; this.sit.reset(); this.cam.setView(k === 'vertical' || k === 'ferris' ? 'side' : k === 'orbit' ? 'top' : '3d'); this.frame(); this.bump(); return true; }
  set(key, v) { const ok = this.sit.set(key, v); if (ok) { this.playing = false; this.frame(); this.bump(); } return ok; }
  setVariant(k) { if (this.sit.setVariant(k)) { this.playing = false; this.frame(); this.bump(); } }
  setRoad(k) { if (this.sit.setRoad(k)) { this.playing = false; this.bump(); } }
  // what the camera looks at, and how big the scene is (metres)
  frame() { const s = this.sit, k = this.key;
    if (k === 'puck') this.cam.frame({ x: 0, y: 0, z: 0 }, Puck.TABLE * 0.95);
    else if (k === 'flat' || k === 'banked') this.cam.frame({ x: 0, y: 0, z: 0 }, s.vals.r + 6);
    else if (k === 'conical') this.cam.frame({ x: 0, y: 0, z: s.pivot.z * 0.55 }, Math.max(1.2, s.vals.L * 0.85 + 0.3));
    else if (k === 'ferris') this.cam.frame({ ...s.c }, s.vals.r * 1.2 + 2.5);
    else if (k === 'orbit') this.cam.frame({ x: 0, y: 0, z: 0 }, s.extent);
    else this.cam.frame({ ...s.c }, s.vals.r * 1.25 + (s.variant === 'loop' ? 1.5 : 0.3)); }
  get size() { return this.cam.size; }

  // ---- the clock ----
  get time() { return this.sit.t; }
  play() { if (this.sit.done) this.sit.reset(); this.playing = true; this.bump(); }
  pause() { if (!this.playing) return; this.playing = false; this.bump(); }
  toggle() { if (this.playing) this.pause(); else this.play(); }
  reset() { this.playing = false; this.sit.reset(); this.bump(); }
  step() { this.playing = false; this.sit.advance(1 / 30); this.bump(); }
  tick(dt) { if (!this.playing) return false; this.sit.advance(Math.min(dt, 0.1) * this.speed); this.mark(); if (this.sit.done) this.playing = false; this.dirty = true; return true; }
  // where it has been lately (the last TRAIL seconds, or the whole path for an orbit): a skid or a cut string shows
  // as the straight line it is. A point is kept only once the object has moved a little, so a long path stays short.
  static TRAIL = 2.5;
  mark() { const t = this.sit.t, T = this.trail, p = this.sit.now().p, keep = this.sit.constructor.TRAIL || Sim.TRAIL; if (T.length && T[T.length - 1].t > t) T.length = 0;
    if (keep === Infinity && T.length > 1 && V3.len(V3.sub(p, T[T.length - 1].p)) < this.size / 250) return;
    T.push({ t, p }); while (T.length && T[0].t < t - keep) T.shift(); if (T.length > 4000) T.splice(0, T.length - 4000); }
  circular() { if (this.key !== 'orbit') return; this.sit.setCircular(); this.playing = false; this.frame(); this.bump(); }
  snip() { if (this.key !== 'puck') return; this.sit.snip(); this.bump(); }

  // ---- what is drawn ----
  hide(on) { on = !!on; if (on === this.hidden) return; this.hidden = on; this.bump(); }
  toggleShow(k) { if (!(k in this.show)) return; this.show[k] = !this.show[k]; this.bump(); }
  view(k) { if (this.cam.setView(k)) this.bump(); }

  // ---- what the page reports to whoever embeds it ----
  snapshot() { const s = this.sit, n = s.now(), r = (x) => Math.round(x * 1000) / 1000;
    return { situation: this.key, variant: s.variant, road: s.road, settings: { ...s.vals }, t: r(s.t), status: s.done || s.event || '',
      speed: r(V3.len(n.v)), forces: this.hidden ? [] : n.forces.map((f) => ({ kind: f.kind, by: f.by || '', magnitude: r(V3.len(f.F)) })) }; }
}
