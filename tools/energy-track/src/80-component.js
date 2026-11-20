// =====================================================================
// Component -- the page's controller, deliberately thin: it owns the two
// canvases (the track and the graph strip) and the frame tick, turns pointer
// and key events into calls on the Sim, and asks the Renderer, the Graphs and
// the Panel to show the result. On the track: drag a control point to reshape
// it, drag the ball (or car) along it to choose the start, drag the U_g = 0
// tag to move the zero; double-click the track to add a point, a point to
// remove it. On the graph strip: drag to go to a moment of the run.
// =====================================================================
class Component extends DCLogic {
  state = { menuOpen: false, tracksOpen: false, showInfo: false, showShare: false, shareCopied: false, shareHide: false, showBug: false, bugText: '', bugEmail: '', bugSending: false, bugResult: '', draft: null };
  big = false;
  _obBig = /[?&]big=1(&|$)/.test((typeof location !== 'undefined' && location.search) || '');
  sim = new Sim();
  renderer = new Renderer();
  graphs = new Graphs();
  panel = new Panel(this);
  shown = '';

  renderVals() { return this.panel.all(); }
  componentDidMount() { window.__energy = this; if (!document.title) document.title = 'Energy Track'; Link.apply(this.sim); this.publish(); this.refresh(); }
  componentDidUpdate() { this.publish(); }
  componentWillUnmount() { clearInterval(this.timer); this.started = false; for (const [type, fn] of this.windowEvents()) window.removeEventListener(type, fn); }
  windowEvents() { return [['pointermove', this.onMove], ['pointerup', this.onUp], ['pointercancel', this.onUp], ['keydown', this.onKeyDown]]; }

  run(fn) { return () => { fn(); this.refresh(); }; }
  refresh() { this.shown = this.stamp; this.forceUpdate(); }
  get stamp() { const s = this.sim; return s.rev + '|' + Math.floor(s.time * 10) + '|' + (s.ride.done ? 1 : 0) + '|' + (s.ride.event || '').length; }

  setCanvas = (el) => { if (el === this.canvas) return; this.canvas = el; if (!el) return; el.dataset.obResponsive = '1'; this.ctx = el.getContext('2d');
    el.addEventListener('pointerdown', this.onDown); el.addEventListener('dblclick', this.onDouble); el.addEventListener('pointermove', this.onHover); this.start(); };
  setGraphCanvas = (el) => { if (el === this.gcanvas) return; this.gcanvas = el; if (!el) return; el.dataset.obResponsive = '1'; this.gctx = el.getContext('2d'); el.addEventListener('pointerdown', this.onGraphDown); this.start(); };
  start() { if (!this.started) { this.started = true; for (const [type, fn] of this.windowEvents()) window.addEventListener(type, fn); this.timer = setInterval(() => this.frame(), 1000 / 60); } this.sim.dirty = true; this.frame(); }
  size(c, key) { if (c.style.maxWidth) c.style.removeProperty('max-width'); const dpr = window.devicePixelRatio || 1, w = Math.round(c.clientWidth) || 600, h = Math.round(c.clientHeight) || 440, was = this[key];
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    this[key] = { w, h, dpr }; return !was || was.w !== w || was.h !== h || was.dpr !== dpr; }
  frame() { const s = this.sim; if (!this.ctx) return; const now = typeof performance !== 'undefined' ? performance.now() : Date.now(), dt = this.lastT ? (now - this.lastT) / 1000 : 0; this.lastT = now;
    if (this._obBig && this.canvas) { const wNow = Math.round(this.canvas.clientWidth) || 600, th = Math.round(Math.max(440, Math.min(wNow * 0.73, (window.innerHeight || 820) - 420))); if (this.canvas.style.height !== th + 'px') this.canvas.style.height = th + 'px'; }
    else this.fitHeight();
    let changed = this.size(this.canvas, 'cs'); if (this.gcanvas && this.size(this.gcanvas, 'gs')) changed = true; if (changed) s.dirty = true; s.tick(Math.min(dt, 0.1));
    if (s.dirty) this.draw(); if (this.stamp !== this.shown) this.refresh(); }
  // Everything on one screen: the graph strip's height follows the window's, and the picture is as tall as its width
  // allows (600:440) but no taller than leaves room for everything else in its column. (Not in ?big=1, which sizes it.)
  fitHeight() { const c = this.canvas, gc = this.gcanvas, H = window.innerHeight || 800; if (!c || !c.isConnected || (this._fitN = (this._fitN || 0) + 1) % 6 !== 1) return;
    if (gc) { const gh = Math.round(Math.max(110, Math.min(200, H * 0.19))) + 'px'; if (gc.style.height !== gh) gc.style.height = gh; }
    const col = c.parentElement && c.parentElement.parentElement, other = col && col.nextElementSibling; if (!col) return;
    const content = (el) => { if (!el) return 0; const top = el.getBoundingClientRect().top; let b = top; for (const k of el.children) { const r = k.getBoundingClientRect(); if (r.height) b = Math.max(b, r.bottom); } return b - top + (parseFloat(getComputedStyle(el).paddingBottom) || 0); };
    const ch = c.getBoundingClientRect().height, left = content(col), right = content(other), doc = document.documentElement.scrollHeight, rest = doc - Math.max(left, right) + (left - ch);
    const natural = c.clientWidth * (this.sim.graph === 'off' ? 0.85 : 440 / 600), h = Math.round(Math.max(240, Math.min(natural, H - rest)));
    if (Math.abs(h - ch) > 1) { c.style.aspectRatio = 'auto'; c.style.height = h + 'px'; } }
  draw() { const s = this.sim, c = this.cs; s.dirty = false; this.ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0); this.renderer.draw(this.ctx, s, c.w, c.h);
    if (this.gctx && this.gs && s.graph !== 'off') { const q = this.gs; this.gctx.setTransform(q.dpr, 0, 0, q.dpr, 0, 0); this.graphs.draw(this.gctx, s, q.w, q.h); } }

  // ---- pointer on the track ----
  local(e, el) { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  get editable() { return true; }
  // what is under the pointer: a control point, the rider, the zero tag, or the track
  pick(q) { const R = this.renderer, s = this.sim; if (!R.s) return null; const pts = s.track.pts;
    let best = -1, bd = 11; pts.forEach((p, i) => { const d = Math.hypot(R.X(p.x) - q.x, R.Y(p.y) - q.y); if (d < bd) { bd = d; best = i; } }); if (best >= 0) return { kind: 'point', i: best };
    if (R.hit && Math.hypot(R.hit.x - q.x, R.hit.y - q.y) < R.hit.r) return { kind: 'rider' };
    const z = R.zeroTag; if (z && q.x >= z.x0 - 4 && q.x <= z.x1 + 4 && q.y >= z.y0 - 4 && q.y <= z.y1 + 4) return { kind: 'zero' };
    const w = R.toWorld(q.x, q.y), near = s.track.nearest(w); if (near.d * R.s < 9) return { kind: 'track', u: near.u }; return null; }
  onHover = (e) => { if (this.drag || !this.canvas) return; const h = this.pick(this.local(e, this.canvas)), s = this.sim, i = h && h.kind === 'point' ? h.i : null;
    this.canvas.style.cursor = !h ? 'default' : h.kind === 'zero' ? 'ns-resize' : h.kind === 'track' ? 'copy' : 'grab'; if (i !== s.hover) { s.hover = i; s.dirty = true; } };
  onDown = (e) => { if (e.button !== 0) return; const q = this.local(e, this.canvas), h = this.pick(q); if (!h || h.kind === 'track') return; e.preventDefault(); try { this.canvas.setPointerCapture(e.pointerId); } catch (err) {}
    this.drag = h; if (h.kind === 'point') this.sim.sel = h.i; this.canvas.style.cursor = h.kind === 'zero' ? 'ns-resize' : 'grabbing'; this.sim.dirty = true; };
  onMove = (e) => { const d = this.drag; if (!d) return; const s = this.sim, R = this.renderer;
    if (d.kind === 'graph') { const t = this.graphs.timeAt(this.local(e, this.gcanvas).x); if (t != null) { s.seek(t); this.refresh(); } return; }
    const w = R.toWorld(this.local(e, this.canvas).x, this.local(e, this.canvas).y);
    if (d.kind === 'point') s.movePoint(d.i, w); else if (d.kind === 'rider') s.setRelease(s.track.sAt(s.track.nearest(w).u)); else if (d.kind === 'zero') s.set('y0', Math.round(w.y * 10) / 10);
    this.refresh(); };
  onUp = () => { if (!this.drag) return; this.drag = null; this.sim.sel = null; this.sim.dirty = true; if (this.canvas) this.canvas.style.cursor = 'default'; this.refresh(); };
  onDouble = (e) => { const h = this.pick(this.local(e, this.canvas)), s = this.sim; if (!h) return; e.preventDefault(); if (h.kind === 'point') s.removePoint(h.i); else if (h.kind === 'track') s.insertAt(h.u); this.refresh(); };
  // ---- the graph strip: drag to a moment ----
  onGraphDown = (e) => { if (e.button !== 0) return; const t = this.graphs.timeAt(this.local(e, this.gcanvas).x); if (t == null) return; e.preventDefault(); try { this.gcanvas.setPointerCapture(e.pointerId); } catch (err) {} this.drag = { kind: 'graph' }; this.sim.seek(t); this.refresh(); };

  get overlayOpen() { const s = this.state; return s.showShare || s.showInfo || s.showBug; }
  onKeyDown = (e) => { const tag = (e.target && e.target.tagName) || '', key = e.key;
    if (this.overlayOpen) { if (key === 'Escape') this.setState({ showShare: false, showInfo: false, showBug: false }); return; }
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') { if (key === 'Enter' && e.target.blur) e.target.blur(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (key === ' ' && tag !== 'BUTTON') { e.preventDefault(); this.sim.toggle(); this.refresh(); }
    else if (key === 'Escape' && (this.state.menuOpen || this.state.tracksOpen)) this.setState({ menuOpen: false, tracksOpen: false }); };

  publish() { try { const s = this.sim, snap = s.snapshot(); window.simState = { sim: 'energy-track', ...snap };
    window.simAPI = { get: () => s.snapshot(), set: () => {}, hideValues: (on) => { s.hide(on); this.refresh(); }, preset: (k) => { const ok = s.choose(k); this.refresh(); return ok; }, share: () => Link.url(s, s.hidden) };
    if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'sim-state', sim: 'energy-track', ...snap }, '*'); } catch (e) {} }

  copyShare() { const url = Link.url(this.sim, this.state.shareHide), done = () => this.setState({ shareCopied: true });
    try { const r = navigator.clipboard && navigator.clipboard.writeText(url); if (r && r.then) r.then(done, done); else done(); } catch (e) { done(); } }

  submitBug() { const st = this.state, text = (st.bugText || '').trim(); if (text.length < 3) { this.setState({ bugResult: 'err:Please describe the problem first.' }); return; } if (st.bugSending) return;
    this.setState({ bugSending: true, bugResult: '' });
    const payload = { sim: 'energy-track', text: text.slice(0, 4000), email: (st.bugEmail || '').trim().slice(0, 200), pageUrl: location.href, userAgent: navigator.userAgent, simState: window.simState || null, website: '' };
    fetch('https://sims-api.sethhopper.com/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then((r) => r.json().catch(() => ({})).then((j) => ({ ok: r.ok, j })))
      .then((res) => { if (res.ok && res.j && res.j.ok) this.setState({ bugSending: false, bugResult: 'ok:Thanks — your report was filed.', bugText: '' });
        else this.setState({ bugSending: false, bugResult: 'err:Could not send' + (res.j && res.j.error ? ' (' + res.j.error + ')' : '') + '. Please try again later.' }); })
      .catch(() => this.setState({ bugSending: false, bugResult: 'err:Network error — please try again.' })); }
}
