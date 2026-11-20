// =====================================================================
// Panel -- the page around the canvas. Turns the workbench into the values
// the template binds to (toolbar, the selected-element card, the list of
// images, the summary, the overlays). It reads the model and calls back
// into the app; it never changes the bench itself.
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
  chipHead: 'width:100%;font-size:9px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#9aa2ab;margin-top:3px;',
  // the little pictures in the Add menu
  icon(inner) { const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 14" width="24" height="14">' + inner + '</svg>';
    return "width:24px;height:14px;display:inline-block;flex:none;background-repeat:no-repeat;background-position:center;background-size:contain;background-image:url('data:image/svg+xml," + encodeURIComponent(svg) + "');"; },
};
UI.S0 = 'stroke="#6b5a2a" fill="none" stroke-linecap="round" stroke-linejoin="round"';       // (no width: an attribute given twice is not SVG, and the picture is then blank)
UI.S = UI.S0 + ' stroke-width="1.5"';
UI.G = 'stroke="#3b7fb8" stroke-width="1.5" fill="#dcecf9" stroke-linejoin="round"';
UI.ray = (d, c) => '<path stroke="' + c + '" stroke-width="1.5" fill="none" stroke-linecap="round" d="' + d + '"/>';
UI.hatch = '<path stroke="#6b5a2a" stroke-width="1" fill="none" d="M13,3.5 L16,1.5 M13,6.5 L16,4.5 M13,9.5 L16,7.5 M13,12.5 L16,10.5"/>';
UI.icons = {
  laser: UI.icon('<rect x="1" y="4" width="9" height="6" rx="1" ' + UI.S + '/>' + UI.ray('M10,7 L23,7', '#d2362c')),
  white: UI.icon('<rect x="1" y="4" width="9" height="6" rx="1" ' + UI.S + '/>' + UI.ray('M10,5.6 L23,5.6', '#d2362c') + UI.ray('M10,7 L23,7', '#2f9e4a') + UI.ray('M10,8.4 L23,8.4', '#2c62d2')),
  beam: UI.icon('<path ' + UI.S0 + ' stroke-width="2.4" d="M3,1.5 L3,12.5"/>' + UI.ray('M5,3 L23,3 M5,7 L23,7 M5,11 L23,11', '#c98a12')),
  object: UI.icon('<path ' + UI.S0 + ' stroke-width="1.8" d="M12,13 L12,2 M8.5,5.5 L12,2 L15.5,5.5"/>'),
  lamp: UI.icon('<circle cx="4" cy="7" r="2.6" fill="#e0a92c" stroke="#6b5a2a" stroke-width="1"/>' + UI.ray('M8,5.6 L23,1.5 M8.4,7 L23,7 M8,8.4 L23,12.5', '#c98a12')),
  'lens+': UI.icon('<path ' + UI.G + ' d="M12,1 Q17,7 12,13 Q7,7 12,1 Z"/>'),
  'lens-': UI.icon('<path ' + UI.G + ' d="M8.5,1 L15.5,1 Q12.4,7 15.5,13 L8.5,13 Q11.6,7 8.5,1 Z"/>'),
  flat: UI.icon('<path ' + UI.S0 + ' stroke-width="2" d="M12.5,1 L12.5,13"/>' + UI.hatch),
  concave: UI.icon('<path ' + UI.S0 + ' stroke-width="2" d="M10.5,1 Q15,7 10.5,13"/>' + UI.hatch),
  convex: UI.icon('<path ' + UI.S0 + ' stroke-width="2" d="M13.5,1 Q9,7 13.5,13"/>' + UI.hatch),
  prism: UI.icon('<path ' + UI.G + ' d="M12,1.2 L19,12.8 L5,12.8 Z"/>'),
  block: UI.icon('<rect x="6" y="2" width="12" height="10" ' + UI.G + '/>'),
  half: UI.icon('<path ' + UI.G + ' d="M4.5,11.5 A7.5,7.5 0 0 1 19.5,11.5 Z"/>'),
  screen: UI.icon('<path stroke="#6b5a2a" stroke-width="3" fill="none" d="M12,1 L12,13"/>'),
};

class Panel {
  // what the View menu offers (the switches themselves live in the scene, so they travel in a share link)
  static VIEW = [
    ['images', 'Images', 'Mark where rays really cross (a real image) or only seem to come from (a virtual image)'],
    ['extend', 'Extended rays', 'Carry every bent ray backwards as a dashed line'],
    ['angles', 'Angles at surfaces', 'For a single ray: the normal at each surface and the angle on either side of it'],
    ['partial', 'Partial reflections', 'Also draw the faint ray that reflects whenever light crosses a glass surface'],
    ['grid', 'Grid', 'The centimetre grid'],
  ];
  // a line under the numbers on the card, for each kind of element
  static NOTES = {
    laser: 'One ray. Turn on View ▸ Angles at surfaces to read its angle at every surface it meets.',
    beam: 'Parallel rays: light from a very distant object.',
    lamp: 'One point of an object. Its rays fan out through Spread, centred on Angle.',
    object: 'Rays leave its tip, the end with the gold handle; drag the handle to turn it about its foot. Its image is drawn whole, so you can see if it is upright or inverted.',
    mirror: 'Curved: drag F or C to change f. Drag F behind the mirror and it becomes convex.',
    prism: 'Index n is for yellow light (589 nm). Dispersion is n for violet (400 nm) minus n for red (700 nm).',
    block: 'Index n is for yellow light (589 nm). Dispersion is n for violet (400 nm) minus n for red (700 nm).',
    half: 'Aim a ray at the centre of the flat face: it crosses the curved face without bending, so only the flat face refracts it.',
    screen: 'Stops the light. The dots show where each ray lands.',
  };

  constructor(app) { this.app = app; }
  get bench() { return this.app.bench; }
  get ui() { return this.app.state; }

  all() { return { ...this.header(), ...this.toolbar(), ...this.canvas(), ...this.inspector(), ...this.images(), ...this.summary(), ...this.share(), ...this.info(), ...this.bugForm(), stop: (e) => e.stopPropagation() }; }

  // a number for KaTeX: at most d decimals, an ordinary minus sign (KaTeX sets it as a true minus)
  static tex(x, d) { if (!isFinite(x)) return (x < 0 ? '-' : '') + '\\infty'; const p = Math.pow(10, d == null ? 1 : d), r = Math.round(x * p) / p; return String(r === 0 ? 0 : r); }
  static plural(n, word) { const w = word.toLowerCase(); return n + ' ' + (n === 1 ? w : /s$/.test(w) ? w + 'es' : w + 's'); }

  // ---- title bar: hide / show rays, the menu ----
  header() { const app = this.app, st = this.ui, b = this.bench, set = (p) => () => app.setState(p);
    const row = (a) => "display:flex;align-items:center;gap:8px;width:100%;font-family:'Source Sans 3',sans-serif;font-size:12.5px;font-weight:600;color:#dbe6ef;background:" + (a ? 'rgba(191,138,30,0.36)' : 'transparent') + ';border:none;border-radius:7px;padding:8px 9px;cursor:pointer;text-align:left;';
    const side = (a) => "display:flex;align-items:center;gap:9px;width:100%;font-family:'Source Sans 3',sans-serif;font-size:13px;font-weight:600;color:#dbe6ef;background:" + (a ? 'rgba(191,138,30,0.36)' : 'rgba(255,255,255,0.05)') + ';border:1px solid ' + (a ? 'rgba(224,184,90,0.6)' : 'rgba(255,255,255,0.08)') + ';border-radius:8px;padding:9px 11px;cursor:pointer;text-align:left;';
    const dot = (a) => (a ? 'display:inline-block;width:7px;height:7px;border-radius:50%;background:#e0b85a;flex:none;' : 'display:inline-block;width:7px;height:7px;flex:none;');
    const mk = (icon, label, onClick, active) => ({ icon, label, onClick, rowStyle: row(active), sideStyle: side(active), dotStyle: dot(active) });
    const menuItems = [
      mk('←', 'All sims', () => { try { window.open('../', '_blank', 'noopener'); } catch (e) {} }),
      mk('ⓘ', 'Info', () => app.setState((s) => ({ showInfo: !s.showInfo, menuOpen: false })), !!st.showInfo),
      mk('↺', 'Clear bench', () => { b.clear(); app.setState({ menuOpen: false }); }),
      mk('↗', 'Share link', () => app.setState({ showShare: true, menuOpen: false, shareCopied: false, shareHide: b.hidden })),      // the box starts as the sim is now
      mk('🐞', 'Submit bug', set({ showBug: true, menuOpen: false, bugText: '', bugEmail: '', bugResult: '', bugSending: false })),
    ];
    return { big: app.big, menuItems, variantNote: 'An open bench for ray tracing', showMenuBtn: !app.big, menuOpen: !!st.menuOpen, onToggleMenu: () => app.setState((s) => ({ menuOpen: !s.menuOpen, addOpen: false, presetsOpen: false, viewOpen: false })), onCloseMenu: set({ menuOpen: false }),
      menuBtnStyle: 'display:flex;align-items:center;justify-content:center;width:32px;height:30px;font-size:16px;border-radius:8px;cursor:pointer;border:1px solid ' + (st.menuOpen ? 'rgba(224,184,90,0.7)' : 'rgba(255,255,255,0.28)') + ';background:' + (st.menuOpen ? 'rgba(191,138,30,0.32)' : 'rgba(255,255,255,0.08)') + ';color:#cfe0f2;',
      hideLabel: b.hidden ? 'Show rays' : 'Hide rays', hideTitle: b.hidden ? 'Show what the light does' : 'Hide everything past the first element, to predict it first', onToggleHide: app.run(() => b.hide(!b.hidden)) }; }

  // ---- toolbar: Add, Presets, View, New, undo / redo ----
  toolbar() { const app = this.app, st = this.ui, b = this.bench, shut = { addOpen: false, presetsOpen: false, viewOpen: false }, open = (k) => () => app.setState((s) => ({ ...shut, menuOpen: false, [k]: !s[k] })), close = () => app.setState(shut);
    // the Add menu: whole groups, in two columns of about the same length
    const groups = []; for (const m of ADD_MENU) { let g = groups.find((x) => x.name === m.group); if (!g) groups.push((g = { name: m.group, rows: [] })); g.rows.push(m); }
    const half = Math.ceil(groups.reduce((n, g) => n + g.rows.length + 1, 0) / 2), addItems = []; let col = 1, row = 1;
    for (const g of groups) { if (col === 1 && row > 1 && row + g.rows.length > half + 1) { col = 2; row = 1; }
      const cell = () => 'grid-column:' + col + ';grid-row:' + (row++) + ';';
      addItems.push({ header: true, isBtn: false, label: g.name, rowStyle: UI.header + cell() });
      for (const m of g.rows) addItems.push({ header: false, isBtn: true, label: m.label, title: m.hint, iconStyle: UI.icons[m.key] || '', iconText: '', rowStyle: UI.row + cell(), onClick: () => { b.add(m.key); close(); } }); }
    const presetItems = PRESETS.map((p) => ({ label: p.label, title: p.note, rowStyle: UI.row, onClick: () => { b.loadPreset(p.key); close(); } }));
    const viewItems = Panel.VIEW.map(([key, label, title]) => ({ label, title, mark: b.scene.opts[key] ? '✓' : '', rowStyle: UI.row, onClick: app.run(() => b.toggle(key)) }));
    return { addBtnStyle: UI.drop(!!st.addOpen), addOpen: !!st.addOpen, onToggleAdd: open('addOpen'), onCloseAdd: close, addItems,
      presetBtnStyle: UI.drop(!!st.presetsOpen), presetsOpen: !!st.presetsOpen, onTogglePresets: open('presetsOpen'), onClosePresets: close, presetItems,
      viewBtnStyle: UI.drop(!!st.viewOpen), viewOpen: !!st.viewOpen, onToggleView: open('viewOpen'), onCloseView: close, viewItems,
      onNew: app.run(() => b.clear()),
      realOn: !!b.scene.opts.real, onToggleReal: app.run(() => b.toggle('real')), chromaOn: !!b.scene.opts.chroma, onToggleChroma: app.run(() => b.toggle('chroma')),
      realTitle: b.scene.opts.real ? 'Real: lenses and mirrors have truly spherical surfaces, so rays far from the axis miss the focus. Untick for ideal ones' : 'Make every lens and curved mirror real: truly spherical surfaces, with spherical aberration',
      chromaTitle: b.scene.opts.chroma ? 'Chromatic: the glass of each lens disperses, so each colour has its own focal length. Untick for none' : 'Let the glass of every lens disperse: each colour gets its own focal length (chromatic aberration)',
      undoStyle: UI.step(b.history.canUndo), redoStyle: UI.step(b.history.canRedo), onUndo: app.run(() => b.undo()), onRedo: app.run(() => b.redo()) }; }

  canvas() { const app = this.app, b = this.bench, zoom = (label, title, fn) => ({ label, title, style: UI.zoom, onClick: app.run(fn) });
    return { setCanvas: app.setCanvas,
      zoomBoxStyle: 'position:absolute;bottom:10px;right:10px;display:flex;align-items:center;gap:4px;background:rgba(15,23,34,0.78);border:1px solid rgba(255,255,255,0.14);border-radius:8px;padding:4px;',
      toolBtns: [{ label: '📏 Tape', title: b.measure.tape ? 'Put the tape measure away' : 'A tape measure: drag either end to pull it out, drag the tape to move it', style: UI.tool(!!b.measure.tape), onClick: app.run(() => b.toggleTape()) },
        { label: '∠ Angle', title: b.measure.angleOn ? 'Stop measuring angles' : 'Measure an angle: click two lines (rays, mirrors, lens planes, glass faces or the tape)', style: UI.tool(b.measure.angleOn), onClick: app.run(() => b.toggleAngle()) }],
      zoomBtns: [zoom('−', 'Zoom out', () => { b.view.zoomBy(1 / 1.25); b.dirty = true; }), zoom('⤡', 'Fit everything in view', () => b.fit()), zoom('+', 'Zoom in', () => { b.view.zoomBy(1.25); b.dirty = true; })],
      zoomPct: b.view.percent }; }

  // ---- the selected element ----
  inspector() { const app = this.app, b = this.bench, el = b.selected, st = this.ui;
    const none = { hasSel: false, noSel: true, selKind: '', selLabel: '', selFields: [], selChips: [], hasChips: false, selNote: '', hasLog: false, selLog: [], selLogHead: '',
      noSelText: b.scene.isEmpty ? 'Use + Add Element to put a light source on the bench, then lenses, mirrors or glass in its way. Or start from a preset.' : 'Click an element to see and change its numbers. Drag it to move it; drag its gold handle to turn it.',
      onRotL: () => {}, onRotR: () => {}, onDup: () => {}, onDelete: () => {} };
    if (!el) return none;
    const d = st.draft, text = (k) => (d && d.id === el.id && d.field === k ? d.text : String(el[k]));
    const selFields = el.fields().map((s) => ({ label: s.label, unit: s.unit || '', value: text(s.key), min: s.min, max: s.max, step: s.step, onChange: (e) => app.typeField(s.key, e.target.value), onBlur: () => app.endField(false) }));
    const selChips = []; for (const g of el.choices()) { selChips.push({ isHead: true, isChip: false, label: g.label, style: UI.chipHead });
      for (const it of g.items) selChips.push({ isHead: false, isChip: true, label: it.label, title: it.title || '', style: UI.chip(!!it.on), onClick: app.run(() => b.pick(it)) }); }
    const note = el instanceof Mirror ? (el.flat ? 'The reflecting side is the bright one; the hatched back absorbs light.' : el.sphere ? 'A truly spherical surface: rays far from the axis miss the focal point (spherical aberration). Untick Real for an ideal mirror.' : 'An ideal mirror: every ray obeys the mirror equation. Tick Real to see what a truly spherical one does.')
      : el instanceof Lens ? Panel.lensNote(el) : el instanceof Figure && !el.principal && el.rays === 'principal' ? 'No lens or curved mirror in front of it to draw principal rays for (or its tip is on the axis), so it sends a fan.' : Panel.NOTES[el.type] || '';
    const log = b.hidden || !(el instanceof Laser) ? [] : this.log(el);
    return { ...none, hasSel: true, noSel: false, selKind: el.kind, selLabel: b.scene.label(el), selFields, selChips, hasChips: selChips.length > 0, selNote: note,
      hasLog: log.length > 0, selLog: log, selLogHead: 'What the ray does' + (el.white ? ' (angles for yellow, 589 nm)' : ''),
      onRotL: app.run(() => b.rotate(15)), onRotR: app.run(() => b.rotate(-15)), onDup: app.run(() => b.duplicate()), onDelete: app.run(() => b.remove()) }; }

  static lensNote(el) { const glass = ' Index n is for yellow light (589 nm)' + (el.chroma ? '; Dispersion is n for violet minus n for red.' : '.');
    if (el.real) { const s = el.form, cap = s.capped ? ' A lens this strong cannot be taller than ' + Fmt.cm(2 * s.h) + ': its faces would meet.' : '';
      return 'A real glass lens: two spherical faces of radius ' + Fmt.cm(s.R) + ', refracting by Snell’s law. Rays near the axis focus at F; rays far from it focus nearer (spherical aberration).' + cap + glass; }
    if (el.chroma) return 'An ideal thin lens whose glass disperses: f is for yellow light, and violet focuses nearer than red (chromatic aberration).' + glass;
    return 'An ideal thin lens: every ray obeys the thin-lens equation, however far it is from the axis. Drag either F to change f (through the lens, it turns diverging). Tick Real to see what a glass one does.'; }

  // what a single ray meets, surface by surface: "Block 1   θ₁ = 40.0°, θ₂ = 25.1°"
  log(el) { const b = this.bench, L = b.scene.labels(), path = b.result.paths.find((p) => p.src === el.id), out = []; if (!path) return out;
    const deg = (x) => x.toFixed(1) + '^\\circ';
    // in glass that disperses, the index this colour feels is not quite the one printed on the glass: say so
    const felt = (h) => { const n = Math.max(h.n1, h.n2); return h.el.glassy && Math.abs(n - h.el.n) >= 5e-4 ? ', where n = ' + n.toFixed(3) + ' for ' + (el.white ? 'yellow' : path.nm + ' nm') + ' light' : ''; };
    for (const h of path.hits.slice(0, 6)) { const where = L.get(h.el.id) || h.el.name; let tex = '', note = '';
      if (h.how === 'refract') { tex = '\\theta_1 = ' + deg(h.th1) + ',\\quad \\theta_2 = ' + deg(h.th2); note = h.inside ? 'into the glass' + felt(h) : 'out of the glass'; }
      else if (h.how === 'tir') { const c = Angle.deg(Math.asin(Math.min(1, h.n2 / h.n1))); tex = '\\theta_1 = ' + deg(h.th1) + ' > \\theta_c = ' + deg(c); note = 'total internal reflection' + felt(h); }
      else if (h.how === 'reflect') { if (h.th1 != null) tex = '\\theta_i = \\theta_r = ' + deg(h.th1); note = 'reflects'; }
      else if (h.how === 'lens') note = 'bent by the lens';
      else if (h.how === 'screen') note = 'stops here';
      else if (h.how === 'back') note = 'absorbed by the back';
      else note = h.how || '';
      out.push({ where, tex, hasTex: !!tex, note }); }
    if (path.hits.length > 6) out.push({ where: '…', tex: '', hasTex: false, note: 'and ' + Panel.plural(path.hits.length - 6, 'more surface') });
    if (!path.hits.length) out.push({ where: '', tex: '', hasTex: false, note: 'It meets nothing.' });
    return out; }

  // ---- images ----
  images() { const b = this.bench, L = b.scene.labels(), empty = { hasImages: false, imageList: [], imagesMore: '' };
    if (b.hidden) return { ...empty, noImagesText: 'Hidden while the rays are hidden.' };
    const imgs = b.result.images, bundles = b.scene.els.some((e) => e instanceof Lamp || e instanceof Beam || e instanceof Figure);
    if (!imgs.length) return { ...empty, noImagesText: bundles ? 'No image: after the last element the rays neither cross at one point nor seem to spread from one.' : 'Images are found for objects, point sources and parallel beams: where their rays cross, or seem to come from.' };
    const T = Panel.tex, cm = (x) => T(x, 1) + (isFinite(x) ? '\\,\\text{cm}' : '');
    const imageList = imgs.slice(0, 5).map((im) => { const real = im.kind === 'real', by = L.get(im.el) || '';
      // (three short formulas, not one long one: a line may break between them but never inside one)
      const has = im.s != null && im.sp != null, hasM = has && im.m != null, texS = has ? 's = ' + cm(im.s) + ',' : '', texSp = has ? 's\' = ' + cm(im.sp) + (hasM ? ',' : '') : '', texM = hasM ? 'm = ' + T(im.m, 2) : '';
      // an object's image: how tall, and which way up (measured against the way the object stands)
      const obj = im.foot ? b.scene.get(im.src) : null, hp = obj ? V.dot(V.sub(im.p, im.foot), obj.across) : null, size = obj ? '; ' + (hp < 0 ? 'inverted' : 'upright') + ', ' + Fmt.cm(Math.abs(hp), 1) + ' tall' : '';
      return { label: (im.focus ? 'Focus ' : 'Image ') + im.no, kind: real ? 'real' : 'virtual', where: 'at ' + Fmt.point(im.p, 1) + ' cm' + (by ? ', from ' + by : '') + size, tex: [texS, texSp, texM].filter(Boolean).join('\\quad '), texS, texSp, texM, hasTex: has, hasM,
        dotStyle: 'width:11px;height:11px;border-radius:50%;flex:none;margin-top:3px;box-sizing:border-box;' + (real ? 'background:#d9a520;border:2px solid #d9a520;' : 'background:#fff;border:2px solid #d9a520;') }; });
    return { hasImages: true, imageList, imagesMore: imgs.length > 5 ? 'and ' + (imgs.length - 5) + ' more' : '', noImagesText: '' }; }

  // ---- the bench in a sentence or two ----
  summary() { const b = this.bench, sc = b.scene, r = b.result, st = r.stats; if (sc.isEmpty) return { statusText: 'empty', summaryText: 'Nothing on the bench yet.' };
    const counts = new Map(); for (const el of sc.els) counts.set(el.kind, (counts.get(el.kind) || 0) + 1);
    let text = 'On the bench: ' + [...counts].map(([k, n]) => Panel.plural(n, k)).join(', ') + '.';
    const rays = r.paths.length;
    if (!sc.sources.length) text += ' There is no light yet: add a light source.';
    else if (b.hidden) text += ' The rays are hidden past the first thing they meet. Predict where they go, then press Show rays.';
    else { if (st.tir) text += ' Total internal reflection happens here' + (st.tir === 1 ? '' : ' (' + st.tir + ' times, counting every ray)') + '.';
      if (st.trapped) text += ' Some light is trapped between surfaces and is not followed past ' + Tracer.MAX_HITS + ' of them.';
      if (st.capped) text += ' There is more light here than can be drawn: some rays were cut short.'; }
    return { statusText: rays === 1 ? '1 ray' : rays + ' rays', summaryText: text }; }

  // ---- overlays ----
  share() { const app = this.app, st = this.ui;
    return { showShare: !!st.showShare, onCloseShare: () => app.setState({ showShare: false }), shareUrl: st.showShare ? ShareLink.url(this.bench.scene, st.shareHide) : '', onCopyShare: () => app.copyShare(), copyLabel: st.shareCopied ? 'Copied' : 'Copy',
      copyBtnStyle: "min-width:86px;flex:none;font-family:'Source Sans 3',sans-serif;font-size:12px;font-weight:700;padding:9px 15px;border-radius:8px;cursor:pointer;border:1px solid " + (st.shareCopied ? '#2f8f56' : 'rgba(224,184,90,0.5)') + ';background:' + (st.shareCopied ? '#2f8f56' : 'rgba(191,138,30,0.3)') + ';color:#fff;',
      shareHide: !!st.shareHide, onToggleShareHide: () => app.setState((s) => ({ shareHide: !s.shareHide, shareCopied: false })), selectAll: (e) => e.target.select() }; }

  info() { const app = this.app;
    return { showInfo: !!this.ui.showInfo, onCloseInfo: () => app.setState({ showInfo: false }), infoFormulas: [
      { expr: '\\theta_r = \\theta_i', desc: 'law of reflection: both angles are measured from the normal' },
      { expr: 'n_1 \\sin\\theta_1 = n_2 \\sin\\theta_2', desc: 'Snell’s law of refraction' },
      { expr: '\\sin\\theta_c = \\dfrac{n_2}{n_1}', desc: 'critical angle: beyond it, light trying to leave the denser medium is totally reflected' },
      { expr: '\\dfrac{1}{s} + \\dfrac{1}{s\'} = \\dfrac{1}{f}', desc: 'thin-lens and mirror equation' },
      { expr: 'm = -\\dfrac{s\'}{s}', desc: 'lateral magnification: negative means inverted' },
      { expr: 'f = \\dfrac{R}{2}', desc: 'focal length of a spherical mirror, for rays near the axis' }] }; }

  bugForm() { const app = this.app, st = this.ui, res = st.bugResult || '';
    return { showBug: !!st.showBug, onCloseBug: () => app.setState({ showBug: false }), stopBug: (e) => e.stopPropagation(), onBugText: (e) => app.setState({ bugText: e.target.value }), onBugEmail: (e) => app.setState({ bugEmail: e.target.value }),
      onSubmitBug: () => app.submitBug(), bugBtnLabel: st.bugSending ? 'Sending…' : 'Send report',
      bugBtnStyle: "flex:none;font-family:'Source Sans 3',sans-serif;font-size:12px;font-weight:700;padding:9px 15px;border-radius:8px;cursor:pointer;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.14);color:#fff;opacity:" + (st.bugSending ? '0.6' : '1') + ';',
      bugMsg: res.replace(/^(ok|err):/, ''), bugMsgColor: res.slice(0, 3) === 'ok:' ? '#7fd1a4' : '#f0a5a5' }; }
}
