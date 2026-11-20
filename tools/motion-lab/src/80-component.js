// =====================================================================
// Component -- the page's controller, deliberately thin: it owns the canvas
// and the frame tick, turns pointer and key events into calls on the Sim
// (drag the cart, draw a sketch, scrub along the graphs; arrow keys for the
// throttle, Space for the clock), and asks the Renderer and the Panel to show
// the result.
// =====================================================================
class Component extends DCLogic {
  state = { menuOpen: false, openMenu: null, showWork: false, showInfo: false, showShare: false, shareCopied: false, showBug: false, bugText: '', bugEmail: '', bugResult: '', bugSending: false, draft: null };
  big = false;
  sim = new Sim();
  renderer = new Renderer();
  panel = new Panel(this);
  shown = '';

  renderVals() { return this.panel.all(); }

  componentDidMount() { window.__motion = this; if (!document.title) document.title = 'Motion Lab'; Link.apply(this.sim); this.publish(); this.refresh(); }
  componentDidUpdate() { this.publish(); }
  componentWillUnmount() { clearInterval(this.timer); this.started = false; for (const [type, fn] of this.windowEvents()) window.removeEventListener(type, fn); }
  windowEvents() { return [['pointermove', this.onMove], ['pointerup', this.onUp], ['pointercancel', this.onUp], ['keydown', this.onKeyDown], ['keyup', this.onKeyUp], ['blur', this.onBlur]]; }

  run(fn) { return () => { fn(); this.refresh(); }; }
  refresh() { this.shown = this.stamp; this.forceUpdate(); }
  // everything the panel depends on: when it changes, the panel is drawn again (the clock's numbers ten times a second)
  get stamp() { const s = this.sim; return s.rev + '|' + Math.floor(s.t * 10) + '|' + (s.result ? s.result.pct : '') + '|' + (s.driving ? Math.round(s.driver.cmd * 100) + ',' + (s.liveScore ? s.liveScore.pct : '') : ''); }

  setCanvas = (el) => { if (el === this.canvas) return; this.canvas = el; if (!el) return; el.dataset.obResponsive = '1'; if (el.style.maxWidth) el.style.removeProperty('max-width'); this.ctx = el.getContext('2d');
    el.addEventListener('pointerdown', this.onDown); el.addEventListener('pointermove', this.onHover);
    if (!this.started) { this.started = true; for (const [type, fn] of this.windowEvents()) window.addEventListener(type, fn); this.timer = setInterval(() => this.frame(), 1000 / 60); }
    this.sim.dirty = true; this.frame(); };
  // The canvas (the track and three graphs) is as tall as the window allows: the whole column, with the clock and
  // the notes under it, fits on the screen. Between 430 px (the graphs need room) and 680 px, and no taller than it is wide.
  obResize() { const c = this.canvas; if (!c) return false; if (c.style.maxWidth) c.style.removeProperty('max-width'); const dpr = window.devicePixelRatio || 1, w = Math.round(c.clientWidth) || 600;
    let h = Math.round(c.clientHeight) || 540; const want = this.fitHeight(c, h, w); if (want && Math.abs(want - h) > 2) { c.style.height = want + 'px'; h = Math.round(c.clientHeight) || want; }
    let changed = w !== this._cw || h !== this._ch || dpr !== this.dpr; this._cw = w; this._ch = h; this.dpr = dpr;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); changed = true; }
    return changed; }
  // what the canvas's height should be so that the bottom of its column (and whatever the page puts under the row) meets the window's bottom
  fitHeight(c, h, w) { try { const col = c.closest('[data-ml-col]') || c.parentElement.parentElement, row = col.parentElement, doc = document.documentElement, y = window.scrollY || 0;
      let bottom = 0; for (const k of col.children) bottom = Math.max(bottom, k.getBoundingClientRect().bottom); bottom += parseFloat(getComputedStyle(col).paddingBottom) || 0;
      const tail = Math.max(0, doc.scrollHeight - (row.getBoundingClientRect().bottom + y)), room = (window.innerHeight || 800) - tail - (bottom + y) - 1;
      return Math.round(clamp(h + room, 430, Math.min(680, Math.max(430, w * 1.05)))); } catch (e) { return null; } }
  frame() { const s = this.sim; if (!this.ctx) return; const now = typeof performance !== 'undefined' ? performance.now() : Date.now(), dt = this.lastT ? (now - this.lastT) / 1000 : 0; this.lastT = now;
    if (this.obResize()) s.dirty = true; s.tick(Math.min(dt, 0.1));
    if (s.dirty) this.draw(); if (this.stamp !== this.shown) this.refresh(); }
  draw() { const g = this.ctx, s = this.sim; s.dirty = false; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.renderer.draw(g, s, this._cw, this._ch); }

  // ---- pointer: on the track, drag the cart; on the graph being sketched, draw; elsewhere on the graphs, scrub ----
  local(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  what(p) { const s = this.sim, R = this.renderer, G = R.graphs;
    if (p.y < Renderer.TRK) return s.driving && (!s.rec.length || s.playing) ? 'cart' : null;
    const row = G.rowAt(p.y); if (!row || p.x < G.area.x0 - 6 || p.x > G.area.x1 + 6) return null;
    if (s.sketching && !s.checked && row.k === s.sketchOf) return 'pen'; return s.canSeek ? 'scrub' : null; }
  onDown = (e) => { if (e.button !== 0 || !this.canvas) return; const p = this.local(e), w = this.what(p), s = this.sim, G = this.renderer.graphs; if (!w) return; e.preventDefault(); try { this.canvas.setPointerCapture(e.pointerId); } catch (err) {}
    this.mode = w; if (w === 'cart') s.dragTo(this.renderer.worldX(p.x)); else if (w === 'pen') { const row = G.rowAt(p.y); this.penRow = row; s.pen(G.timeAt(p.x), G.valAt(row, p.y), true); } else s.seek(G.timeAt(p.x)); this.refresh(); };
  onMove = (e) => { if (!this.mode || !this.canvas) return; const p = this.local(e), s = this.sim, G = this.renderer.graphs;
    if (this.mode === 'cart') s.dragTo(this.renderer.worldX(p.x)); else if (this.mode === 'pen') s.pen(G.timeAt(p.x), G.valAt(this.penRow, p.y)); else { s.seek(G.timeAt(p.x)); this.refresh(); } };
  onUp = () => { if (!this.mode) return; if (this.mode === 'cart') this.sim.release(); if (this.mode === 'pen') this.sim.penUp(); this.mode = null; this.sim.bump(); this.refresh(); };
  onHover = (e) => { if (this.mode || !this.canvas) return; const w = this.what(this.local(e)), c = w === 'cart' ? 'grab' : w === 'pen' ? 'crosshair' : w === 'scrub' ? 'ew-resize' : 'default'; if (this.canvas.style.cursor !== c) this.canvas.style.cursor = c; };

  get overlayOpen() { const s = this.state; return s.showShare || s.showInfo || s.showBug; }
  onKeyDown = (e) => { const tag = (e.target && e.target.tagName) || '', key = e.key, s = this.sim;
    if (this.overlayOpen) { if (key === 'Escape') this.setState({ showShare: false, showInfo: false, showBug: false }); return; }
    if (tag === 'INPUT' && e.target.type !== 'range' || tag === 'TEXTAREA' || tag === 'SELECT') { if (key === 'Enter' && e.target.blur) e.target.blur(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (key === ' ' && tag !== 'BUTTON') { e.preventDefault(); s.toggle(); this.refresh(); }
    else if (s.driving && (key === 'ArrowRight' || key === 'ArrowLeft')) { e.preventDefault(); s.driver.drag = null; s.driver.keys = key === 'ArrowRight' ? 1 : -1; }
    else if (s.driving && key === 'ArrowDown') { e.preventDefault(); s.stopCart(); this.refresh(); }
    else if (key === 'Escape' && (this.state.menuOpen || this.state.openMenu)) this.setState({ menuOpen: false, openMenu: null }); };
  onKeyUp = (e) => { const s = this.sim; if ((e.key === 'ArrowRight' && s.driver.keys > 0) || (e.key === 'ArrowLeft' && s.driver.keys < 0)) { s.driver.keys = 0; this.refresh(); } };
  onBlur = () => { this.sim.driver.keys = 0; };

  publish() { try { const s = this.sim, snap = s.snapshot(); window.simState = { sim: 'motion-lab', ...snap };
    window.simAPI = { get: () => s.snapshot(), set: () => {}, preset: (k) => { const ok = s.choose(k); this.refresh(); return ok; }, share: () => Link.url(s) };
    if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'sim-state', sim: 'motion-lab', ...snap }, '*'); } catch (e) {} }

  copyShare() { const url = Link.url(this.sim), done = () => this.setState({ shareCopied: true });
    try { const r = navigator.clipboard && navigator.clipboard.writeText(url); if (r && r.then) r.then(done, done); else done(); } catch (e) { done(); } }

  submitBug() { const st = this.state, text = (st.bugText || '').trim(); if (text.length < 3) { this.setState({ bugResult: 'err:Please describe the problem first.' }); return; } if (st.bugSending) return;
    this.setState({ bugSending: true, bugResult: '' });
    const payload = { sim: 'motion-lab', text: text.slice(0, 4000), email: (st.bugEmail || '').trim().slice(0, 200), pageUrl: location.href, userAgent: navigator.userAgent, simState: window.simState || null, website: '' };
    fetch('https://sims-api.sethhopper.com/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then((r) => r.json().catch(() => ({})).then((j) => ({ ok: r.ok, j })))
      .then((res) => { if (res.ok && res.j && res.j.ok) this.setState({ bugSending: false, bugResult: 'ok:Thanks — your report was filed.', bugText: '' });
        else this.setState({ bugSending: false, bugResult: 'err:Could not send' + (res.j && res.j.error ? ' (' + res.j.error + ')' : '') + '. Please try again later.' }); })
      .catch(() => this.setState({ bugSending: false, bugResult: 'err:Network error — please try again.' })); }
}
