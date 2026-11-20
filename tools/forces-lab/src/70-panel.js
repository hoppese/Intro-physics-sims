// =====================================================================
// Panel -- the page around the canvas: toolbar, the clock, the selected
// element's card (with its free-body table), the motion of every block,
// the summary and the overlays. It reads the workbench and calls back into
// the app; it never changes the bench itself.
// =====================================================================
const UI = {
  row: 'display:flex;align-items:center;gap:8px;width:100%;font-size:12px;font-weight:600;color:#3a414a;background:transparent;border:none;border-radius:7px;padding:7px 9px;cursor:pointer;text-align:left;',
  header: 'font-size:9.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#9aa2ab;padding:8px 9px 3px;',
  zoom: 'font-size:12px;font-weight:700;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:6px;cursor:pointer;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#d7dee5;',
  // a measuring tool's button on the canvas, lit while the tool is out
  tool: (on) => 'font-size:11px;font-weight:700;height:24px;padding:0 8px;display:flex;align-items:center;gap:3px;border-radius:6px;cursor:pointer;white-space:nowrap;border:1px solid ' + (on ? 'rgba(240,200,96,0.8)' : 'rgba(255,255,255,0.18)') + ';background:' + (on ? 'rgba(191,138,30,0.45)' : 'rgba(255,255,255,0.07)') + ';color:' + (on ? '#fff3cf' : '#d7dee5') + ';',
  // a toolbar button that lights up while its menu is open
  drop: (on) => 'display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:6px 10px;border-radius:8px;cursor:pointer;border:1px solid ' + (on ? '#bf8a1e' : '#d3d8dd') + ';background:' + (on ? '#f6f0db' : '#fff') + ';color:#525a63;',
  step: (on) => 'font-size:14px;line-height:1;font-weight:600;padding:5px 8px;border-radius:8px;border:1px solid #d3d8dd;background:#fff;color:#525a63;cursor:' + (on ? 'pointer' : 'default') + ';opacity:' + (on ? '1' : '0.35') + ';',
  // one of a set of choices on the selected-element card (lit when it is the current one)
  chip: (on) => "font-family:'Source Sans 3',sans-serif;font-size:11px;font-weight:600;padding:4px 10px;border-radius:999px;cursor:pointer;border:1px solid " + (on ? '#bf8a1e' : '#d7dbe0') + ';background:' + (on ? '#f6f0db' : '#fff') + ';color:' + (on ? '#7a5a12' : '#525a63') + ';',
  chipHead: 'font-size:9px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#9aa2ab;margin-right:2px;',
  // the little pictures in the Add menu
  icon(inner) { const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 14" width="24" height="14">' + inner + '</svg>';
    return "width:24px;height:14px;display:inline-block;flex:none;background-repeat:no-repeat;background-position:center;background-size:contain;background-image:url('data:image/svg+xml," + encodeURIComponent(svg) + "');"; },
};

UI.S0 = 'stroke="#6b5a2a" fill="none" stroke-linecap="round" stroke-linejoin="round"';
UI.S = UI.S0 + ' stroke-width="1.5"';
UI.icons = {
  block: UI.icon('<rect x="6" y="3" width="12" height="9" rx="1" fill="#4f86c6" stroke="#2c4f78" stroke-width="1"/>'),
  floor: UI.icon('<path ' + UI.S0 + ' stroke-width="2" d="M2,9 L22,9"/><path stroke="#6b5a2a" stroke-width="1" d="M4,9 L2,12 M8,9 L6,12 M12,9 L10,12 M16,9 L14,12 M20,9 L18,12"/>'),
  ramp: UI.icon('<path fill="#e6ebf0" stroke="#6b5a2a" stroke-width="1.5" stroke-linejoin="round" d="M3,12 L21,12 L21,3 Z"/>'),
  wall: UI.icon('<path ' + UI.S0 + ' stroke-width="2" d="M14,1 L14,13"/><path stroke="#6b5a2a" stroke-width="1" d="M14,3 L17,1 M14,6 L17,4 M14,9 L17,7 M14,12 L17,10"/>'),
  ceiling: UI.icon('<path ' + UI.S0 + ' stroke-width="2" d="M2,4 L22,4"/><path stroke="#6b5a2a" stroke-width="1" d="M4,4 L6,1 M8,4 L10,1 M12,4 L14,1 M16,4 L18,1 M20,4 L22,1"/>'),
  pulley: UI.icon('<circle cx="12" cy="7" r="5" fill="#e6ebf0" stroke="#6b5a2a" stroke-width="1.5"/><circle cx="12" cy="7" r="1.2" fill="#6b5a2a"/>'),
  anchor: UI.icon('<circle cx="12" cy="7" r="3" fill="#fff" stroke="#6b5a2a" stroke-width="1.5"/>'),
  rope: UI.icon('<path stroke="#a8862f" stroke-width="1.6" fill="none" d="M2,10 C8,10 8,4 12,4 C16,4 16,10 22,10"/>'),
  spring: UI.icon('<path stroke="#8a5ab0" stroke-width="1.4" fill="none" d="M2,7 L5,7 L6.5,3 L9.5,11 L12.5,3 L15.5,11 L18.5,3 L19.5,7 L22,7"/>'),
  push: UI.icon('<path stroke="#d9782a" stroke-width="2.4" fill="none" d="M3,7 L16,7"/><path fill="#d9782a" d="M15,3 L22,7 L15,11 Z"/>'),
};

class Panel {
  static VIEW = [['fbd', 'Free-body arrows', 'Every force on each block (or only the selected one), drawn from its centre to one scale'], ['components', 'Components', 'For the selected block: each force split along and across the surface it rests on'], ['grid', 'Grid', 'The metre grid']];
  static G = [[9.8, 'Earth'], [1.62, 'Moon'], [3.71, 'Mars'], [24.8, 'Jupiter']];
  static NOTES = {
    block: 'A particle with a size: forces act at its centre, and it never tips or spins. It takes the slope of whatever it rests on.',
    surface: 'Things press only on its top side (the side its hatching is not on). Drag the gold handle to tilt and stretch it.',
    pulley: 'Ideal: no mass and no friction, so a rope over it has the same tension on both sides.',
    anchor: 'A fixed point for a rope or a spring.',
    rope: 'Massless and unstretchable: one tension all along it. It can go slack, but it never pushes.',
    spring: 'Hooke’s law, both ways: the force is k times the stretch. Compressed, it pushes.',
    push: 'A steady applied force on the block. Drag the gold handle at its tail to aim it.',
  };
  // each force's symbol (Knight's): the letter that carries the arrow, and its subscript
  static SYM = { weight: ['w', ''], normal: ['n', ''], static: ['f', 's'], kinetic: ['f', 'k'], tension: ['T', ''], spring: ['F', 'sp'], applied: ['F', ''] };
  // the panel's darker cousins of the canvas colours
  static INK = { weight: '#d64545', normal: '#2f7fc8', static: '#b8860b', kinetic: '#b8860b', tension: '#3f8f2a', spring: '#8a4fb0', applied: '#d06a12' };
  // One vector read-out: the symbol typeset by KaTeX (\vec over an italic letter, roman subscript), the vector as
  // ⟨ x, y, 0 ⟩ in mono with its unit. What it is and its magnitude come up when the row is hovered (or tapped):
  // a magnitude written as the plain letter (w = 29.4 N), no arrow and no bars; the net force's as F_net, since
  // ΣF could be misread as a sum of magnitudes.
  static tex(letter, sub, pre, arrow) { const s = sub ? '_{' + (/^\d+$/.test(sub) ? sub : '\\text{' + sub + '}') + '}' : '';
    return (pre === 'Σ' ? '\\Sigma ' : '') + (arrow === false ? letter : '\\vec{' + letter + '}') + s; }
  static vec(letter, sub, value, unit, o) { o = o || {}; const col = o.col || '#3a414a', key = o.key || letter + sub + (o.pre || '');
    const tipOn = !!o.tip && o.tip === key, has = !!(o.what || o.mag);
    return { key, tex: Panel.tex(letter, sub, o.pre), val: value, unit, what: o.what || '', mag: o.mag || '', magTex: Panel.tex(o.magL || letter, o.magS != null ? o.magS : sub, '', false), hasMag: !!o.mag,
      symStyle: 'color:' + col + ';font-size:' + (o.size || 14.5) + 'px;flex:none;', tipOn: has && tipOn,
      rowStyle: 'position:relative;display:flex;align-items:baseline;gap:5px;white-space:nowrap;padding:0 4px;margin:0 -4px;border-radius:6px;line-height:1.35;cursor:' + (has ? 'help' : 'default') + ';background:' + (has && tipOn ? '#eef2f6' : 'transparent') + ';',
      onEnter: has && o.setTip ? () => o.setTip(key) : () => {}, onLeave: has && o.setTip ? () => o.setTip(null) : () => {}, onTap: has && o.setTip ? () => o.setTip(tipOn ? null : key) : () => {} }; }
  static WHAT = { weight: 'weight', normal: 'normal force', static: 'static friction', kinetic: 'kinetic friction', tension: 'tension', spring: 'spring force', applied: 'applied force' };

  constructor(app) { this.app = app; }
  get bench() { return this.app.bench; }
  get ui() { return this.app.state; }
  all() { return { ...this.header(), ...this.toolbar(), ...this.canvas(), ...this.inspector(), ...this.motion(), ...this.summary(), ...this.share(), ...this.info(), ...this.bugForm(), stop: (e) => e.stopPropagation() }; }

  // ---- title bar ----
  header() { const app = this.app, st = this.ui, b = this.bench, set = (p) => () => app.setState(p);
    const row = (a) => "display:flex;align-items:center;gap:8px;width:100%;font-family:'Source Sans 3',sans-serif;font-size:12.5px;font-weight:600;color:#dbe6ef;background:" + (a ? 'rgba(191,138,30,0.36)' : 'transparent') + ';border:none;border-radius:7px;padding:8px 9px;cursor:pointer;text-align:left;';
    const side = (a) => "display:flex;align-items:center;gap:9px;width:100%;font-family:'Source Sans 3',sans-serif;font-size:13px;font-weight:600;color:#dbe6ef;background:" + (a ? 'rgba(191,138,30,0.36)' : 'rgba(255,255,255,0.05)') + ';border:1px solid ' + (a ? 'rgba(224,184,90,0.6)' : 'rgba(255,255,255,0.08)') + ';border-radius:8px;padding:9px 11px;cursor:pointer;text-align:left;';
    const dot = (a) => (a ? 'display:inline-block;width:7px;height:7px;border-radius:50%;background:#e0b85a;flex:none;' : 'display:inline-block;width:7px;height:7px;flex:none;');
    const mk = (icon, label, onClick, active) => ({ icon, label, onClick, rowStyle: row(active), sideStyle: side(active), dotStyle: dot(active) });
    const menuItems = [
      mk('←', 'All sims', () => { try { window.open('../', '_blank', 'noopener'); } catch (e) {} }),
      mk('ⓘ', 'Info', () => app.setState((s) => ({ showInfo: !s.showInfo, menuOpen: false })), !!st.showInfo),
      mk('↺', 'Clear bench', () => { b.clear(); app.setState({ menuOpen: false }); }),
      mk('↗', 'Share link', () => app.setState({ showShare: true, menuOpen: false, shareCopied: false, shareHide: b.hidden })),
      mk('🐞', 'Submit bug', set({ showBug: true, menuOpen: false, bugText: '', bugEmail: '', bugResult: '', bugSending: false })),
    ];
    return { big: app.big, menuItems, variantNote: 'An open bench for forces and motion', menuOpen: !!st.menuOpen, onToggleMenu: () => app.setState((s) => ({ menuOpen: !s.menuOpen, addOpen: false, presetsOpen: false, viewOpen: false })), onCloseMenu: set({ menuOpen: false }),
      menuBtnStyle: 'display:flex;align-items:center;justify-content:center;width:32px;height:30px;font-size:16px;border-radius:8px;cursor:pointer;border:1px solid ' + (st.menuOpen ? 'rgba(224,184,90,0.7)' : 'rgba(255,255,255,0.28)') + ';background:' + (st.menuOpen ? 'rgba(191,138,30,0.32)' : 'rgba(255,255,255,0.08)') + ';color:#cfe0f2;',
      hideLabel: b.hidden ? 'Show forces' : 'Hide forces', hideTitle: b.hidden ? 'Show the forces and the numbers' : 'Hide every force and its value, to draw the free-body diagram first', onToggleHide: app.run(() => b.hide(!b.hidden)) }; }

  // ---- toolbar: Add, Presets, View, New, undo / redo ----
  toolbar() { const app = this.app, st = this.ui, b = this.bench, shut = { addOpen: false, presetsOpen: false, viewOpen: false }, open = (k) => () => app.setState((s) => ({ ...shut, menuOpen: false, [k]: !s[k] })), close = () => app.setState(shut);
    const groups = []; for (const m of ADD_MENU) { let g = groups.find((x) => x.name === m.group); if (!g) groups.push((g = { name: m.group, rows: [] })); g.rows.push(m); }
    const half = Math.ceil(groups.reduce((n, g) => n + g.rows.length + 1, 0) / 2), addItems = []; let col = 1, row = 1;
    for (const g of groups) { if (col === 1 && row > 1 && row + g.rows.length > half + 1) { col = 2; row = 1; }
      const cell = () => 'grid-column:' + col + ';grid-row:' + (row++) + ';';
      addItems.push({ header: true, isBtn: false, label: g.name, rowStyle: UI.header + cell() });
      for (const m of g.rows) addItems.push({ header: false, isBtn: true, label: m.label, title: m.hint, iconStyle: UI.icons[m.key] || '', iconText: '', rowStyle: UI.row + cell(), onClick: () => { b.add(m.key); close(); app.refresh(); } }); }
    const presetItems = PRESETS.map((p) => ({ label: p.label, title: p.note, rowStyle: UI.row, onClick: () => { b.loadPreset(p.key); close(); app.refresh(); } }));
    const viewItems = Panel.VIEW.map(([key, label, title]) => ({ label, title, mark: b.scene.opts[key] ? '✓' : '', rowStyle: UI.row, onClick: app.run(() => b.toggleOpt(key)) }));
    return { addBtnStyle: UI.drop(!!st.addOpen), addOpen: !!st.addOpen, onToggleAdd: open('addOpen'), onCloseAdd: close, addItems,
      presetBtnStyle: UI.drop(!!st.presetsOpen), presetsOpen: !!st.presetsOpen, onTogglePresets: open('presetsOpen'), onClosePresets: close, presetItems,
      viewBtnStyle: UI.drop(!!st.viewOpen), viewOpen: !!st.viewOpen, onToggleView: open('viewOpen'), onCloseView: close, viewItems,
      onNew: app.run(() => b.clear()), undoStyle: UI.step(b.history.canUndo), redoStyle: UI.step(b.history.canRedo), onUndo: app.run(() => b.undo()), onRedo: app.run(() => b.redo()) }; }

  // ---- the canvas: the clock (bottom left), measuring tools and zoom (bottom right) ----
  canvas() { const app = this.app, b = this.bench, zoom = (label, title, fn) => ({ label, title, style: UI.zoom, onClick: app.run(fn) });
    const box = (side) => 'position:absolute;bottom:10px;' + side + ':10px;display:flex;align-items:center;gap:4px;background:rgba(15,23,34,0.78);border:1px solid rgba(255,255,255,0.14);border-radius:8px;padding:4px;';
    const sp = b.speed, speedLabel = sp === 1 ? '1×' : sp === 0.5 ? '½×' : '¼×';
    return { setCanvas: app.setCanvas, zoomBoxStyle: box('right'), clockBoxStyle: box('left'),
      toolBtns: [{ label: '📏 Tape', title: b.measure.tape ? 'Put the tape measure away' : 'A tape measure: drag either end to pull it out, drag the tape to move it', style: UI.tool(!!b.measure.tape), onClick: app.run(() => b.toggleTape()) },
        { label: '∠ Angle', title: b.measure.angleOn ? 'Stop measuring angles' : 'Measure an angle: click two lines (surfaces, ropes, springs or the tape)', style: UI.tool(b.measure.angleOn), onClick: app.run(() => b.toggleAngle()) }],
      zoomBtns: [zoom('−', 'Zoom out', () => { b.view.zoomBy(1 / 1.25); b.dirty = true; }), zoom('⤡', 'Fit everything in view', () => b.fit()), zoom('+', 'Zoom in', () => { b.view.zoomBy(1.25); b.dirty = true; })],
      zoomPct: b.view.percent,
      clockBtns: [{ label: b.playing ? '❚❚ Pause' : '▶ Run', title: b.playing ? 'Stop the clock (Space)' : 'Start the clock (Space)', style: UI.tool(b.playing), onClick: app.run(() => b.toggle()) },
        { label: '↺', title: 'Back to the start (t = 0)', style: UI.zoom, onClick: app.run(() => b.reset()) },
        { label: '⏭', title: 'Step on 1/30 s', style: UI.zoom, onClick: app.run(() => b.stepOnce()) },
        { label: speedLabel, title: 'Speed: full, half or quarter (slow motion)', style: UI.tool(sp < 1), onClick: app.run(() => { const k = Workbench.SPEEDS.indexOf(sp); b.speed = Workbench.SPEEDS[(k + 2) % 3]; b.rev++; }) }],
      timeStr: 't = ' + Fmt.time(b.time), ...this.graphBar() }; }

  // ---- the graphs' controls: which graphs, and (for motion) along which axis ----
  static GRAPHS = [['motion', 'Motion', 'Position, velocity and acceleration against time'], ['forces', 'Forces', 'The size of each force on the block, and of the net force, against time'], ['energy', 'Energy', 'Kinetic, potential and thermal energy against time, with bars for the moment shown'], [null, 'Off', 'Hide the graphs']];
  static AXES = [['x', 'x', 'Components along x (across)'], ['y', 'y', 'Components along y (up)'], ['s', 'along surface', 'Along the surface the block starts on, pointing the way it first speeds up']];
  graphBar() { const app = this.app, b = this.bench, sub = Graphs.subject(b);
    return { hasGraph: !!b.graph, setGraph: app.setGraph, graphStyle: (b.graph ? 'display:block;' : 'display:none;') + 'width:100%;height:' + Graphs.H + 'px;margin-top:7px;border-radius:10px;cursor:ew-resize;touch-action:none;',
      graphTabs: Panel.GRAPHS.map(([k, label, title]) => ({ label, title, style: UI.chip(b.graph === k), onClick: app.run(() => b.setGraph(k)) })),
      hasAxes: b.graph === 'motion', axisChips: Panel.AXES.map(([k, label, title]) => ({ label, title, style: UI.chip(b.axis === k), onClick: app.run(() => b.setAxis(k)) })),
      graphHint: !b.graph ? '' : (b.graph === 'energy' ? 'Every block on the bench; U_g is zero at the lowest point each reaches. ' : sub ? 'Of ' + b.scene.label(sub.el) + (b.scene.blocks.length > 1 ? ' (click another block to switch)' : '') + '. ' : '') + 'Drag along the graphs to go back in time.' }; }

  // ---- the selected element ----
  inspector() { const app = this.app, b = this.bench, el = b.selected, st = this.ui, hide = b.hidden, w = b.world;
    const none = { hasSel: false, noSel: true, selKind: '', selLabel: '', selFields: [], vecFields: [], hasVecs: false, selChips: [], hasChips: false, selNote: '', hasForces: false, forceRows: [], forceHead: '', netText: '', motionRows: [], canTurn: false, canCopy: false,
      noSelText: b.scene.isEmpty ? 'Use + Add to put a floor or ramp on the bench and a block on it, then press Run. Or start from a preset.' : 'Click a block to see every force on it. Drag things to move them; a block settles onto whatever it is dropped on.',
      onRotL: () => {}, onRotR: () => {}, onDup: () => {}, onDelete: () => {} };
    if (!el) return none;
    const d = st.draft, text = (k) => (d && d.id === el.id && d.field === k ? d.text : String(Math.round(el[k] * 1000) / 1000));      // (three decimals in the box; the value itself keeps its precision)
    const box = (s) => ({ label: s.label, unit: s.unit || '', value: text(s.key), min: s.min, max: s.max, step: s.step, onChange: (e) => app.typeField(s.key, e.target.value), onBlur: () => app.endField(false), isInput: true, isFixed: false });
    // (a block's starting position and velocity are vectors: one row each, ⟨ x, y, z ⟩, the z box fixed at 0 since the bench is a plane)
    const specs = el.fields(), byKey = new Map(specs.map((s) => [s.key, s])), vecKeys = el instanceof Block ? [['r', ['x', 'y'], 'm', 'starting position (of its centre)'], ['v', ['vx', 'vy'], 'm/s', 'starting velocity']] : [];
    const vecFields = vecKeys.filter(([, ks]) => ks.every((k) => byKey.has(k))).map(([l, ks, unit, what]) => ({ tex: Panel.tex(l, '0'), unit, title: what,
      comps: [...ks.map((k) => box(byKey.get(k))), { isInput: false, isFixed: true, value: '0', title: 'The bench is a plane: z is always 0' }].map((c, i) => ({ ...c, sep: i < 2 ? ',' : '' })) }));
    const inVec = new Set(vecFields.length ? vecKeys.flatMap(([, ks]) => ks) : []);
    const selFields = specs.filter((s) => !inVec.has(s.key)).map(box);
    const selChips = []; for (const g of el.choices()) { selChips.push({ isHead: true, isChip: false, label: g.label, style: UI.chipHead });
      for (const it of g.items) selChips.push({ isHead: false, isChip: true, label: it.label, title: it.title || '', style: UI.chip(!!it.on), onClick: app.run(() => b.pick(it)) }); }
    const tip = st.tip || null, setTip = (k) => { if ((this.ui.tip || null) !== k) app.setState({ tip: k }); };
    let note = Panel.NOTES[el.type] || '', forceRows = [], netText = '', motionRows = [], forceHead = '';
    if (el instanceof Block) { const body = w.body(el.id), L = b.scene.labels(), list = [];
      for (const f of w.forcesOn(el.id)) { const k = f.kind + '|' + (f.by ? f.by.id : ''), e = list.find((x) => x.k === k); if (e) e.F = V.add(e.F, f.F); else list.push({ k, kind: f.kind, F: { ...f.F }, by: f.by }); }
      forceHead = 'Forces on ' + L.get(el.id) + (b.started ? ' at t = ' + Fmt.time(b.time) : '');
      forceRows = list.map((f, i) => { const [l, sub] = Panel.SYM[f.kind] || ['?', ''], what = Panel.WHAT[f.kind] + (f.kind === 'applied' ? '' : f.by ? ' from ' + (L.get(f.by.id) || f.by.name) : ' (gravity)');
        return Panel.vec(l, sub, Fmt.vec(f.F), 'N', { col: Panel.INK[f.kind], what: what.charAt(0).toUpperCase() + what.slice(1), mag: Fmt.N(V.len(f.F)), key: 'f' + i + f.k, tip, setTip }); });
      // (hidden, not even which forces act: naming them is half of drawing the free-body diagram)
      if (hide) forceRows = [];
      if (body && !body.gone) { const a = w.accel(el.id), net = V.mul(a, body.m);
        if (hide) netText = 'Forces hidden: draw the free-body diagram, then press Show forces.';
        else motionRows.push(Panel.vec('F', '', Fmt.vec(net), 'N', { pre: 'Σ', what: 'Net force: the vector sum of the forces above', mag: Fmt.N(V.len(net)), magL: 'F', magS: 'net', tip, setTip }), Panel.vec('a', '', Fmt.vec(a, 5e-5), 'm/s²', { what: 'Acceleration: the net force divided by the mass', mag: Fmt.acc(V.len(a)), tip, setTip }));
        motionRows.push(Panel.vec('v', '', Fmt.vec(body.v, 5e-5), 'm/s', { what: 'Velocity', mag: Fmt.vel(V.len(body.v)), magL: 'v', tip, setTip }), Panel.vec('r', '', Fmt.vec(body.p, 5e-4), 'm', { what: 'Position of its centre, from the origin', tip, setTip })); }
      else if (body && body.gone) netText = 'It has left the bench. Press ↺ to start again.'; }
    if (el instanceof Rope) { const r = w.sol.ropes.find((x) => x.rope.id === el.id); note += hide ? '' : r ? '  Tension now: ' + Fmt.N(r.T) + (r.taut ? '' : ' (slack)') + '.' : ''; }
    if (el instanceof Spring) { const pa = w.posOf(el.from), pb = w.posOf(el.to); if (pa && pb) { const x = V.dist(pa, pb) - el.rest; note += '  Now ' + (Math.abs(x) < 5e-4 ? 'at its natural length' : (x > 0 ? 'stretched ' : 'compressed ') + Fmt.m(Math.abs(x))) + (hide ? '.' : ', so F_sp = ' + Fmt.N(el.k * Math.abs(x)) + '.'); } }
    if (el instanceof Surface && el.kind === 'Ramp') note += '  Slope ' + Fmt.deg(el.slope, 1) + '.';
    return { ...none, hasSel: true, noSel: false, selKind: el.kind, selLabel: b.scene.label(el), selFields, vecFields, hasVecs: vecFields.length > 0, selChips, hasChips: selChips.length > 0, selNote: note,
      hasForces: el instanceof Block, forceRows, forceHead, netText, motionRows, canTurn: el instanceof Surface || el instanceof Push, canCopy: !el.isLink,
      onRotL: app.run(() => b.rotate(15)), onRotR: app.run(() => b.rotate(-15)), onDup: app.run(() => b.duplicate()), onDelete: app.run(() => b.remove()) }; }

  // ---- every block's motion, and gravity ----
  motion() { const app = this.app, b = this.bench, w = b.world, L = b.scene.labels(), hide = b.hidden;
    const blockList = w.bodies.map((body) => { const a = w.accel(body.id), sel = b.selId === body.id;
      const vecs = body.gone || sel ? [] : [Panel.vec('a', '', hide ? Fmt.HIDDEN : Fmt.vec(a, 5e-5), 'm/s²', { size: 13 }), Panel.vec('v', '', Fmt.vec(body.v, 5e-5), 'm/s', { size: 13 })];
      return { label: L.get(body.id), mass: Fmt.kg(body.m), gone: body.gone ? 'gone' : '', vecs,
        swatch: 'width:11px;height:11px;border-radius:3px;flex:none;background:' + body.el.colour + ';', onSelect: app.run(() => b.select(body.el)),
        rowStyle: 'display:flex;flex-wrap:wrap;align-items:center;column-gap:8px;row-gap:1px;padding:5px 9px;border-radius:9px;cursor:pointer;border:1px solid ' + (sel ? '#bf8a1e' : '#eceef0') + ';background:#fff;' }; });
    const gItems = Panel.G.map(([g, name]) => ({ label: name, title: 'g = ' + g + ' m/s²', style: UI.chip(Math.abs(b.scene.opts.g - g) < 1e-9).replace('padding:4px 10px', 'padding:2px 7px').replace('font-size:11px', 'font-size:10.5px'), onClick: app.run(() => b.setG(g)) }));
    return { hasBlocks: blockList.length > 0, noBlocks: blockList.length === 0, blockList, gItems, gText: 'g = ' + Fmt.num(b.scene.opts.g, 2) + ' m/s²' }; }

  summary() { const b = this.bench, sc = b.scene, w = b.world; if (sc.isEmpty) return { statusText: 'empty', summaryText: 'Nothing on the bench yet.' };
    const counts = new Map(); for (const el of sc.els) counts.set(el.kind, (counts.get(el.kind) || 0) + 1);
    let text = 'On the bench: ' + [...counts].map(([k, n]) => n + ' ' + (n === 1 ? k.toLowerCase() : k.toLowerCase().replace(/y$/, 'ie') + 's')).join(', ') + '.';
    if (!sc.blocks.length) text += ' Add a block: nothing here can move.';
    else if (w.stopped) text += ' The clock has stopped: ' + w.stopped.text + '.';
    else if (!b.started) text += ' Press ▶ Run to let go.';
    const still = w.bodies.every((x) => x.gone || (V.len(x.v) < 1e-6 && V.len(w.accel(x.id)) < 1e-6));
    if (sc.blocks.length && still && !b.hidden) text += ' Everything is in equilibrium: the forces on each block add to zero.';
    return { statusText: b.playing ? 'running' : b.started ? 'paused' : 'set up', summaryText: text }; }

  share() { const app = this.app, st = this.ui;
    return { showShare: !!st.showShare, onCloseShare: () => app.setState({ showShare: false }), shareUrl: st.showShare ? ShareLink.url(this.bench.scene, st.shareHide) : '', onCopyShare: () => app.copyShare(), copyLabel: st.shareCopied ? 'Copied' : 'Copy',
      copyBtnStyle: "min-width:86px;flex:none;font-family:'Source Sans 3',sans-serif;font-size:12px;font-weight:700;padding:9px 15px;border-radius:8px;cursor:pointer;border:1px solid " + (st.shareCopied ? '#2f8f56' : 'rgba(224,184,90,0.5)') + ';background:' + (st.shareCopied ? '#2f8f56' : 'rgba(191,138,30,0.3)') + ';color:#fff;',
      shareHide: !!st.shareHide, onToggleShareHide: () => app.setState((s) => ({ shareHide: !s.shareHide, shareCopied: false })), selectAll: (e) => e.target.select() }; }


  info() { const app = this.app;
    return { showInfo: !!this.ui.showInfo, onCloseInfo: () => app.setState({ showInfo: false }), infoFormulas: [
      { expr: '\\sum \\vec F = m\\vec a', desc: 'Newton’s second law: the net force on each block sets its acceleration' },
      { expr: 'w = mg', desc: 'weight: the gravitational force of the Earth (or Moon, Mars, Jupiter)' },
      { expr: 'f_s \\le \\mu_s n', desc: 'static friction: as big as it needs to be to stop sliding, up to a limit' },
      { expr: 'f_k = \\mu_k n', desc: 'kinetic friction, against the sliding' },
      { expr: 'F_{\\text{sp}} = k\\,|\\Delta s|', desc: 'Hooke’s law: a spring’s force grows with its stretch or compression' },
      { expr: '\\vec F_{A\\text{ on }B} = -\\vec F_{B\\text{ on }A}', desc: 'Newton’s third law: blocks in contact push on each other equally and oppositely' }] }; }

  bugForm() { const app = this.app, st = this.ui, res = st.bugResult || '';
    return { showBug: !!st.showBug, onCloseBug: () => app.setState({ showBug: false }), stopBug: (e) => e.stopPropagation(), onBugText: (e) => app.setState({ bugText: e.target.value }), onBugEmail: (e) => app.setState({ bugEmail: e.target.value }),
      onSubmitBug: () => app.submitBug(), bugBtnLabel: st.bugSending ? 'Sending…' : 'Send report',
      bugBtnStyle: "flex:none;font-family:'Source Sans 3',sans-serif;font-size:12px;font-weight:700;padding:9px 15px;border-radius:8px;cursor:pointer;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.14);color:#fff;opacity:" + (st.bugSending ? '0.6' : '1') + ';',
      bugMsg: res.replace(/^(ok|err):/, ''), bugMsgColor: res.slice(0, 3) === 'ok:' ? '#7fd1a4' : '#f0a5a5' }; }
}
