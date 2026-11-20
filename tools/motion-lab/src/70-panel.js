// =====================================================================
// Panel -- the page around the canvas: the activities, each one's settings
// (targets to match, the two cars, the pieces of a program, the motion-diagram
// cases), the worked numbers (when and where the cars meet; each piece's Δx and
// final v_x; the signs of v_x and a_x), the clock and toolbar, the throttle, and
// the overlays. It reads the Sim and calls back into the app; it never changes the
// physics itself.
// =====================================================================
const UI = {
  chip: (on) => "font-family:'Source Sans 3',sans-serif;font-size:11px;font-weight:600;padding:4px 10px;border-radius:999px;cursor:pointer;border:1px solid " + (on ? '#bf8a1e' : '#d7dbe0') + ';background:' + (on ? '#f6f0db' : '#fff') + ';color:' + (on ? '#7a5a12' : '#525a63') + ';',
  pick: (on) => "display:flex;align-items:center;gap:9px;width:100%;font-family:'Source Sans 3',sans-serif;font-size:12.5px;font-weight:600;padding:7px 10px;border-radius:8px;cursor:pointer;text-align:left;border:1px solid " + (on ? '#bf8a1e' : '#e4e8ec') + ';background:' + (on ? '#f6f0db' : '#fff') + ';color:' + (on ? '#6b4f10' : '#3a414a') + ';',
  tool: (on) => 'font-size:11px;font-weight:700;height:26px;padding:0 9px;display:flex;align-items:center;gap:3px;border-radius:6px;cursor:pointer;white-space:nowrap;border:1px solid ' + (on ? '#bf8a1e' : '#d7dbe0') + ';background:' + (on ? '#f6f0db' : '#fff') + ';color:' + (on ? '#7a5a12' : '#3a414a') + ';',
  sq: 'font-size:12px;font-weight:700;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:6px;cursor:pointer;border:1px solid #d7dbe0;background:#fff;color:#3a414a;',
  act: (kind) => "font-family:'Source Sans 3',sans-serif;font-size:12px;font-weight:700;padding:4px 11px;border-radius:8px;cursor:pointer;border:1px solid " + (kind === 'go' ? '#2f8f56;background:#e9f6ee;color:#226b40;' : kind === 'warn' ? '#d7a8a8;background:#fbefef;color:#93343c;' : '#d7dbe0;background:#fff;color:#3a414a;'),
};

class Panel {
  static NOTES = {
    match: { drive: 'Drive the cart so its graph follows the gold target: press ▶ Run, then drag the cart along the track (as if walking in front of a motion sensor; let go and it stops), or use the throttle and the arrow keys. The score compares your graph with the target over the 10 s.',
      sketch: 'Watch the cart move (▶ Run; drag along the graphs to replay any moment), then draw its graph by pressing and dragging on the graph marked for it. Check shows the real graph and how close you were.' },
    cars: 'Each car keeps its acceleration, except that a braking car (aₓ opposite to vₓ) slows to a stop and stays there: nothing pushes it backward. A car starting from rest with aₓ ≠ 0 speeds up. Where the x–t graphs cross, the cars meet.',
    program: 'Build the motion from pieces: of constant acceleration (in each, vₓ changes by aₓ Δt, the area under a–t), or of constant velocity (in each, x changes by vₓ Δt, the area under v–t). The other graphs follow.',
    diagram: 'A dot every 0.5 s: dots far apart mean fast. When vₓ and aₓ have the same sign it speeds up; opposite signs, it slows down. At a turning point vₓ = 0, but aₓ is not.' };
  static TEX = { x: 'x', v: 'v_x', a: 'a_x' };

  constructor(app) { this.app = app; }
  get sim() { return this.app.sim; }
  get ui() { return this.app.state; }
  all() { return { ...this.header(), ...this.activities(), ...this.match(), ...this.cars(), ...this.program(), ...this.diagram(), ...this.now(), ...this.toolbar(), ...this.share(), ...this.info(), ...this.bugForm(), stop: (e) => e.stopPropagation() }; }

  header() { const app = this.app, st = this.ui;
    const row = (a) => "display:flex;align-items:center;gap:8px;width:100%;font-family:'Source Sans 3',sans-serif;font-size:12.5px;font-weight:600;color:#dbe6ef;background:" + (a ? 'rgba(191,138,30,0.36)' : 'transparent') + ';border:none;border-radius:7px;padding:8px 9px;cursor:pointer;text-align:left;';
    const side = (a) => "display:flex;align-items:center;gap:9px;width:100%;font-family:'Source Sans 3',sans-serif;font-size:13px;font-weight:600;color:#dbe6ef;background:" + (a ? 'rgba(191,138,30,0.36)' : 'rgba(255,255,255,0.05)') + ';border:1px solid ' + (a ? 'rgba(224,184,90,0.6)' : 'rgba(255,255,255,0.08)') + ';border-radius:8px;padding:9px 11px;cursor:pointer;text-align:left;';
    const dot = (a) => (a ? 'display:inline-block;width:7px;height:7px;border-radius:50%;background:#e0b85a;flex:none;' : 'display:inline-block;width:7px;height:7px;flex:none;');
    const mk = (icon, label, onClick, active) => ({ icon, label, onClick, rowStyle: row(active), sideStyle: side(active), dotStyle: dot(active) });
    const menuItems = [mk('←', 'All sims', () => { try { window.open('../', '_blank', 'noopener'); } catch (e) {} }), mk('ⓘ', 'Info', () => app.setState((x) => ({ showInfo: !x.showInfo, menuOpen: false })), !!st.showInfo),
      mk('↗', 'Share link', () => app.setState({ showShare: true, menuOpen: false, shareCopied: false })), mk('🐞', 'Submit bug', () => app.setState({ showBug: true, menuOpen: false, bugText: '', bugEmail: '', bugResult: '', bugSending: false }))];
    return { big: app.big, menuItems, menuOpen: !!st.menuOpen, onToggleMenu: () => app.setState((x) => ({ menuOpen: !x.menuOpen })), onCloseMenu: () => app.setState({ menuOpen: false }),
      menuBtnStyle: 'display:flex;align-items:center;justify-content:center;width:32px;height:30px;font-size:16px;border-radius:8px;cursor:pointer;border:1px solid ' + (st.menuOpen ? 'rgba(224,184,90,0.7)' : 'rgba(255,255,255,0.28)') + ';background:' + (st.menuOpen ? 'rgba(191,138,30,0.32)' : 'rgba(255,255,255,0.08)') + ';color:#cfe0f2;' }; }

  // a drop-down: a button showing the current choice ▾, opening a list (Esc or a click elsewhere closes it). items: [{ key, icon, label, tag, title, pick }]
  menu(id, items, current) { const app = this.app, open = this.ui.openMenu === id, cur = items.find((it) => it.key === current) || { icon: '', label: 'Your own setup', tag: '' };
    return { open, icon: cur.icon, label: cur.label, tag: cur.tag || '', onToggle: () => app.setState((x) => ({ openMenu: x.openMenu === id ? null : id, menuOpen: false })), onClose: () => app.setState({ openMenu: null }),
      btnStyle: "display:flex;align-items:center;gap:8px;width:100%;font-family:'Source Sans 3',sans-serif;font-size:13px;font-weight:700;padding:6px 10px;border-radius:9px;cursor:pointer;text-align:left;border:1px solid " + (open ? '#bf8a1e' : '#d3d8dd') + ';background:' + (open ? '#f6f0db' : '#fff') + ';color:#3a414a;box-shadow:0 1px 2px rgba(0,0,0,0.05);',
      items: items.map((it) => ({ icon: it.icon, label: it.label, tag: it.tag || '', title: it.title || '', style: UI.pick(it.key === current).replace('border:1px solid #e4e8ec', 'border:1px solid transparent').replace('padding:7px 10px', 'padding:6px 9px'),
        onClick: () => { it.pick(); app.setState({ openMenu: null }); app.refresh(); } })) }; }
  activities() { const app = this.app, s = this.sim, full = s.mode === 'match' ? Panel.NOTES.match[s.task] : Panel.NOTES[s.mode];
    return { actMenu: this.menu('act', Sim.ACTIVITIES.map(([k, label, icon]) => ({ key: k, label, icon, pick: () => s.choose(k) })), s.mode),
      isMatch: s.mode === 'match', isCars: s.mode === 'cars', isProgram: s.mode === 'program', isDiagram: s.mode === 'diagram',
      note: full, noteFull: full }; }

  // a number field with its slider: spec { label, tex, unit, min, max, step }, the value, what to call on a change; `id` keeps a half-typed draft
  field(spec, v, set, id) { const app = this.app, d = this.ui.draft, dec = spec.step >= 1 ? 0 : spec.step >= 0.1 ? 1 : 2;
    return { label: spec.label || '', title: (spec.label || '') + ' (' + spec.min + ' to ' + spec.max + ' ' + spec.unit + ')', tex: spec.tex, unit: spec.unit, min: spec.min, max: spec.max, step: spec.step, value: String(v), text: d && d.id === id ? d.text : Fmt.fix(v, dec).replace('−', '-'),     // (a number box wants an ASCII minus)
     
      onSlide: (e) => { set(e.target.value); app.refresh(); }, onType: (e) => app.setState({ draft: { id, text: e.target.value } }), onCommit: (e) => { set(parseFloat(e.target.value)); app.setState({ draft: null }); app.refresh(); } }; }

  // ---- match the graph ----
  match() { const app = this.app, s = this.sim; if (s.mode !== 'match') return { targetMenu: this.menu('target', [], null), taskChips: [], sketchChips: [], isDriving: false, isSketching: false, matchScore: '', matchVerdict: '', scoreStyle: '', targetHead: '', onCheck: () => {}, onClearSketch: () => {}, checkStyle: '', clearStyle: '', ...this.throttleVals() };
    const stars = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
    const targetMenu = this.menu('target', TARGETS.map((T) => ({ key: T.key, label: T.name, icon: T.kind === 'x' ? 'x–t' : 'v–t', tag: stars(T.stars), title: (T.kind === 'x' ? 'An x–t' : 'A v–t') + ' graph, difficulty ' + T.stars + ' of 3', pick: () => s.setTarget(T.key) })), s.targetKey);
    const r = s.result, has = r && isFinite(r.pct);
    return { targetMenu, isDriving: s.driving, isSketching: s.sketching, targetHead: s.driving ? 'Graph to match' : 'Motion to watch',
      taskChips: [['drive', 'Drive the cart'], ['sketch', 'Sketch the graph']].map(([k, label]) => ({ label, style: UI.chip(s.task === k), onClick: app.run(() => s.setTask(k)) })),
      sketchChips: [['x', 'Sketch x–t'], ['v', 'Sketch v–t']].map(([k, label]) => ({ label, style: UI.chip(s.sketchOf === k), onClick: app.run(() => s.setSketchOf(k)) })),
      onCheck: app.run(() => s.check()), onClearSketch: app.run(() => s.clearSketch()), checkStyle: UI.act('go'), clearStyle: UI.act(),
      matchScore: has ? r.pct + ' %' : s.driving && s.liveScore ? s.liveScore.pct + ' %' : '–', matchVerdict: has ? verdict(r.pct) : s.driving ? (s.playing ? 'so far' : 'Run to score a try') : (r && r.short ? 'Sketch across the whole 10 s first' : 'Draw, then Check'),
      scoreStyle: "font-family:'JetBrains Mono',monospace;font-size:19px;font-weight:700;color:" + (has ? (r.pct >= 75 ? '#2f8f56' : '#b8860b') : '#9aa2ab') + ';',
      ...this.throttleVals() }; }
  throttleVals() { const app = this.app, s = this.sim, d = s.driver;
    return { thrValue: String(Math.round(d.cmd * 100) / 100), thrText: Fmt.fix(d.drag != null ? d.v : d.cmd, 2) + ' m/s', onThrottle: (e) => { s.throttle(e.target.value); app.refresh(); }, onStopCart: app.run(() => s.stopCart()) }; }

  // ---- two cars ----
  cars() { const app = this.app, s = this.sim; if (s.mode !== 'cars') return { carsMenu: this.menu('cars', [], null), carRows: [], meetLines: [], carNote: '', workLabel: '', onToggleWork: () => {}, timeField: this.field(Sim.SPECS.time, s.cars.time, () => {}, 'time') };
    const carsMenu = this.menu('cars', Sim.CARS.map((P) => ({ key: P.key, label: P.name, icon: '⇄', title: P.note, pick: () => s.setCars(P.key) })), s.carsKey);
    const carRows = Sim.SPECS.car.map((p) => ({ label: p.label, tex: p.tex, unit: p.unit, A: this.field(p, s.cars.A[p.key], (v) => s.setCar('A', p.key, v), 'A' + p.key), B: this.field(p, s.cars.B[p.key], (v) => s.setCar('B', p.key, v), 'B' + p.key) }));
    const m = s.meeting, A = s.cars.A, B = s.cars.B, lines = [], sec = (t) => Fmt.sig(t) + '\\text{ s}', met = (x) => Fmt.sig(x) + '\\text{ m}';
    // each car's position; a braking car's until it stops, t = −v0x/ax, and where it then stays
    for (const [k, c] of [['A', A], ['B', B]]) { const ts = Car.stop(c);
      lines.push({ tex: 'x_' + k + ' = ' + Panel.poly(0.5 * c.a, c.v0, c.x0) + (isFinite(ts) ? '\\quad (t \\le ' + sec(ts) + ')' : '') });
      if (isFinite(ts)) lines.push({ tex: '\\text{' + k + ' stops at } t = -\\dfrac{v_{0x}}{a_x} = ' + sec(ts) + ',\\quad x_' + k + ' = ' + met(Car.stopX(c)), note: 'then stays put' }); }
    const stretch = (e) => (e.t0 > 0 || isFinite(e.t1) ? (isFinite(e.t1) ? '\\quad (' + Fmt.sig(e.t0) + ' \\le t \\le ' + Fmt.sig(e.t1) + '\\text{ s})' : '\\quad (t \\ge ' + sec(e.t0) + ')') : '');
    const eqLine = (e) => (e.restA && e.restB ? { tex: '\\text{both at rest}' + stretch(e), note: Math.abs(e.r) < 1e-9 ? 'at the same place' : Fmt.m(Math.abs(e.r)) + ' apart' }
      : { tex: (e.restA || e.restB ? (e.restA ? 'x_{A,\\text{stop}}' : 'x_A') + ' = ' + (e.restB ? 'x_{B,\\text{stop}}' : 'x_B') : 'x_A = x_B') + ':\\quad ' + Panel.poly(e.p, e.q, e.r) + ' = 0' + stretch(e) });
    if (m.always) lines.push({ answer: true, tex: '\\text{the same at every } t' });
    else { const used = m.eqs.filter((e) => e.roots.length); (used.length ? used : m.eqs.filter((e) => e.t0 <= s.T)).forEach((e) => { lines.push(eqLine(e));
        e.roots.forEach((t) => { const i = m.times.findIndex((u) => Math.abs(u - t) < 1e-7); lines.push({ answer: true, tex: 't = ' + sec(t) + ',\\quad x = ' + met(m.xs[i]), note: t > s.T + 1e-9 ? 'after the ' + s.T + ' s shown' : e.tangent ? 'they just touch' : '' }); }); });
      if (!m.times.length) lines.push({ answer: true, tex: '\\text{they never meet}', note: 'closest: ' + Fmt.m(m.closest.gap) + ' apart at t = ' + Fmt.time(m.closest.t) }); }
    // (folded: just the answers; unfolded: each car's equation, any stop, the equation solved, then the answers)
    const work = !!this.ui.showWork, shown = work ? lines : lines.filter((l) => l.answer);
    return { carsMenu, carRows, workLabel: work ? 'Hide the working ▴' : 'Show the working ▾', onToggleWork: () => app.setState((x) => ({ showWork: !x.showWork })), meetLines: shown.map((l) => ({ tex: l.tex.replace(/−/g, '-'), note: l.note || '' })), timeField: this.field(Sim.SPECS.time, s.cars.time, (v) => s.setTime(v), 'time'),
      carNote: (Sim.CARS.find((P) => P.key === s.carsKey) || { note: 'Your own setup: set each car’s start, velocity and acceleration.' }).note }; }
  // c2 t² + c1 t + c0, written the way it is on paper (no 1t, no + −, no zero terms)
  static poly(c2, c1, c0) { const n = (x) => Fmt.num(Math.abs(x), 3), parts = [];
    const term = (c, tail) => { if (Math.abs(c) < 1e-9) return; const lead = !parts.length, sign = c < 0 ? (lead ? '-' : ' - ') : (lead ? '' : ' + '), mag = Math.abs(c); parts.push(sign + (tail && Math.abs(mag - 1) < 1e-9 ? '' : n(c)) + tail); };
    term(c2, 't^2'); term(c1, 't'); term(c0, ''); return parts.length ? parts.join('') : '0'; }

  // ---- program the motion ----
  program() { const app = this.app, s = this.sim; if (s.mode !== 'program') return { pieceRows: [], progFields: [], progTotals: [], buildChips: [], canAdd: false, onAdd: () => {}, addStyle: '', pieceHead: '', jumpNote: '', jumpShort: '' };
    const m = s.motion(), cur = m.piece(Math.min(s.t, m.T - 1e-9)), [pq, pd] = s.pieceSpecs, key = pq.key, P = s.pieces;
    const pieceRows = m.knots.map((k, i) => { const end = m.at(k.t + k.d - 1e-9), on = k === cur && s.t > 0;
      const facts = s.byVel ? ['Δx = vₓ Δt = ' + Fmt.m(end.x - k.x)] : ['Δvₓ = ' + Fmt.vel(k.a * k.d), 'Δx = ' + Fmt.m(end.x - k.x), 'vₓ after = ' + Fmt.vel(end.v)];
      return { n: String(i + 1), q: this.field(pq, P[i][key], (v) => s.setPiece(i, key, v), 'pq' + key + i), d: this.field(pd, P[i].d, (v) => s.setPiece(i, 'd', v), 'pd' + key + i), facts: facts.map((t) => ({ t })),
        onRemove: app.run(() => s.removePiece(i)), canRemove: m.knots.length > 1,
        rowStyle: 'display:flex;flex-direction:column;gap:2px;padding:4px 8px;border-radius:8px;border:1px solid ' + (on ? '#bf8a1e' : '#e4e8ec') + ';background:' + (on ? '#fbf6e6' : '#fff') + ';' }; });
    const jumps = m.jumps.length;
    return { buildChips: [['a', 'Acceleration pieces'], ['v', 'Velocity pieces']].map(([k, label]) => ({ label, style: UI.chip(s.prog.build === k), onClick: app.run(() => s.setBuild(k)) })),
      pieceHead: s.byVel ? 'Pieces of the v–t graph' : 'Pieces of the a–t graph',
      progFields: Sim.SPECS.prog.filter((p) => !(s.byVel && p.key === 'v0')).map((p) => this.field(p, s.prog[p.key], (v) => s.setProg(p.key, v), 'prog' + p.key)), pieceRows, canAdd: P.length < Sim.MAXPIECES, onAdd: app.run(() => s.addPiece()), addStyle: UI.act(),
      jumpNote: s.byVel && jumps ? 'Between pieces the velocity jumps at once. A real object can’t: it would need an infinite acceleration for no time. The a–t graph marks each jump with a spike (↑ or ↓) instead of a value.' : '',
      jumpShort: s.byVel && jumps ? 'vₓ jumps between pieces: spikes on a–t (hover)' : '',
      progTotals: [{ tex: 't_{\\text{total}}', val: Fmt.time(m.T) }, { tex: '\\Delta x', val: Fmt.m(m.end.x - m.x0) }, { tex: 'v_{x,\\text{end}}', val: Fmt.vel(m.end.v) }] }; }

  // ---- the motion diagram and the signs ----
  diagram() { const app = this.app, s = this.sim; if (s.mode !== 'diagram') return { caseMenu: this.menu('case', [], null), diagFields: [], signRows: [], signHow: '', signWhy: '', turnNote: '' };
    const st = s.motion().at(s.t), sg = (x) => (Math.abs(x) < 1e-9 ? '0' : x > 0 ? '+' : '−'), how = Math.abs(st.v) < 1e-9 ? (Math.abs(st.a) > 1e-9 ? 'momentarily at rest: turning round' : 'at rest') : Math.abs(st.a) < 1e-9 ? 'steady speed' : st.v * st.a > 0 ? 'speeding up' : 'slowing down';
    const tp = s.turn;
    return { caseMenu: this.menu('case', Sim.CASES.map((C) => ({ key: C.key, label: C.name, icon: '⋯', pick: () => s.setCase(C.key) })), s.caseKey),
      diagFields: Sim.SPECS.diag.map((p) => this.field(p, s.diag[p.key], (v) => s.setDiag(p.key, v), 'diag' + p.key)),
      signRows: [{ tex: '\\text{sign of } v_x', val: sg(st.v) }, { tex: '\\text{sign of } a_x', val: sg(st.a) }], signHow: how, signWhy: Math.abs(st.v) < 1e-9 || Math.abs(st.a) < 1e-9 ? '' : st.v * st.a > 0 ? 'same signs: speeding up' : 'opposite signs: slowing down',
      turnNote: tp ? 'Turns round at t = ' + Fmt.time(tp.t) + ', x = ' + Fmt.m(tp.x) + ': there vₓ = 0, but aₓ is not.' : '' }; }

  // ---- the moment shown ----
  now() { const s = this.sim, rows = [];
    if (!s.veiled) for (const b of s.bodies()) { const q = b.at(s.t), c = s.mode === 'cars' ? b.key : '';
      rows.push({ tex: c ? 'x_' + c : 'x', val: Fmt.m(q.x) }, { tex: c ? 'v_{x,' + c + '}' : 'v_x', val: Fmt.vel(q.v) }, { tex: c ? 'a_{x,' + c + '}' : 'a_x', val: Fmt.acc(q.a) }); }
    return { nowRows: rows, nowHead: 'At t = ' + Fmt.time(s.t), nowHidden: s.veiled ? 'Hidden until you check your sketch.' : '' }; }

  toolbar() { const app = this.app, s = this.sim, sp = s.speed;
    return { setCanvas: app.setCanvas,
      clockBtns: [{ label: s.playing ? '❚❚ Pause' : '▶ Run', title: s.playing ? 'Stop the clock (Space)' : 'Start the clock (Space)', style: UI.tool(s.playing), onClick: app.run(() => s.toggle()) },
        { label: '↺', title: s.driving ? 'Back to the start: a new try' : 'Back to the start', style: UI.sq, onClick: app.run(() => s.reset()) }, { label: '⏭', title: 'Step on 1/30 s', style: UI.sq, onClick: app.run(() => s.step()) },
        { label: sp === 1 ? '1×' : sp === 0.5 ? '½×' : '¼×', title: 'Speed: full, half or quarter (slow motion)', style: UI.tool(sp < 1), onClick: app.run(() => { const k = Sim.SPEEDS.indexOf(sp); s.speed = Sim.SPEEDS[(k + 2) % 3]; s.bump(); }) }],
      timeStr: 't = ' + Fmt.time(s.t),
      showChips: [['hints', 'Slope & area', 'The tangent to x–t (its slope is vₓ) and the area under v–t (Δx) and a–t (Δvₓ), up to the moment shown'], ['dots', 'Motion diagram', 'A dot where it was every so often'], ['arrows', 'v and a arrows', 'The velocity (white) and acceleration (magenta) arrows on the track']]
        .map(([k, label, title]) => ({ label, title, style: UI.chip(s.show[k]), onClick: app.run(() => s.toggleShow(k)) })) }; }

  share() { const app = this.app, st = this.ui;
    return { showShare: !!st.showShare, onCloseShare: () => app.setState({ showShare: false }), shareUrl: st.showShare ? Link.url(this.sim) : '', onCopyShare: () => app.copyShare(), copyLabel: st.shareCopied ? 'Copied' : 'Copy',
      copyBtnStyle: "min-width:86px;flex:none;font-family:'Source Sans 3',sans-serif;font-size:12px;font-weight:700;padding:9px 15px;border-radius:8px;cursor:pointer;border:1px solid " + (st.shareCopied ? '#2f8f56' : 'rgba(224,184,90,0.5)') + ';background:' + (st.shareCopied ? '#2f8f56' : 'rgba(191,138,30,0.3)') + ';color:#fff;', selectAll: (e) => e.target.select() }; }

  info() { const app = this.app;
    return { showInfo: !!this.ui.showInfo, onCloseInfo: () => app.setState({ showInfo: false }), infoFormulas: [
      { expr: 'v_x = \\dfrac{\\Delta x}{\\Delta t}', desc: 'velocity: the slope of the x–t graph (the slope of the tangent, for the velocity at one moment)' },
      { expr: 'a_x = \\dfrac{\\Delta v_x}{\\Delta t}', desc: 'acceleration: the slope of the v–t graph' },
      { expr: '\\Delta x = \\text{area under } v_x(t)', desc: 'displacement: the area between the v–t graph and the time axis (below the axis counts as negative)' },
      { expr: 'v_x = v_{0x} + a_x t', desc: 'constant acceleration: the velocity changes steadily' },
      { expr: 'x = x_0 + v_{0x} t + \\tfrac12 a_x t^2', desc: 'constant acceleration: where it is at time t' },
      { expr: 'v_x^2 = v_{0x}^2 + 2 a_x \\Delta x', desc: 'constant acceleration, without the time' }] }; }

  bugForm() { const app = this.app, st = this.ui, res = st.bugResult || '';
    return { showBug: !!st.showBug, onCloseBug: () => app.setState({ showBug: false }), stopBug: (e) => e.stopPropagation(), onBugText: (e) => app.setState({ bugText: e.target.value }), onBugEmail: (e) => app.setState({ bugEmail: e.target.value }),
      onSubmitBug: () => app.submitBug(), bugBtnLabel: st.bugSending ? 'Sending…' : 'Send report',
      bugBtnStyle: "flex:none;font-family:'Source Sans 3',sans-serif;font-size:12px;font-weight:700;padding:9px 15px;border-radius:8px;cursor:pointer;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.14);color:#fff;opacity:" + (st.bugSending ? '0.6' : '1') + ';',
      bugMsg: res.replace(/^(ok|err):/, ''), bugMsgColor: res.slice(0, 3) === 'ok:' ? '#7fd1a4' : '#f0a5a5' }; }
}

// ---- the address. Every key is a full word (start, velocity, …), so a cache-buster like ?v=3 is never read as a setting.
//   ?activity=match&task=drive|sketch&target=<key>&sketch=x|v
//   ?activity=cars&preset=<key>   or   &startA=&velocityA=&accelA=&startB=&velocityB=&accelB=&time=
//   ?activity=program&build=acceleration|velocity&start=&velocity=&pieces=2:4,0:5,-2.5:3.2      (aₓ:Δt, or vₓ:Δt, for each piece)
//   ?activity=diagram&case=<key>  or   &start=&velocity=&accel= ----
const Link = {
  url(sim) { const q = new URLSearchParams(); q.set('activity', sim.mode);
    if (sim.mode === 'match') { q.set('task', sim.task); q.set('target', sim.targetKey); if (sim.task === 'sketch') q.set('sketch', sim.sketchOf); }
    if (sim.mode === 'cars') { if (sim.carsKey) q.set('preset', sim.carsKey); else { for (const k of ['A', 'B']) { const c = sim.cars[k]; q.set('start' + k, c.x0); q.set('velocity' + k, c.v0); q.set('accel' + k, c.a); } q.set('time', sim.cars.time); } }
    if (sim.mode === 'program') { const v = sim.byVel; q.set('build', v ? 'velocity' : 'acceleration'); q.set('start', sim.prog.x0); if (!v) q.set('velocity', sim.prog.v0); q.set('pieces', sim.pieces.map((p) => (v ? p.v : p.a) + ':' + p.d).join(',')); }
    if (sim.mode === 'diagram') { if (sim.caseKey) q.set('case', sim.caseKey); else { q.set('start', sim.diag.x0); q.set('velocity', sim.diag.v0); q.set('accel', sim.diag.a); } }
    let base = ''; try { base = location.origin + location.pathname; } catch (e) {} return base + '?' + q.toString(); },
  apply(sim, search) { let q; try { q = new URLSearchParams(search == null ? location.search : search); } catch (e) { return false; } const k = q.get('activity'); if (!k || !sim.choose(k)) return false; const has = (n) => q.get(n) != null && q.get(n) !== '';
    if (k === 'match') { if (has('task')) sim.setTask(q.get('task')); if (has('target')) sim.setTarget(q.get('target')); if (has('sketch')) sim.setSketchOf(q.get('sketch')); }
    if (k === 'cars') { if (has('preset')) sim.setCars(q.get('preset')); for (const c of ['A', 'B']) for (const [n, key] of [['start', 'x0'], ['velocity', 'v0'], ['accel', 'a']]) if (has(n + c)) sim.setCar(c, key, q.get(n + c)); if (has('time')) sim.setTime(q.get('time')); }
    if (k === 'program') { if (has('build')) sim.setBuild(q.get('build') === 'velocity' ? 'v' : 'a'); if (has('pieces')) { const key = sim.byVel ? 'v' : 'a'; const P = q.get('pieces').split(',').slice(0, Sim.MAXPIECES).map((s) => s.split(':').map(Number)).filter((p) => p.length === 2 && p.every(isFinite));
        if (P.length) { const list = P.map(() => ({ [key]: 0, d: 1 })); if (sim.byVel) sim.prog.vpieces = list; else sim.prog.pieces = list; P.forEach(([a, d], i) => { sim.setPiece(i, key, a); sim.setPiece(i, 'd', d); }); } }
      if (has('start')) sim.setProg('x0', q.get('start')); if (has('velocity')) sim.setProg('v0', q.get('velocity')); }
    if (k === 'diagram') { if (has('case')) sim.setCase(q.get('case')); for (const [n, key] of [['start', 'x0'], ['velocity', 'v0'], ['accel', 'a']]) if (has(n)) sim.setDiag(key, q.get(n)); }
    sim.reset(); return true; },
};
