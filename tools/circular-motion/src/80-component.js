// =====================================================================
// Component -- the page's controller, deliberately thin: it owns the canvas
// and the frame tick, turns pointer, wheel and key events into calls on the
// Sim and its camera, and asks the Renderer and the Panel to show the result.
// =====================================================================
class Component extends DCLogic {
  state = { menuOpen: false, sitsOpen: false, showInfo: false, showShare: false, shareCopied: false, shareHide: false, showBug: false, bugText: '', bugEmail: '', bugSending: false, bugResult: '', draft: null };
  big = false;
  _obBig = /[?&]big=1(&|$)/.test((typeof location !== 'undefined' && location.search) || '');
  sim = new Sim();
  renderer = new Renderer();
  panel = new Panel(this);
  shown = '';

  renderVals() { return this.panel.all(); }

  componentDidMount() { window.__circular = this; if (!document.title) document.title = 'Circular Motion'; Link.apply(this.sim); this.publish(); this.refresh(); }
  componentDidUpdate() { this.publish(); }
  componentWillUnmount() { clearInterval(this.timer); this.started = false; for (const [type, fn] of this.windowEvents()) window.removeEventListener(type, fn); }
  windowEvents() { return [['pointermove', this.onMove], ['pointerup', this.onUp], ['pointercancel', this.onUp], ['keydown', this.onKeyDown]]; }

  run(fn) { return () => { fn(); this.refresh(); }; }
  refresh() { this.shown = this.stamp; this.forceUpdate(); }
  // everything the panel depends on: when it changes, the panel is drawn again (the clock's numbers ten times a second)
  get stamp() { const s = this.sim; return s.rev + '|' + s.cam.view + '|' + Math.floor(s.time * 10); }

  setCanvas = (el) => { if (el === this.canvas) return; this.canvas = el; if (!el) return; el.dataset.obResponsive = '1'; this.ctx = el.getContext('2d');
    el.addEventListener('pointerdown', this.onDown); el.addEventListener('wheel', this.onWheel, { passive: false });
    if (!this.started) { this.started = true; for (const [type, fn] of this.windowEvents()) window.addEventListener(type, fn); this.timer = setInterval(() => this.frame(), 1000 / 60); }
    this.sim.dirty = true; this.frame(); };
  obResize() { const c = this.canvas; if (!c) return false; const dpr = window.devicePixelRatio || 1;
    if (this._obBig) { const wNow = Math.round(c.clientWidth) || 600, th = Math.round(Math.max(440, Math.min(wNow * 0.7, (window.innerHeight || 820) - 210))); if (c.style.height !== th + 'px') c.style.height = th + 'px'; }
    const w = Math.round(c.clientWidth) || 600, h = Math.round(c.clientHeight) || 440; let changed = w !== this._cw || h !== this._ch || dpr !== this.dpr; this._cw = w; this._ch = h; this.dpr = dpr;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); changed = true; }
    return changed; }
  frame() { const s = this.sim; if (!this.ctx) return; const now = typeof performance !== 'undefined' ? performance.now() : Date.now(), dt = this.lastT ? (now - this.lastT) / 1000 : 0; this.lastT = now;
    if (this.obResize()) s.dirty = true; s.tick(Math.min(dt, 0.1));
    if (s.dirty) this.draw(); if (this.stamp !== this.shown) this.refresh(); }
  draw() { const g = this.ctx, s = this.sim; s.cam.resize(this._cw, this._ch); s.dirty = false; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.renderer.draw(g, s, this._cw, this._ch); }

  // ---- drag to turn the view; the wheel (or a pinch, inside a frame) zooms ----
  onDown = (e) => { if (e.button !== 0) return; e.preventDefault(); try { this.canvas.setPointerCapture(e.pointerId); } catch (err) {} this.drag = { x: e.clientX, y: e.clientY }; this.canvas.style.cursor = 'grabbing'; };
  onMove = (e) => { if (!this.drag) return; this.sim.cam.orbit(e.clientX - this.drag.x, e.clientY - this.drag.y); this.drag = { x: e.clientX, y: e.clientY }; this.sim.bump(); };
  onUp = () => { if (!this.drag) return; this.drag = null; if (this.canvas) this.canvas.style.cursor = 'grab'; };
  get framed() { try { return window.self !== window.top; } catch (err) { return true; } }
  onWheel = (e) => { if (this.framed && !e.ctrlKey && !e.metaKey) return; e.preventDefault(); this.sim.cam.zoomBy(Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * 0.004)); this.sim.bump(); };

  get overlayOpen() { const s = this.state; return s.showShare || s.showInfo || s.showBug; }
  onKeyDown = (e) => { const tag = (e.target && e.target.tagName) || '', key = e.key;
    if (key === 'Escape' && this.state.sitsOpen) { this.setState({ sitsOpen: false }); return; }
    if (this.overlayOpen) { if (key === 'Escape') this.setState({ showShare: false, showInfo: false, showBug: false }); return; }
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') { if (key === 'Enter' && e.target.blur) e.target.blur(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (key === ' ' && tag !== 'BUTTON') { e.preventDefault(); this.sim.toggle(); this.refresh(); }
    else if (key === 'Escape' && this.state.menuOpen) this.setState({ menuOpen: false }); };

  publish() { try { const s = this.sim, snap = s.snapshot(); window.simState = { sim: 'circular-motion', ...snap };
    window.simAPI = { get: () => s.snapshot(), set: () => {}, hideValues: (on) => { s.hide(on); this.refresh(); }, preset: (k) => { const ok = s.choose(k); this.refresh(); return ok; }, share: () => Link.url(s, s.hidden) };
    if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'sim-state', sim: 'circular-motion', ...snap }, '*'); } catch (e) {} }

  copyShare() { const url = Link.url(this.sim, this.state.shareHide), done = () => this.setState({ shareCopied: true });
    try { const r = navigator.clipboard && navigator.clipboard.writeText(url); if (r && r.then) r.then(done, done); else done(); } catch (e) { done(); } }

  submitBug() { const st = this.state, text = (st.bugText || '').trim(); if (text.length < 3) { this.setState({ bugResult: 'err:Please describe the problem first.' }); return; } if (st.bugSending) return;
    this.setState({ bugSending: true, bugResult: '' });
    const payload = { sim: 'circular-motion', text: text.slice(0, 4000), email: (st.bugEmail || '').trim().slice(0, 200), pageUrl: location.href, userAgent: navigator.userAgent, simState: window.simState || null, website: '' };
    fetch('https://sims-api.sethhopper.com/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then((r) => r.json().catch(() => ({})).then((j) => ({ ok: r.ok, j })))
      .then((res) => { if (res.ok && res.j && res.j.ok) this.setState({ bugSending: false, bugResult: 'ok:Thanks — your report was filed.', bugText: '' });
        else this.setState({ bugSending: false, bugResult: 'err:Could not send' + (res.j && res.j.error ? ' (' + res.j.error + ')' : '') + '. Please try again later.' }); })
      .catch(() => this.setState({ bugSending: false, bugResult: 'err:Network error — please try again.' })); }
}
