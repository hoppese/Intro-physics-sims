// =====================================================================
// Component -- the page's controller, deliberately thin: it owns the canvases
// and the frame tick, turns pointer, wheel and key events into calls on the
// Lab and its view, and asks the Renderer, the Graphs and the Panel to show
// the result.
// =====================================================================
class Component extends DCLogic {
  state = { menuOpen: false, presetsOpen: false, showInfo: false, showShare: false, shareCopied: false, shareHide: false, showBug: false, bugText: '', bugEmail: '', bugSending: false, bugResult: '', draft: null };
  big = false;
  _obBig = /[?&]big=1(&|$)/.test((typeof location !== 'undefined' && location.search) || '');
  lab = new Lab();
  renderer = new Renderer();
  graphs = new Graphs();
  panel = new Panel(this);
  shown = '';

  // (whether every component is listed under the before → now table: closed at first, then remembered in this browser)
  detail = (() => { try { return localStorage.getItem('momentum-lab:detail') === '1'; } catch (e) { return false; } })();
  toggleDetail() { this.detail = !this.detail; try { localStorage.setItem('momentum-lab:detail', this.detail ? '1' : '0'); } catch (e) {} this.refresh(); }
  renderVals() { return this.panel.all(); }
  componentDidMount() { window.__momentum = this; if (!document.title) document.title = 'Momentum Lab'; Link.apply(this.lab); this.publish(); this.refresh(); }
  componentDidUpdate() { this.publish(); }
  componentWillUnmount() { clearInterval(this.timer); this.started = false; for (const [type, fn] of this.windowEvents()) window.removeEventListener(type, fn); }
  windowEvents() { return [['pointermove', this.onMove], ['pointerup', this.onUp], ['pointercancel', this.onUp], ['keydown', this.onKeyDown]]; }

  run(fn) { return () => { fn(); this.refresh(); }; }
  refresh() { this.shown = this.stamp; this.forceUpdate(); }
  // everything the panel depends on: when it changes, the panel is drawn again (while running, ten times a second)
  get stamp() { const s = this.lab; return s.rev + '|' + (s.playing ? Math.floor(Date.now() / 100) : 0) + '|' + (s.world.done ? 1 : 0); }

  setCanvas = (el) => { if (el === this.canvas) return; this.canvas = el; if (!el) return; el.dataset.obResponsive = '1'; this.ctx = el.getContext('2d');
    el.addEventListener('pointerdown', this.onDown); el.addEventListener('wheel', this.onWheel, { passive: false });
    if (!this.started) { this.started = true; for (const [type, fn] of this.windowEvents()) window.addEventListener(type, fn); this.timer = setInterval(() => this.frame(), 1000 / 60); }
    this.lab.dirty = true; this.frame(); };
  setGraph = (el) => { if (el === this.gcanvas) return; this.gcanvas = el; this.gctx = el ? el.getContext('2d') : null; if (!el) return; el.dataset.obResponsive = '1'; if (el.style.maxWidth) el.style.removeProperty('max-width'); this.lab.dirty = true; };
  obResize() { const c = this.canvas; if (!c) return false; const dpr = window.devicePixelRatio || 1;
    if (this._obBig) { const wNow = Math.round(c.clientWidth) || 600, th = Math.round(Math.max(400, Math.min(wNow * 0.68, (window.innerHeight || 820) - 260))); if (c.style.height !== th + 'px') c.style.height = th + 'px'; }
    const w = Math.round(c.clientWidth) || 600, h = Math.round(c.clientHeight) || 400; let changed = w !== this._cw || h !== this._ch || dpr !== this.dpr; this._cw = w; this._ch = h; this.dpr = dpr;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); changed = true; }
    return changed; }
  frame() { const s = this.lab; if (!this.ctx) return; const now = typeof performance !== 'undefined' ? performance.now() : Date.now(), dt = this.lastT ? (now - this.lastT) / 1000 : 0; this.lastT = now;
    if (this.obResize()) { s.dirty = true; this.shown = ''; } if (!this.drag || this.drag.kind === 'pan') s.tick(Math.min(dt, 0.1));
    if (s.dirty) this.draw(); if (this.stamp !== this.shown) this.refresh(); }
  draw() { const g = this.ctx, s = this.lab; s.view.resize(this._cw, this._ch); s.dirty = false; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.renderer.draw(g, s); this.drawGraphs(); }
  drawGraphs() { const c = this.gcanvas, g = this.gctx, s = this.lab; if (!c || !g || s.graph === 'off') return; if (c.style.maxWidth) c.style.removeProperty('max-width'); const dpr = window.devicePixelRatio || 1, w = Math.round(c.clientWidth) || 560, h = Graphs.H;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); this.graphs.draw(g, s, w, h); }
  zoom(k) { const v = this.lab.view; v.zoomAt(k, v.W / 2, v.H / 2); this.lab.bump(); this.refresh(); }

  // ---- pointer: drag an arrow's tip (v⃗₀), drag a body (r⃗₀), or drag empty space to pan ----
  at(e) { const r = this.canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * (this._cw / (r.width || this._cw)), y: (e.clientY - r.top) * (this._ch / (r.height || this._ch)) }; }
  onDown = (e) => { if (e.button !== 0) return; e.preventDefault(); const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); try { this.canvas.setPointerCapture(e.pointerId); } catch (err) {}
    const p = this.at(e), R = this.renderer, s = this.lab, near = (q, r) => Math.hypot(q.x - p.x, q.y - p.y) <= r;
    const h = s.atStart && !s.playing ? R.handles.slice().reverse().find((q) => near(q, 10)) : null;
    if (h) { this.drag = { kind: 'v', ...h, moved: false }; s.select(h.id); }
    else { const b = R.hits.slice().reverse().find((q) => near(q, q.r)); if (b) { const sb = s.body(b.id), w = s.view.toWorld(p.x, p.y); this.drag = { kind: 'body', id: b.id, off: sb ? { x: w.x - sb.x, y: w.y - sb.y } : V.O, x: p.x, y: p.y, moved: false, was: s.sel === b.id }; s.select(b.id); }
      else this.drag = { kind: 'pan', x: p.x, y: p.y, moved: false, sel: s.sel }; }
    this.canvas.style.cursor = 'grabbing'; this.refresh(); };
  onMove = (e) => { const d = this.drag; if (!d || !this.canvas) return; const p = this.at(e), s = this.lab;
    if (d.kind === 'pan') { if (!d.moved && Math.hypot(p.x - d.x, p.y - d.y) < 3) return; d.moved = true; s.view.pan(p.x - d.x, p.y - d.y); d.x = p.x; d.y = p.y; s.bump(); return; }
    if (d.kind === 'v') { d.moved = true; const dx = p.x - d.ax, dy = p.y - d.ay, l = Math.hypot(dx, dy) || 1, m = Math.max(0, l - (d.gap || 0)) / d.k; s.setV0(d.id, { x: dx / l * m, y: -dy / l * m }); this.refresh(); return; }
    if (!d.moved && Math.hypot(p.x - d.x, p.y - d.y) < 4) return; d.moved = true; const w = s.view.toWorld(p.x, p.y); s.place(d.id, { x: w.x - d.off.x, y: w.y - d.off.y }); this.refresh(); };
  onUp = () => { const d = this.drag; if (!d) return; this.drag = null; if (this.canvas) this.canvas.style.cursor = 'grab'; const s = this.lab;
    if (d.kind === 'body' && !d.moved && d.was) s.select(null); if (d.kind === 'pan' && !d.moved) s.select(null); this.refresh(); };
  get framed() { try { return window.self !== window.top; } catch (err) { return true; } }
  onWheel = (e) => { if (this.framed && !e.ctrlKey && !e.metaKey) return; e.preventDefault(); const p = this.at(e); this.lab.view.zoomAt(Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * 0.004), p.x, p.y); this.lab.bump(); this.refresh(); };

  get overlayOpen() { const s = this.state; return s.showShare || s.showInfo || s.showBug; }
  onKeyDown = (e) => { const tag = (e.target && e.target.tagName) || '', key = e.key;
    if (this.overlayOpen) { if (key === 'Escape') this.setState({ showShare: false, showInfo: false, showBug: false }); return; }
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') { if (key === 'Enter' && e.target.blur) e.target.blur(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (key === ' ' && tag !== 'BUTTON') { e.preventDefault(); this.lab.toggle(); this.refresh(); }
    else if (key === 'Escape') { if (this.state.menuOpen || this.state.presetsOpen) this.setState({ menuOpen: false, presetsOpen: false }); else { this.lab.select(null); this.refresh(); } } };

  publish() { try { const s = this.lab, snap = s.snapshot(); window.simState = { sim: 'momentum-lab', ...snap };
    window.simAPI = { get: () => s.snapshot(), set: () => {}, hideValues: (on) => { s.hide(on); this.refresh(); }, preset: (k) => { const [m, p] = String(k).split(':'); const ok = p ? s.load(m, p) : s.load(s.mode, m); this.refresh(); return ok; }, share: () => Link.url(s, s.hidden) };
    if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'sim-state', sim: 'momentum-lab', ...snap }, '*'); } catch (e) {} }
  copyShare() { const url = Link.url(this.lab, this.state.shareHide), done = () => this.setState({ shareCopied: true });
    try { const r = navigator.clipboard && navigator.clipboard.writeText(url); if (r && r.then) r.then(done, done); else done(); } catch (e) { done(); } }
  submitBug() { const st = this.state, text = (st.bugText || '').trim(); if (text.length < 3) { this.setState({ bugResult: 'err:Please describe the problem first.' }); return; } if (st.bugSending) return;
    this.setState({ bugSending: true, bugResult: '' });
    const payload = { sim: 'momentum-lab', text: text.slice(0, 4000), email: (st.bugEmail || '').trim().slice(0, 200), pageUrl: location.href, userAgent: navigator.userAgent, simState: window.simState || null, website: '' };
    fetch('https://sims-api.sethhopper.com/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then((r) => r.json().catch(() => ({})).then((j) => ({ ok: r.ok, j })))
      .then((res) => { if (res.ok && res.j && res.j.ok) this.setState({ bugSending: false, bugResult: 'ok:Thanks — your report was filed.', bugText: '' });
        else this.setState({ bugSending: false, bugResult: 'err:Could not send' + (res.j && res.j.error ? ' (' + res.j.error + ')' : '') + '. Please try again later.' }); })
      .catch(() => this.setState({ bugSending: false, bugResult: 'err:Network error — please try again.' })); }
}
