// =====================================================================
// Component -- the page's controller, and deliberately thin. It owns the
// canvas and the clock tick, turns browser events into calls on the
// PointerTool and the Workbench, and asks the Renderer and the Panel to show
// the result. Nothing about circuits is decided here.
// =====================================================================
class Component extends DCLogic {
  state = { hide: false, peek: {}, menuOpen: false, addOpen: false, presetOpen: false, showShare: false, shareCopied: false, shareHide: false, showInfo: false, showExample: false, showSol: false,
    showBug: false, bugText: '', bugEmail: '', bugSending: false, bugResult: '', draft: null };
  big = false;
  _obBig = /[?&]big=1(&|$)/.test((typeof location !== 'undefined' && location.search) || '');
  bench = new Workbench();
  tool = new PointerTool(this.bench);
  renderer = new Renderer();
  graphs = new GraphPainter();
  example = new WorkedExample('series');
  panel = new Panel(this);
  dirty = false;

  renderVals() { return this.panel.all(); }

  // ---- lifecycle ----
  componentDidMount() { window.__circuitLab = this; const b = this.bench, link = ShareLink.read(); let loaded = false;
    if (link) { try { const c = Circuit.decode(link.net, Workbench.NC, Workbench.NR); if (!c.isEmpty) { b.replace(c); loaded = true; if (link.hide) this.setState({ hide: true }); } } catch (e) {} }
    if (!loaded) b.loadPreset('series');
    b.history.clear(); this.publish(); this.forceUpdate(); }
  componentDidUpdate() { this.publish(); }
  componentWillUnmount() { clearInterval(this.timer); this.started = false; for (const [type, fn] of this.windowEvents()) window.removeEventListener(type, fn); }
  windowEvents() { return [['pointermove', this.onMove], ['pointerup', this.onUp], ['pointercancel', this.onUp], ['keydown', this.onKeyDown], ['keyup', this.onKeyUp], ['blur', this.onWindowBlur]]; }

  // run something from a button, then show the result
  run(fn) { return () => { fn(); this.refresh(); }; }
  refresh() { this.dirty = false; this.forceUpdate(); }

  // ---- canvases ----
  setCanvas = (el) => { if (el === this.canvas) return; this.canvas = el; if (!el) return;
    el.dataset.obResponsive = '1'; this.ctx = el.getContext('2d');
    el.addEventListener('pointerdown', this.onDown); el.addEventListener('wheel', this.onWheel, { passive: false }); el.addEventListener('mousedown', this.onMouseDown);
    if (!this.started) { this.started = true; for (const [type, fn] of this.windowEvents()) window.addEventListener(type, fn); this.last = performance.now(); this.timer = setInterval(() => this.frame(), 1000 / 60); }
    this.draw(); };
  setGraphCanvas = (el) => { this.gcanvas = el; this.gctx = null; if (!el) return; const dpr = window.devicePixelRatio || 1; el.width = GraphPainter.W * dpr; el.height = GraphPainter.H * dpr; this.gctx = el.getContext('2d'); };
  // keep the drawing buffer matched to the canvas's size on the page (taller in ?big=1)
  obResize() { const c = this.canvas; if (!c) return; const dpr = window.devicePixelRatio || 1;
    if (this._obBig) { const wNow = Math.round(c.clientWidth) || 560, th = Math.round(Math.max(400, Math.min(wNow * 0.62, (window.innerHeight || 820) - 210))); if (c.style.height !== th + 'px') c.style.height = th + 'px'; }
    const w = Math.round(c.clientWidth) || 560, h = Math.round(c.clientHeight) || 400; this._cw = w; this._ch = h;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    this.dpr = dpr; }

  // ---- the clock ----
  frame() { const now = performance.now(), dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000)); this.last = now; const sim = this.bench.sim;
    const moved = sim.advance(dt); if (!sim.timed || sim.playing) this.renderer.advance(dt, this.bench.circuit, sim.sol);
    if (moved && (this.ticks = (this.ticks || 0) + 1) % 4 === 0) this.dirty = true;
    this.draw(); if (this.dirty) this.refresh(); }

  // ---- drawing (changes no state but the view, which follows the canvas's size) ----
  draw() { const g = this.ctx, b = this.bench; if (!g) return; this.obResize();
    if (b.view.resize(this._cw, this._ch)) { if (b.view.auto) b.fit(); this.dirty = true; }      // dirty: the zoom read-out has to follow
    const now = Date.now(), st = this.state, fade = (x) => Math.max(0, Math.min(1, x));
    const life = b.notice ? 2600 + 35 * Math.max(0, b.notice.text.length - 40) : 0;      // longer notices stay up longer
    if (b.notice && now - b.notice.at > life) b.notice = null; if (b.flash && now - b.flash.at > 700) b.flash = null;
    const scene = { circuit: b.circuit, view: b.view, sol: b.sol, dpr: this.dpr, names: b.circuit.labels(), selId: b.selId, hide: !!st.hide, revealed: (id) => !!st.peek[id], flowing: true,
      probe: b.probe, probeV: b.probeV,
      message: b.notice ? { text: b.notice.text, bad: b.notice.bad, alpha: fade((life - (now - b.notice.at)) / 400) } : null,
      flash: b.flash ? { segs: b.flash.segs, alpha: fade(1 - (now - b.flash.at) / 700) } : null };
    this.tool.decorate(scene); this.renderer.draw(g, scene);
    const cur = this.tool.cursor; if (this.canvas.style.cursor !== cur) this.canvas.style.cursor = cur;
    if (this.gctx && b.sim.graphing) this.graphs.draw(this.gctx, { dpr: window.devicePixelRatio || 1, t: b.sim.t, origin: b.sim.origin,
      meters: b.circuit.ofType(Meter).filter((m) => m.graph).map((el) => ({ el, name: (scene.names.get(el.id) || {}).text || '', shown: !st.hide || !!st.peek[el.id] })) }); }

  // ---- pointer ----
  at(e) { const r = this.canvas.getBoundingClientRect(), v = this.bench.view, sx = (e.clientX - r.left) * (v.w / (r.width || v.w)), sy = (e.clientY - r.top) * (v.h / (r.height || v.h)); return { sx, sy, ...v.toWorld(sx, sy), coarse: e.pointerType === 'touch' }; }
  onMouseDown = (e) => { if (e.button === 1) e.preventDefault(); };      // no auto-scroll on a middle-button pan
  onDown = (e) => { if (e.button !== 0 && e.button !== 1) return; e.preventDefault();
    const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur();     // commits a value being typed
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) {}
    if (e.pointerType === 'touch') this.tool.touchDown(e.pointerId, this.at(e), e.isPrimary); else this.tool.down(this.at(e), e.button === 1 || this.tool.space);
    this.dirty = true; };
  onMove = (e) => { if (!this.canvas) return; if (e.pointerType === 'touch') { if (this.tool.touchMove(e.pointerId, this.at(e))) this.dirty = true; return; }
    if (this.tool.gesture) { this.tool.move(this.at(e)); this.dirty = true; } else if (e.target === this.canvas) this.tool.move(this.at(e)); else this.tool.leave(); };
  onUp = (e) => { if (!this.canvas) return; if (e.pointerType === 'touch') { if (this.tool.touchUp(e.pointerId, this.at(e), e.type === 'pointercancel')) this.dirty = true; return; }
    if (!this.tool.gesture) return; if (e.type === 'pointercancel') this.tool.cancel(); else this.tool.up(this.at(e)); this.dirty = true; };
  // The wheel zooms -- except inside a frame (a Moodle page), where a plain wheel
  // has to stay the page's scroll: there only a pinch or Ctrl/Cmd+wheel zooms.
  get framed() { try { return window.self !== window.top; } catch (err) { return true; } }
  onWheel = (e) => { if (this.framed && !e.ctrlKey && !e.metaKey) return; e.preventDefault(); const p = this.at(e); this.bench.view.zoomAbout(p.sx, p.sy, Math.exp(e.ctrlKey ? -Math.max(-25, Math.min(25, e.deltaY)) * 0.01 : -e.deltaY * 0.0015)); this.dirty = true; };
  onWindowBlur = () => { this.tool.space = false; this.tool.touches.clear(); };

  // ---- keyboard ----
  get overlayOpen() { const s = this.state; return s.showShare || s.showInfo || s.showExample || s.showBug; }
  onKeyUp = (e) => { if (e.code === 'Space') this.tool.space = false; };
  onKeyDown = (e) => { const b = this.bench, tag = (e.target && e.target.tagName) || '', key = e.key, mod = e.metaKey || e.ctrlKey;
    // a dialog owns the keyboard: Escape closes it wherever the focus is (its link box, its tick box, the report text)
    if (this.overlayOpen) { if (key === 'Escape') this.setState({ showShare: false, showInfo: false, showExample: false, showBug: false }); return; }
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if (tag === 'INPUT' && e.target.type === 'number') { if (key === 'Enter') e.target.blur(); else if (key === 'Escape') { this.endField(true); e.target.blur(); } }
      return; }
    const done = () => { e.preventDefault(); this.dirty = true; };
    if (mod) { const k = key.toLowerCase(); if (k === 'z') { if (e.shiftKey) b.redo(); else b.undo(); done(); } else if (k === 'y') { b.redo(); done(); } return; }
    if (e.altKey) return;
    if (e.code === 'Space') { if (tag !== 'BUTTON') { this.tool.space = true; e.preventDefault(); } return; }
    if (key === 'Escape') { if (!this.tool.cancel()) { if (this.state.menuOpen || this.state.addOpen || this.state.presetOpen) this.setState({ menuOpen: false, addOpen: false, presetOpen: false }); else { b.select(null); b.probe = null; } } return done(); }
    if (!b.selected || this.tool.gesture) return;
    if (key === 'Delete' || key === 'Backspace') { b.remove(); done(); }
    else if (key === 'ArrowUp') { b.nudge(0, -1); done(); } else if (key === 'ArrowDown') { b.nudge(0, 1); done(); }
    else if (key === 'ArrowLeft') { b.nudge(-1, 0); done(); } else if (key === 'ArrowRight') { b.nudge(1, 0); done(); }
    else if (key === 'r' || key === 'R') { b.rotate(e.shiftKey ? -1 : 1); done(); }
    else if (key === 'f' || key === 'F') { b.flip(); done(); } };

  // ---- typed values: the box shows what was typed, the part follows along ----
  typeField(field, text) { const el = this.bench.selected; if (!el) return; this.bench.type(field, parseFloat(text)); this.setState({ draft: { id: el.id, field, text } }); }
  endField(cancel) { this.bench.endTyping(!!cancel); this.setState({ draft: null }); }

  // ---- what the page tells the outside world ----
  snapshot() { const b = this.bench, c = b.circuit, sol = b.sol, names = c.labels(), label = (e) => (names.get(e.id) || {}).text, r = (x, d) => (isFinite(x) ? +x.toFixed(d) : 0), I = (e) => (sol ? r(sol.current(e), 4) : 0);
    return { net: c.encode(), transient: c.reactive, t: +b.sim.shown.toFixed(3),
      resistors: c.ofType(Resistor).map((e) => ({ label: label(e), R: e.value, I: I(e) })),
      capacitors: c.ofType(Capacitor).map((e) => ({ label: label(e), C_mF: e.value, Vc: r(e.vc, 3), Q_mC: r(e.charge * 1000, 3), I: I(e) })),
      inductors: c.ofType(Inductor).map((e) => ({ label: label(e), L_H: e.value, Il: r(e.il, 4) })),
      switches: c.ofType(Switch).map((e) => ({ label: label(e), closed: e.closed })).concat(c.ofType(ThrowSwitch).map((e) => ({ label: label(e), closed: true, position: e.position }))),
      meters: c.ofType(Meter).map((m) => { const v = sol ? m.number(sol) : NaN; return { label: label(m), type: m.type, value: isFinite(v) ? +v.toFixed(m instanceof Voltmeter ? 3 : 4) : null }; }),
      solved: !!(sol && sol.solved) }; }
  publish() { try { const snap = this.snapshot(), sim = this.bench.sim; window.simState = { sim: 'circuit-lab', ...snap };
    window.simAPI = { get: () => this.snapshot(), set: () => {}, hideValues: (on) => this.setState({ hide: !!on, peek: {} }), play: (on) => { sim.playing = on !== false; this.refresh(); }, reset: () => { sim.reset(); this.refresh(); },
      share: () => ShareLink.url(this.bench.circuit, this.state.hide) };
    if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'sim-state', sim: 'circuit-lab', ...snap }, '*'); } catch (e) {} }

  copyShare() { const url = ShareLink.url(this.bench.circuit, this.state.shareHide), done = () => this.setState({ shareCopied: true });
    try { const r = navigator.clipboard && navigator.clipboard.writeText(url); if (r && r.then) r.then(done, done); else done(); } catch (e) { done(); } }

  submitBug() { const st = this.state, text = (st.bugText || '').trim(); if (text.length < 3) { this.setState({ bugResult: 'err:Please describe the problem first.' }); return; } if (st.bugSending) return;
    this.setState({ bugSending: true, bugResult: '' });
    const payload = { sim: 'circuit-lab', text: text.slice(0, 4000), email: (st.bugEmail || '').trim().slice(0, 200), pageUrl: location.href, userAgent: navigator.userAgent, simState: window.simState || null, website: '' };
    fetch('https://sims-api.sethhopper.com/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then((r) => r.json().catch(() => ({})).then((j) => ({ ok: r.ok, j })))
      .then((res) => { if (res.ok && res.j && res.j.ok) this.setState({ bugSending: false, bugResult: 'ok:Thanks — your report was filed.', bugText: '' });
        else this.setState({ bugSending: false, bugResult: 'err:Could not send' + (res.j && res.j.error ? ' (' + res.j.error + ')' : '') + '. Please try again later.' }); })
      .catch(() => this.setState({ bugSending: false, bugResult: 'err:Network error — please try again.' })); }
}
