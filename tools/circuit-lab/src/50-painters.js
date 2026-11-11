// =====================================================================
// Painters -- how each kind of part looks. One Painter subclass per Element
// subclass, looked up through PAINTERS[type]. A painter draws in world
// pixels (see View) and never changes the model.
//
// Every painter answers the same questions:
//   paint(g, el, st)     draw the symbol        st = { sel, nx, ny, sol, hide }
//   extent(el)           how far the symbol reaches to either side of its axis
//   label(el, name, st)  the text that goes beside it, or null
//   track(el)            the line the current dots run along, or null
//   distance(el, x, y)   how far a world point is from the drawn part
//   press(el, x, y)      what a click there operates: null, or {} / {position} for a switch
//   box(el)              the rectangle it covers (labels keep out of it)
//   signed               true when the symbol carries its own + / - marks
// (st.nx, st.ny) points from the part toward its label; the small + / - signs
// are drawn on the other side so the two never collide.
// =====================================================================
const INK = { lead: 'rgba(210,222,234,0.85)', gold: '#e0b85a', sel: '#5fd0e0', dark: '#0f1722', flow: 'rgba(95,208,224,0.92)', dim: 'rgba(200,212,224,0.62)',
  volt: '#ef8f97', voltRing: '#d64550', amp: '#7fd39a', ampRing: '#5a9e3a', on: '#7fd39a', off: '#d98a8a', bad: 'rgba(224,90,90,0.92)', mark: '#f0c674' };
const mono = (px, bold) => (bold ? 'bold ' : '') + (Math.round(px * 10) / 10) + "px 'JetBrains Mono', ui-monospace, monospace";

// The a -> b axis of a part in world pixels: (ux,uy) along it, (px,py) across it.
class Frame {
  constructor(p, q) { this.a = View.xy(p); this.b = View.xy(q); const dx = this.b.x - this.a.x, dy = this.b.y - this.a.y;
    this.L = Math.hypot(dx, dy) || 1; this.ux = dx / this.L; this.uy = dy / this.L; this.px = -this.uy; this.py = this.ux;
    this.mx = (this.a.x + this.b.x) / 2; this.my = (this.a.y + this.b.y) / 2; }
  // the point s px along the axis from the middle and n px across it
  pt(s, n) { n = n || 0; return { x: this.mx + this.ux * s + this.px * n, y: this.my + this.uy * s + this.py * n }; }
  // the same, but with the across-offset measured along a given direction (nx,ny)
  off(s, d, nx, ny) { return { x: this.mx + this.ux * s + nx * d, y: this.my + this.uy * s + ny * d }; }
}
const Draw = {
  line(g, p, q) { g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke(); },
  poly(g, pts) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); },
  dot(g, p, r) { g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill(); },
  ring(g, p, r) { g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.stroke(); },
  text(g, s, p, font, color, align) { g.font = font; g.fillStyle = color; g.textAlign = align || 'center'; g.textBaseline = 'middle'; g.fillText(s, p.x, p.y); },
  segDist(x, y, p, q) { const dx = q.x - p.x, dy = q.y - p.y, L2 = dx * dx + dy * dy; let t = L2 ? ((x - p.x) * dx + (y - p.y) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - (p.x + dx * t), y - (p.y + dy * t)); },
};

class Painter {
  frame(el) { return new Frame(el.a, el.b); }
  half(el) { return 0; }                        // half-length of the symbol along the axis; the leads stop there
  extent(el) { return 4; }
  color(st) { return st.sel ? INK.sel : INK.gold; }
  leads(g, el, st) { const f = this.frame(el), h = this.half(el); g.strokeStyle = st.sel ? INK.sel : INK.lead; g.lineWidth = st.sel ? 3 : 2.4; g.lineCap = 'round'; g.lineJoin = 'round';
    if (h <= 0) Draw.line(g, f.a, f.b); else { Draw.line(g, f.a, f.pt(-h)); Draw.line(g, f.pt(h), f.b); } return f; }
  paint(g, el, st) { this.leads(g, el, st); }
  label(el, name, st) { return null; }
  // value parts: name, value, and whatever the subclass adds
  valueLabel(el, name, extra) { const lines = [{ t: name, px: 11, bold: true, color: INK.gold }, { t: Fmt.num(el.value, 3) + ' ' + el.info.unit, px: 9, color: INK.dim }];
    for (const x of (extra || [])) lines.push({ t: x, px: 9, color: 'rgba(224,184,90,0.9)' }); return { lines }; }
  // { pts, gaps: [[from, to]] in px along pts, arrow: px along pts or null }
  track(el) { const f = this.frame(el), h = this.half(el); return { pts: [f.a, f.b], gaps: h > 0 && this.gap ? [[f.L / 2 - h, f.L / 2 + h]] : [], arrow: f.L * 0.85 }; }
  distance(el, x, y) { const f = this.frame(el); return Draw.segDist(x, y, f.a, f.b); }
  press(el, x, y) { return null; }
  get signed() { return false; }
  box(el) { const f = this.frame(el), e = this.extent(el) + 2; return { x0: Math.min(f.a.x, f.b.x) - Math.abs(f.px) * e - 2, x1: Math.max(f.a.x, f.b.x) + Math.abs(f.px) * e + 2, y0: Math.min(f.a.y, f.b.y) - Math.abs(f.py) * e - 2, y1: Math.max(f.a.y, f.b.y) + Math.abs(f.py) * e + 2 }; }
  // a small sign beside the lead, on the side away from the label
  sign(g, f, s, d, ch, st, px, color) { Draw.text(g, ch, f.off(s, d, -st.nx, -st.ny), mono(px || 12, true), color || 'rgba(210,222,234,0.8)'); }

  // moving dots + a direction arrow for a current I (signed a -> b); `phase` is how far along a -> b the dots have drifted
  current(g, el, I, phase) { const tr = this.track(el); if (!tr) return; const segs = []; let total = 0;
    for (let i = 1; i < tr.pts.length; i++) { const p = tr.pts[i - 1], q = tr.pts[i], d = Math.hypot(q.x - p.x, q.y - p.y); if (d > 0) { segs.push({ p, q, d, s0: total }); total += d; } }
    if (!segs.length) return;
    const at = (s) => { s = Math.max(0, Math.min(total, s)); const sg = segs.find((x) => s <= x.s0 + x.d) || segs[segs.length - 1], t = (s - sg.s0) / sg.d; return { x: sg.p.x + (sg.q.x - sg.p.x) * t, y: sg.p.y + (sg.q.y - sg.p.y) * t, ux: (sg.q.x - sg.p.x) / sg.d, uy: (sg.q.y - sg.p.y) / sg.d }; };
    const fwd = I > 0, gap = Painter.SPACING, ph = ((phase % gap) + gap) % gap; g.fillStyle = INK.flow;
    for (let s = ph; s < total; s += gap) { const pos = s; if (tr.gaps.some((x) => pos > x[0] && pos < x[1])) continue; Draw.dot(g, at(pos), 2.5); }
    if (tr.arrow != null) { const p = at(tr.arrow), k = fwd ? 1 : -1, ux = p.ux * k, uy = p.uy * k; g.fillStyle = 'rgba(95,208,224,0.95)'; g.beginPath();
      g.moveTo(p.x + ux * 6, p.y + uy * 6); g.lineTo(p.x - ux * 4 - uy * 4, p.y - uy * 4 + ux * 4); g.lineTo(p.x - ux * 4 + uy * 4, p.y - uy * 4 - ux * 4); g.closePath(); g.fill(); } }
  // dot speed in px/s: rises with the current but levels off, so 0.1 A and 1 A both read
  static speed(I) { return 12 + 70 * (1 - Math.exp(-Math.abs(I) / 0.3)); }
}
Painter.SPACING = 32;

class WirePainter extends Painter {
  extent() { return 2; }
  track(el) { const f = this.frame(el); return { pts: [f.a, f.b], gaps: [], arrow: null }; }
}

class ResistorPainter extends Painter {
  // three full zigzags, 40 px long: six peaks with every stroke at the same slope
  half() { return 20; } extent() { return 8; }
  paint(g, el, st) { const f = this.leads(g, el, st), h = this.half(), n = 6, pts = [f.pt(-h)]; for (let k = 0; k < n; k++) pts.push(f.pt(-h + (k + 0.5) * 2 * h / n, k % 2 ? 7 : -7)); pts.push(f.pt(h));
    g.strokeStyle = this.color(st); g.lineWidth = st.sel ? 2.8 : 2.3; Draw.poly(g, pts); }
  label(el, name) { return this.valueLabel(el, name); }
}

class CapacitorPainter extends Painter {
  half() { return 5; } extent() { return 15; } get gap() { return true; } get signed() { return true; }
  // the glow between the plates and the + / − marks are part of the answer, so they go when it is hidden
  paint(g, el, st) { const f = this.leads(g, el, st), ph = 14, frac = Math.min(1, Math.abs(el.vc) / 12), charged = Math.abs(el.vc) > 0.02 && !st.hide;
    if (charged) { g.fillStyle = 'rgba(224,184,90,' + (0.05 + 0.8 * frac).toFixed(3) + ')'; const c = [f.pt(-5, -ph), f.pt(5, -ph), f.pt(5, ph), f.pt(-5, ph)]; g.beginPath(); c.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.fill(); }
    g.strokeStyle = this.color(st); g.lineWidth = 3; g.lineCap = 'butt'; Draw.line(g, f.pt(-5, -ph), f.pt(-5, ph)); Draw.line(g, f.pt(5, -ph), f.pt(5, ph)); g.lineCap = 'round';
    if (charged) { const pos = el.vc > 0 ? -1 : 1; this.sign(g, f, pos * 13, 9, '+', st, 10, 'rgba(224,184,90,0.95)'); this.sign(g, f, -pos * 13, 9, '−', st, 10, 'rgba(224,184,90,0.95)'); } }
  label(el, name, st) { return { ...this.valueLabel(el, name, ['Q = ' + (st.hide ? '?' : Fmt.Q(Math.abs(el.charge)))]), room: 12 }; }
}

class InductorPainter extends Painter {
  half() { return 14; } extent() { return 12; }
  paint(g, el, st) { const f = this.leads(g, el, st), seg = 28 / 3, r = seg * 0.62; g.strokeStyle = this.color(st); g.lineWidth = st.sel ? 2.4 : 2;
    for (let i = 0; i < 3; i++) Draw.ring(g, f.pt(-14 + seg * (i + 0.5), -r * 0.9), r); }
  label(el, name) { return this.valueLabel(el, name); }
}

class BatteryPainter extends Painter {
  half() { return 15; } extent() { return 12; } get gap() { return true; } get signed() { return true; }
  paint(g, el, st) { const f = this.leads(g, el, st), offs = [-15, -5, 5, 15], hw = [11, 5, 11, 5], lw = [2.6, 4.2, 2.6, 4.2]; g.strokeStyle = this.color(st); g.lineCap = 'butt';
    offs.forEach((o, i) => { g.lineWidth = lw[i]; Draw.line(g, f.pt(o, -hw[i]), f.pt(o, hw[i])); }); g.lineCap = 'round';
    this.sign(g, f, -24, 10, '+', st); this.sign(g, f, 24, 10, '−', st); }
  label(el, name) { return this.valueLabel(el, name, el.ri > 0 ? ['r = ' + Fmt.num(el.ri, 2) + ' Ω'] : []); }
}

class AcPainter extends Painter {
  half() { return 14; } extent() { return 15; } get gap() { return true; } get signed() { return true; }
  paint(g, el, st) { const f = this.leads(g, el, st), c = f.pt(0), rad = 14; g.fillStyle = INK.dark; Draw.dot(g, c, rad);
    g.strokeStyle = st.sel ? INK.sel : 'rgba(210,222,234,0.6)'; g.lineWidth = st.sel ? 2.2 : 1.6; Draw.ring(g, c, rad);
    g.strokeStyle = this.color(st); g.lineWidth = st.sel ? 2.2 : 1.8; const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push({ x: c.x + (t - 0.5) * 2 * rad * 0.72, y: c.y - Math.sin(t * Math.PI * 2) * rad * 0.42 }); } Draw.poly(g, pts);
    this.sign(g, f, -22, 9, '+', st, 10); }
  label(el, name) { return this.valueLabel(el, name, [Fmt.num(el.freq, 2) + ' Hz']); }
}

// Meters: the reading sits in a small box beside the dial. The box is as wide
// as the longest reading (`room` characters), so it does not twitch as digits change.
class MeterPainter extends Painter {
  half() { return 11; } extent() { return 12; } get signed() { return true; } get room() { return 11; }
  get letter() { return '?'; } get ink() { return INK.dim; } get ringInk() { return INK.dim; } get ringSel() { return INK.sel; } get boxInk() { return INK.dim; }
  paint(g, el, st) { const f = this.leads(g, el, st), c = f.pt(0); g.fillStyle = INK.dark; Draw.dot(g, c, 11); g.strokeStyle = st.sel ? this.ringSel : this.ringInk; g.lineWidth = st.sel ? 2.8 : 2.2; Draw.ring(g, c, 11);
    Draw.text(g, this.letter, { x: c.x, y: c.y + 0.5 }, mono(11, true), this.ink); this.sign(g, f, -18, 8, '+', st, 9, this.ink); }
  value(el, sol) { return Fmt.none; }
  label(el, name, st) { return { lines: [{ t: name + ' ' + (st.hide ? '?' : this.value(el, st.sol)), px: 10, bold: true, color: this.ink }], boxed: this.boxInk, below: true, room: this.room }; }
}
class VoltmeterPainter extends MeterPainter {
  get letter() { return 'V'; } get ink() { return INK.volt; } get ringInk() { return INK.voltRing; } get ringSel() { return '#f08a92'; } get boxInk() { return 'rgba(214,69,80,0.5)'; }
  value(el, sol) { const r = sol ? el.reading(sol) : {}; return r.err || r.dV == null ? Fmt.none : Fmt.V(r.dV); }
  track() { return null; }
}
class AmmeterPainter extends MeterPainter {
  get letter() { return 'A'; } get ink() { return INK.amp; } get ringInk() { return INK.ampRing; } get ringSel() { return '#8ee0a0'; } get boxInk() { return 'rgba(90,158,58,0.55)'; } get gap() { return true; }
  value(el, sol) { const r = sol ? el.reading(sol) : {}; return r.err || r.I == null ? Fmt.none : Fmt.signedA(r.I); }
  track(el) { const t = super.track(el); t.arrow = null; return t; }
}

class SwitchPainter extends Painter {
  extent() { return 15; }
  label(el, name) { return name ? { lines: [{ t: name, px: 11, bold: true, color: INK.gold }] } : null; }
  ends(el) { const f = this.frame(el), p1 = f.pt(-0.18 * f.L), p2 = f.pt(0.18 * f.L); return { f, p1, p2, tip: el.closed ? p2 : { x: p2.x - f.px * 14 - f.ux * 3, y: p2.y - f.py * 14 - f.uy * 3 } }; }
  paint(g, el, st) { const { f, p1, p2, tip } = this.ends(el); g.strokeStyle = st.sel ? INK.sel : INK.lead; g.lineWidth = st.sel ? 3 : 2.4; g.lineCap = 'round'; Draw.line(g, f.a, p1); Draw.line(g, p2, f.b);
    g.strokeStyle = st.sel ? INK.sel : (el.closed ? INK.on : INK.off); g.lineWidth = st.sel ? 3 : 2.6; Draw.line(g, p1, tip);
    g.fillStyle = 'rgba(210,222,234,0.9)'; Draw.dot(g, p1, 3.2); Draw.dot(g, p2, 3.2); }
  // is a world point on the lever (the part you click to open / close it)?
  press(el, x, y) { return this.onLever(el, x, y) ? {} : null; }
  // (between the two contacts only: the leads on either side are for grabbing and wiring)
  onLever(el, x, y) { const { f, p1, p2, tip } = this.ends(el), s = (x - f.mx) * f.ux + (y - f.my) * f.uy; if (Math.abs(s) > 0.18 * f.L + 4) return false;
    return Math.min(Draw.segDist(x, y, p1, tip), Draw.segDist(x, y, p1, p2)) < 12; }
  distance(el, x, y) { const { f, p1, tip } = this.ends(el); return Math.min(Draw.segDist(x, y, f.a, f.b), Draw.segDist(x, y, p1, tip)); }
}

class ThrowSwitchPainter extends Painter {
  extent() { return 40; }               // (its name goes outside the two throws and their "1" / "2" marks)
  label(el, name) { return name ? { lines: [{ t: name, px: 11, bold: true, color: INK.gold }] } : null; }
  pts(el) { const G = el.geom(); return { a: View.xy(el.a), pivot: View.xy(G.pivot), t1: View.xy(G.t1), t2: View.xy(G.t2), b1: View.xy(el.b1), b2: View.xy(el.b2) }; }
  paint(g, el, st) { const q = this.pts(el), live = el.position === 1 ? q.t1 : q.t2, idle = el.position === 1 ? q.t2 : q.t1;
    g.strokeStyle = st.sel ? INK.sel : INK.lead; g.lineWidth = st.sel ? 3 : 2.4; g.lineCap = 'round'; Draw.line(g, q.a, q.pivot); Draw.line(g, q.t1, q.b1); Draw.line(g, q.t2, q.b2);
    g.strokeStyle = st.sel ? INK.sel : INK.on; g.lineWidth = st.sel ? 3 : 2.6; Draw.line(g, q.pivot, live);
    g.fillStyle = 'rgba(210,222,234,0.9)'; Draw.dot(g, q.pivot, 3.2); Draw.dot(g, q.t1, 3.2); Draw.dot(g, q.t2, 3.2);
    g.strokeStyle = 'rgba(200,212,234,0.6)'; g.lineWidth = 1.6; Draw.ring(g, idle, 5.4);
    // which throw is "1" and which is "2"
    const d = Math.hypot(q.t1.x - q.t2.x, q.t1.y - q.t2.y) || 1, ox = (q.t1.x - q.t2.x) / d * 11, oy = (q.t1.y - q.t2.y) / d * 11;
    Draw.text(g, '1', { x: q.t1.x + ox, y: q.t1.y + oy }, mono(8.5, true), INK.dim); Draw.text(g, '2', { x: q.t2.x - ox, y: q.t2.y - oy }, mono(8.5, true), INK.dim); }
  // which throw (1 or 2) a world point is on, or 0
  contactAt(el, x, y) { const q = this.pts(el); if (Math.hypot(x - q.t1.x, y - q.t1.y) < 9) return 1; if (Math.hypot(x - q.t2.x, y - q.t2.y) < 9) return 2; return 0; }
  press(el, x, y) { const k = this.contactAt(el, x, y); return k ? { position: k } : (this.onLever(el, x, y) ? {} : null); }
  onLever(el, x, y) { const q = this.pts(el); return Draw.segDist(x, y, q.pivot, el.position === 1 ? q.t1 : q.t2) < 9; }
  track(el) { const q = this.pts(el), one = el.position === 1; return { pts: [q.a, q.pivot, one ? q.t1 : q.t2, one ? q.b1 : q.b2], gaps: [], arrow: 12 }; }
  distance(el, x, y) { const q = this.pts(el); return Math.min(Draw.segDist(x, y, q.a, q.pivot), Draw.segDist(x, y, q.t1, q.b1), Draw.segDist(x, y, q.t2, q.b2), Draw.segDist(x, y, q.pivot, el.position === 1 ? q.t1 : q.t2), Draw.segDist(x, y, q.t1, q.t2) + 4); }
  box(el) { const q = this.pts(el), xs = [q.a.x, q.b1.x, q.b2.x], ys = [q.a.y, q.b1.y, q.b2.y]; return { x0: Math.min(...xs) - 6, x1: Math.max(...xs) + 6, y0: Math.min(...ys) - 6, y1: Math.max(...ys) + 6 }; }
}

class GroundPainter extends Painter {
  extent() { return 12; }
  paint(g, el, st) { const f = this.frame(el), at = (s, n) => ({ x: f.a.x + f.ux * s + f.px * n, y: f.a.y + f.uy * s + f.py * n }); g.strokeStyle = st.sel ? INK.sel : INK.lead; g.lineCap = 'round'; g.lineWidth = st.sel ? 3 : 2.4; Draw.line(g, f.a, at(18, 0));
    g.lineWidth = 2.2; [[22, 11], [28, 7], [34, 3.5]].forEach(([s, w]) => Draw.line(g, at(s, -w), at(s, w))); }
  track() { return null; }
}

const PAINTERS = { wire: new WirePainter(), resistor: new ResistorPainter(), cap: new CapacitorPainter(), ind: new InductorPainter(), battery: new BatteryPainter(), ac: new AcPainter(),
  volt: new VoltmeterPainter(), amm: new AmmeterPainter(), switch: new SwitchPainter(), swdt: new ThrowSwitchPainter(), ground: new GroundPainter() };
