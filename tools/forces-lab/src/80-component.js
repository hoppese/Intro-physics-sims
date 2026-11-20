// =====================================================================
// Component -- the page's controller, and deliberately thin. It owns the
// canvas and the frame tick, turns browser events into calls on the
// PointerTool and the Workbench, and asks the Renderer and the Panel to show
// the result, and runs the clock from the frame tick. No physics here.
// =====================================================================
class Component extends DCLogic {
  state = { menuOpen: false, addOpen: false, presetsOpen: false, viewOpen: false, showInfo: false, showShare: false, shareCopied: false, shareHide: false,
    showBug: false, bugText: '', bugEmail: '', bugSending: false, bugResult: '', draft: null };
  big = false;
  _obBig = /[?&]big=1(&|$)/.test((typeof location !== 'undefined' && location.search) || '');
  bench = new Workbench();
  tool = new PointerTool(this.bench);
  renderer = new Renderer();
  graphs = new Graphs();
  panel = new Panel(this);
  shown = '';            // what the side panel last showed (see `stamp`)
  live = false;          // something on the canvas is changing by itself (a notice fading)

  renderVals() { return this.panel.all(); }

  // ---- lifecycle ----
  componentDidMount() { window.__forcesLab = this; const b = this.bench, link = ShareLink.read(), scene = ShareLink.scene(link);
    // (the bundle's template has no <title>: without this the browser tab shows the bare address)
    if (!document.title) document.title = 'Forces Lab';
    // (a preset by name goes through loadPreset, which also frames the view the preset asks for)
    if (!(link.lab && scene) && link.preset && PRESET(link.preset)) b.loadPreset(link.preset); else if (scene) b.replace(scene); else b.loadPreset('incline');
    if (link.hide) b.hide(true);
    b.history.clear(); this.publish(); this.refresh(); }
  componentDidUpdate() { this.publish(); }
  componentWillUnmount() { clearInterval(this.timer); this.started = false; for (const [type, fn] of this.windowEvents()) window.removeEventListener(type, fn); }
  windowEvents() { return [['pointermove', this.onMove], ['pointerup', this.onUp], ['pointercancel', this.onUp], ['keydown', this.onKeyDown], ['blur', this.onWindowBlur]]; }

  // run something from a button, then show the result
  run(fn) { return () => { fn(); this.refresh(); }; }
  refresh() { this.shown = this.stamp; this.forceUpdate(); }
  // everything the side panel depends on, in one string: when it changes, the panel is drawn again
  get stamp() { const b = this.bench, h = b.history; return b.rev + '|' + b.selId + '|' + b.view.percent + '|' + (b.hidden ? 1 : 0) + '|' + h.past.length + '|' + h.future.length + '|' + Math.floor(b.time * 8); }

  // ---- canvas ----
  setCanvas = (el) => { if (el === this.canvas) return; this.canvas = el; if (!el) return;
    el.dataset.obResponsive = '1'; this.ctx = el.getContext('2d');
    el.addEventListener('pointerdown', this.onDown); el.addEventListener('wheel', this.onWheel, { passive: false }); el.addEventListener('mousedown', this.onMouseDown);
    el.addEventListener('pointerleave', this.onLeave);
    if (!this.started) { this.started = true; for (const [type, fn] of this.windowEvents()) window.addEventListener(type, fn); this.timer = setInterval(() => this.frame(), 1000 / 60); }
    this.bench.dirty = true; this.frame(); };
  // keep the drawing buffer matched to the canvas's size on the page (taller in ?big=1); true if it changed
  obResize() { const c = this.canvas; if (!c) return false; const dpr = window.devicePixelRatio || 1;
    if (this._obBig) { const wNow = Math.round(c.clientWidth) || 560, th = Math.round(Math.max(400, Math.min(wNow * 0.62, (window.innerHeight || 820) - 210))); if (c.style.height !== th + 'px') c.style.height = th + 'px'; }
    const w = Math.round(c.clientWidth) || 560, h = Math.round(c.clientHeight) || 400; let changed = w !== this._cw || h !== this._ch || dpr !== this.dpr; this._cw = w; this._ch = h; this.dpr = dpr;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); changed = true; }
    return changed; }

  // ---- the frame tick: draw when something has changed, and let the side panel catch up ----
  frame() { const b = this.bench; if (!this.ctx) return; const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()), dt = this.lastT ? (now - this.lastT) / 1000 : 0; this.lastT = now;
    if (this.obResize()) b.dirty = true;
    if (!this.tool.busy) b.tick(Math.min(dt, 0.1));
    if (b.dirty || this.live) this.draw();
    // (while something is being dragged the panel follows every third frame: the canvas is what the eye is on)
    if (this.stamp !== this.shown && (!this.tool.busy || (this.ticks = (this.ticks || 0) + 1) % 3 === 0)) this.refresh(); }

  // (changes no state but the view, which follows the canvas's size)
  draw() { const g = this.ctx, b = this.bench; if (!g) return;
    if (b.view.resize(this._cw, this._ch) && b.view.auto) b.fit();
    b.dirty = false; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.live = this.renderer.draw(g, b, this.tool);
    const cur = this.tool.cursor; if (this.canvas.style.cursor !== cur) this.canvas.style.cursor = cur;
    this.drawGraphs(); }

  // ---- the graphs under the bench: drawn with the bench; pressing or dragging on them moves the bench to that moment ----
  setGraph = (el) => { if (el === this.gcanvas) return; this.gcanvas = el; this.gctx = el ? el.getContext('2d') : null; if (!el) return;
    // (like the bench's canvas, it sizes itself: the page's 560 px cap on canvases is not for it)
    el.dataset.obResponsive = '1'; if (el.style.maxWidth) el.style.removeProperty('max-width');
    el.addEventListener('pointerdown', this.onGraphDown); el.addEventListener('pointermove', this.onGraphMove); el.addEventListener('pointerup', this.onGraphUp); el.addEventListener('pointercancel', this.onGraphUp);
    this.bench.dirty = true; };
  drawGraphs() { const c = this.gcanvas, g = this.gctx, b = this.bench; if (!c || !g || !b.graph) return; if (c.style.maxWidth) c.style.removeProperty('max-width'); const dpr = window.devicePixelRatio || 1, w = Math.round(c.clientWidth) || 560, h = Graphs.H;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); this.graphs.draw(g, b, w, h); }
  graphTime(e) { const r = this.gcanvas.getBoundingClientRect(); return this.graphs.timeAt(e.clientX - r.left); }
  onGraphDown = (e) => { const t = this.graphTime(e); if (t == null) return; e.preventDefault(); this.scrubbing = true; try { this.gcanvas.setPointerCapture(e.pointerId); } catch (err) {} this.bench.seek(t); this.refresh(); };
  onGraphMove = (e) => { if (!this.scrubbing) return; const t = this.graphTime(e); if (t != null) { this.bench.seek(t); this.refresh(); } };
  onGraphUp = () => { this.scrubbing = false; };

  // ---- pointer ----
  at(e) { const r = this.canvas.getBoundingClientRect(), v = this.bench.view, sx = (e.clientX - r.left) * (this._cw / (r.width || this._cw)), sy = (e.clientY - r.top) * (this._ch / (r.height || this._ch));
    return { sx, sy, ...v.toWorld(sx, sy), coarse: e.pointerType === 'touch', shift: !!e.shiftKey }; }
  onMouseDown = (e) => { if (e.button === 1) e.preventDefault(); };      // no auto-scroll on a middle-button press
  onDown = (e) => { if (e.button !== 0 && e.button !== 1) return; e.preventDefault();
    const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur();     // commits a value being typed
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) {}
    if (e.pointerType === 'touch') this.tool.touchDown(e.pointerId, this.at(e)); else this.tool.down(this.at(e));
    this.bench.dirty = true; };
  onMove = (e) => { if (!this.canvas) return; if (e.pointerType === 'touch') { this.tool.touchMove(e.pointerId, this.at(e)); return; }
    if (this.tool.busy || e.target === this.canvas) this.tool.move(this.at(e)); };
  onUp = (e) => { if (!this.canvas) return; if (e.pointerType === 'touch') { this.tool.touchUp(e.pointerId, this.at(e), e.type === 'pointercancel'); return; }
    if (!this.tool.busy) return; if (e.type === 'pointercancel') this.tool.cancel(); else this.tool.up(this.at(e)); this.bench.dirty = true; };
  onLeave = (e) => { if (e.pointerType !== 'touch' && !this.tool.busy) this.tool.leave(); };
  // The wheel zooms -- except inside a frame (a Moodle page), where a plain wheel
  // has to stay the page's scroll: there only a pinch or Ctrl/Cmd+wheel zooms.
  get framed() { try { return window.self !== window.top; } catch (err) { return true; } }
  onWheel = (e) => { if (this.framed && !e.ctrlKey && !e.metaKey) return; e.preventDefault(); const p = this.at(e);
    this.bench.view.zoomAbout(p.sx, p.sy, Math.exp(e.ctrlKey ? -Math.max(-25, Math.min(25, e.deltaY)) * 0.01 : -e.deltaY * 0.0015));
    // (the bench has moved under a pointer that has not: the hover goes to whatever is under it now)
    if (!this.tool.busy) this.tool.move(this.at(e)); this.bench.dirty = true; };
  onWindowBlur = () => { this.tool.reset(); };

  // ---- keyboard ----
  get overlayOpen() { const s = this.state; return s.showShare || s.showInfo || s.showBug; }
  get menuOpen() { const s = this.state; return s.menuOpen || s.addOpen || s.presetsOpen || s.viewOpen; }
  onKeyDown = (e) => { const b = this.bench, tag = (e.target && e.target.tagName) || '', key = e.key, mod = e.metaKey || e.ctrlKey;
    // a dialog owns the keyboard: Escape closes it wherever the focus is (its link box, its tick box, the report text)
    if (this.overlayOpen) { if (key === 'Escape') this.setState({ showShare: false, showInfo: false, showBug: false }); return; }
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if (tag === 'INPUT' && e.target.type === 'number') { if (key === 'Enter') e.target.blur(); else if (key === 'Escape') { this.endField(true); e.target.blur(); } }
      return; }
    const done = () => { e.preventDefault(); b.dirty = true; };
    if (mod) { const k = key.toLowerCase(); if (k === 'z') { if (e.shiftKey) b.redo(); else b.undo(); done(); } else if (k === 'y') { b.redo(); done(); } return; }
    if (e.altKey) return;
    if (key === ' ' && tag !== 'BUTTON') { b.toggle(); done(); this.refresh(); return; }
    if (key === 'Escape') { if (!this.tool.cancel()) { if (this.menuOpen) this.setState({ menuOpen: false, addOpen: false, presetsOpen: false, viewOpen: false }); else if (b.measure.angleOn && b.measure.fresh().length) { b.measure.lines = []; b.dirty = true; } else if (b.measure.angleOn) b.toggleAngle(); else b.select(null); } return done(); }
    if (!b.selected || this.tool.busy) return;
    const step = e.shiftKey ? 0.01 : 0.05;
    if (key === 'Delete' || key === 'Backspace') { b.remove(); done(); }
    else if (key === 'ArrowUp') { b.nudge(0, step); done(); } else if (key === 'ArrowDown') { b.nudge(0, -step); done(); }
    else if (key === 'ArrowLeft') { b.nudge(-step, 0); done(); } else if (key === 'ArrowRight') { b.nudge(step, 0); done(); }
    else if (key === 'r' || key === 'R') { b.rotate(e.shiftKey ? -15 : 15); done(); }
    else if (key === 'd' || key === 'D') { b.duplicate(); done(); } };

  // ---- typed values: the box shows what was typed, the element follows along ----
  typeField(field, text) { const el = this.bench.selected; if (!el) return; this.bench.type(field, parseFloat(text)); this.setState({ draft: { id: el.id, field, text } }); }
  endField(cancel) { this.bench.endTyping(!!cancel); this.setState({ draft: null }); }

  // ---- what the page tells the outside world ----
  publish() { try { const b = this.bench, snap = b.snapshot(); window.simState = { sim: 'forces-lab', ...snap };
    window.simAPI = { get: () => b.snapshot(), set: () => {}, hideValues: (on) => { b.hide(on); this.refresh(); }, preset: (key) => { const ok = b.loadPreset(key); this.refresh(); return ok; },
      share: () => ShareLink.url(b.scene, b.hidden) };
    if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'sim-state', sim: 'forces-lab', ...snap }, '*'); } catch (e) {} }

  copyShare() { const url = ShareLink.url(this.bench.scene, this.state.shareHide), done = () => this.setState({ shareCopied: true });
    try { const r = navigator.clipboard && navigator.clipboard.writeText(url); if (r && r.then) r.then(done, done); else done(); } catch (e) { done(); } }

  submitBug() { const st = this.state, text = (st.bugText || '').trim(); if (text.length < 3) { this.setState({ bugResult: 'err:Please describe the problem first.' }); return; } if (st.bugSending) return;
    this.setState({ bugSending: true, bugResult: '' });
    const payload = { sim: 'forces-lab', text: text.slice(0, 4000), email: (st.bugEmail || '').trim().slice(0, 200), pageUrl: location.href, userAgent: navigator.userAgent, simState: window.simState || null, website: '' };
    fetch('https://sims-api.sethhopper.com/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then((r) => r.json().catch(() => ({})).then((j) => ({ ok: r.ok, j })))
      .then((res) => { if (res.ok && res.j && res.j.ok) this.setState({ bugSending: false, bugResult: 'ok:Thanks — your report was filed.', bugText: '' });
        else this.setState({ bugSending: false, bugResult: 'err:Could not send' + (res.j && res.j.error ? ' (' + res.j.error + ')' : '') + '. Please try again later.' }); })
      .catch(() => this.setState({ bugSending: false, bugResult: 'err:Network error — please try again.' })); }
}
