// =====================================================================
// Panel -- the page around the canvas: the three worlds and their presets,
// how bouncy collisions are, a latched spring, the bodies (each one's mass,
// r⃗₀ and v⃗₀), the before-and-now table, the momentum bars, the clock, the
// graphs, and the overlays. It reads the Lab and calls back into it.
// =====================================================================
const UI = {
  chip: (on) => "font-family:'Source Sans 3',sans-serif;font-size:11px;font-weight:600;padding:4px 10px;border-radius:999px;cursor:pointer;border:1px solid " + (on ? '#bf8a1e' : '#d7dbe0') + ';background:' + (on ? '#f6f0db' : '#fff') + ';color:' + (on ? '#7a5a12' : '#525a63') + ';',
  pick: (on) => "display:flex;align-items:center;gap:9px;width:100%;font-family:'Source Sans 3',sans-serif;font-size:12.5px;font-weight:600;padding:6px 10px;border-radius:8px;cursor:pointer;text-align:left;border:1px solid " + (on ? '#bf8a1e' : '#e4e8ec') + ';background:' + (on ? '#f6f0db' : '#fff') + ';color:' + (on ? '#6b4f10' : '#3a414a') + ';',
  tab: (on) => "flex:1;font-family:'Source Sans 3',sans-serif;font-size:11.5px;font-weight:700;padding:4px 6px;border-radius:999px;cursor:pointer;border:1px solid " + (on ? '#bf8a1e' : '#e4e8ec') + ';background:' + (on ? '#f6f0db' : '#fff') + ';color:' + (on ? '#6b4f10' : '#525a63') + ';',
  tool: (on) => 'font-size:11px;font-weight:700;height:24px;padding:0 8px;display:flex;align-items:center;gap:3px;border-radius:6px;cursor:pointer;white-space:nowrap;border:1px solid ' + (on ? 'rgba(240,200,96,0.8)' : 'rgba(255,255,255,0.18)') + ';background:' + (on ? 'rgba(191,138,30,0.45)' : 'rgba(255,255,255,0.07)') + ';color:' + (on ? '#fff3cf' : '#d7dee5') + ';',
  zoom: 'font-size:12px;font-weight:700;min-width:24px;height:24px;padding:0 5px;display:flex;align-items:center;justify-content:center;border-radius:6px;cursor:pointer;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#d7dee5;',
  body: (on, col) => "font-family:'Source Sans 3',sans-serif;font-size:11.5px;font-weight:700;padding:2px 10px;border-radius:999px;cursor:pointer;border:2px solid " + (on ? col : '#e1e5e9') + ';background:' + (on ? '#fff' : '#f6f8fa') + ';color:' + col + ';',
};

class Panel {
  static INFO = 'Click a body to edit it. Before ▶ Run, drag a body to move it, or drag the tip of its arrow to set its velocity.';
  constructor(app) { this.app = app; }
  get lab() { return this.app.lab; }
  get ui() { return this.app.state; }
  all() { return { ...this.header(), ...this.worlds(), ...this.collisions(), ...this.charge(), ...this.bodies(), ...this.table(), ...this.bars(), ...this.canvas(), ...this.share(), ...this.info(), ...this.bugForm(), stop: (e) => e.stopPropagation() }; }
  static tag(b) { return b.name.length <= 2 ? b.name : b.name.indexOf('Star ') === 0 ? b.name.slice(5) : b.name; }
  // a body's colour, dark enough to read on white
  static ink(col) { return G3.dark(col, 0.3); }
  static sub(b) { return '_{\\text{' + Panel.tag(b) + '}}'; }

  header() { const app = this.app, st = this.ui, s = this.lab;
    const row = (a) => "display:flex;align-items:center;gap:8px;width:100%;font-family:'Source Sans 3',sans-serif;font-size:12.5px;font-weight:600;color:#dbe6ef;background:" + (a ? 'rgba(191,138,30,0.36)' : 'transparent') + ';border:none;border-radius:7px;padding:8px 9px;cursor:pointer;text-align:left;';
    const side = (a) => "display:flex;align-items:center;gap:9px;width:100%;font-family:'Source Sans 3',sans-serif;font-size:13px;font-weight:600;color:#dbe6ef;background:" + (a ? 'rgba(191,138,30,0.36)' : 'rgba(255,255,255,0.05)') + ';border:1px solid ' + (a ? 'rgba(224,184,90,0.6)' : 'rgba(255,255,255,0.08)') + ';border-radius:8px;padding:9px 11px;cursor:pointer;text-align:left;';
    const dot = (a) => (a ? 'display:inline-block;width:7px;height:7px;border-radius:50%;background:#e0b85a;flex:none;' : 'display:inline-block;width:7px;height:7px;flex:none;');
    const mk = (icon, label, onClick, active) => ({ icon, label, onClick, rowStyle: row(active), sideStyle: side(active), dotStyle: dot(active) });
    const menuItems = [mk('←', 'All sims', () => { try { window.open('../', '_blank', 'noopener'); } catch (e) {} }), mk('ⓘ', 'Info', () => app.setState((x) => ({ showInfo: !x.showInfo, menuOpen: false })), !!st.showInfo),
      mk('↗', 'Share link', () => app.setState({ showShare: true, menuOpen: false, shareCopied: false, shareHide: s.hidden })), mk('🐞', 'Submit bug', () => app.setState({ showBug: true, menuOpen: false, bugText: '', bugEmail: '', bugResult: '', bugSending: false }))];
    return { big: app.big, menuItems, menuOpen: !!st.menuOpen, onToggleMenu: () => app.setState((x) => ({ menuOpen: !x.menuOpen })), onCloseMenu: () => app.setState({ menuOpen: false }),
      menuBtnStyle: 'display:flex;align-items:center;justify-content:center;width:32px;height:30px;font-size:16px;border-radius:8px;cursor:pointer;border:1px solid ' + (st.menuOpen ? 'rgba(224,184,90,0.7)' : 'rgba(255,255,255,0.28)') + ';background:' + (st.menuOpen ? 'rgba(191,138,30,0.32)' : 'rgba(255,255,255,0.08)') + ';color:#cfe0f2;',
      hideLabel: s.hidden ? 'Show values' : 'Hide values', hideTitle: s.hidden ? 'Show what happens: the arrows, the numbers after the start, and the graphs' : 'Hide what happens after the start (arrows, numbers, graphs), so students predict first', onToggleHide: app.run(() => s.hide(!s.hidden)) }; }

  worlds() { const app = this.app, s = this.lab, open = !!this.ui.presetsOpen;
    const modeTabs = Object.entries(MODES).map(([k, M]) => ({ label: M.icon + ' ' + M.label, title: M.what, style: UI.tab(k === s.mode), onClick: () => { s.load(k, PRESETS[k][0].key); app.setState({ presetsOpen: false }); app.refresh(); } }));
    const presetItems = PRESETS[s.mode].map((p) => ({ label: p.label, title: p.note, style: UI.pick(p.key === s.setup.preset && !s.setup.edited).replace('border:1px solid #e4e8ec', 'border:1px solid transparent'), onClick: () => { s.load(s.mode, p.key); app.setState({ presetsOpen: false }); app.refresh(); } }));
    const p = s.preset; return { modeTabs, presetItems, presetsOpen: open, presetName: (p ? p.label : 'Preset') + (s.setup.edited ? ' (changed)' : ''), onTogglePresets: () => app.setState((x) => ({ presetsOpen: !x.presetsOpen, menuOpen: false })), onClosePresets: () => app.setState({ presetsOpen: false }),
      presetBtnStyle: "display:flex;align-items:center;gap:8px;width:100%;font-family:'Source Sans 3',sans-serif;font-size:12.5px;font-weight:700;padding:6px 10px;border-radius:8px;cursor:pointer;text-align:left;border:1px solid " + (open ? '#bf8a1e' : '#d3d8dd') + ';background:' + (open ? '#f6f0db' : '#fff') + ';color:#3a414a;box-shadow:0 1px 2px rgba(0,0,0,0.05);',
      modeWhat: s.M.what, presetNote: s.setup.edited ? 'Changed from the preset. Pick it again to start afresh.' : p ? p.note : '' }; }

  collisions() { const app = this.app, s = this.lab, e = s.setup.e, sp = s.mode === 'space';
    const chips = (s.oneD ? [['Spring bumpers', 1], ['Soft bumpers', 0.6], ['Velcro', 0]] : [['Bouncy', 1], ['Partly', 0.7], ['Sticky', 0]]).map(([label, v]) => ({ label: label + (v === 1 || v === 0 ? '' : ' e = ' + v), title: 'e = ' + v, style: UI.chip(Math.abs(e - v) < 1e-9), onClick: app.run(() => s.setE(v)) }));
    const what = e >= 0.995 ? 'Elastic: all the kinetic energy comes back.' : e <= 0.005 ? 'Perfectly inelastic: they stick together.' : 'Inelastic: they separate at ' + Math.round(e * 100) + '% of the speed they came together at.';
    return { hasE: !sp, eChips: chips, eValue: String(e), eText: Fmt.fix(e, 2), onE: (ev) => { s.setE(ev.target.value); app.refresh(); }, eNote: what,
      hasSpaceNote: sp, spaceNote: sp ? (s.setup.gravity ? 'Gravity acts between every pair of bodies. If two bodies touch, they stick.' : 'Far from everything: no gravity worth counting.') : '' }; }

  charge() { const app = this.app, s = this.lab, c = s.setup.charges[0], d = this.ui.draft; if (!c) return { hasCharge: false, chargeFields: [] };
    const f = (key, label, tex, unit, v) => ({ label, tex, unit, text: d && d.key === 'charge.' + key ? d.text : Fmt.plain(v), onType: (e) => app.setState({ draft: { key: 'charge.' + key, text: e.target.value } }), onCommit: (e) => { const dr = app.state.draft; if (!dr || dr.key !== 'charge.' + key) return; s.setCharge(key, e.target.value); app.setState({ draft: null }); app.refresh(); } });
    return { hasCharge: true, chargeTitle: 'Spring between ' + c.a + ' and ' + c.b, chargeFields: [f('E', 'Energy stored in the spring', 'U', 'J', c.E), f('at', 'Let go at this time', 't', 's', c.at)] }; }

  // ---- the bodies, and the one selected ----
  bodies() { const app = this.app, s = this.lab, st = this.ui, d = st.draft, M = s.M, sel = s.sel ? s.body(s.sel) : null;
    const bodyChips = s.setup.bodies.map((b) => ({ label: b.name, style: UI.body(b.id === s.sel, Panel.ink(b.col)), onClick: app.run(() => s.select(b.id === s.sel ? null : b.id)) }));
    const out = { bodyChips, canAdd: s.setup.bodies.length < Lab.MAX, onAdd: app.run(() => s.add()), hasSel: !!sel, noSel: !sel, selNote: Panel.INFO, selFields: [], vecFields: [], selTitle: '', selCol: '#3a414a', canDelete: false, onDelete: () => {}, onDeselect: app.run(() => s.select(null)) };
    if (!sel) return out;
    const key = (k) => sel.id + '.' + k, text = (k, v) => (d && d.key === key(k) ? d.text : v), type = (k) => (e) => app.setState({ draft: { key: key(k), text: e.target.value } });
    // (a value is used when the box loses focus, or on Enter, and only if it was typed in)
    const done = (k, fn) => (e) => { const dr = app.state.draft; if (!dr || dr.key !== key(k)) return; fn(e.target.value); app.setState({ draft: null }); app.refresh(); };
    out.selTitle = sel.name + (sel.kind === 'rocket' ? ' (rocket)' : ''); out.selCol = Panel.ink(sel.col); out.canDelete = s.setup.bodies.length > 1; out.onDelete = app.run(() => s.remove(sel.id));
    out.selFields = s.fields(sel).map((f) => { const raw = f.rk ? sel.rocket[f.key] : sel[f.key]; return { label: f.label, tex: f.sym + (f.sub ? '_{\\text{' + f.sub + '}}' : ''), unit: f.unit, text: text(f.key, Fmt.plain(raw / f.k)), onType: type(f.key), onCommit: done(f.key, (v) => s.setField(sel.id, f.key, v)) }; });
    const vec = (l, which, keys, unit, what) => ({ tex: '\\vec ' + l + '_{0}', unit, title: what, comps: ['x', 'y', 'z'].map((c, i) => {
      const fixed = c === 'z' || (s.oneD && c === 'y'), raw = c === 'z' ? 0 : sel[keys[i]] / M.L;
      return { isInput: !fixed, isFixed: fixed, value: fixed ? '0' : text(which + c, Fmt.plain(raw)), title: c === 'z' ? 'Everything here is in a plane: z is always 0' : 'Carts on the track move along x only', onType: type(which + c), onCommit: done(which + c, (v) => s.setVec(sel.id, which, c, v)), sep: i < 2 ? ',' : '' }; }) });
    out.vecFields = [vec('r', 'r', ['x', 'y'], M.lu, 'starting position (of its centre)'), vec('v', 'v', ['vx', 'vy'], M.vu, 'starting velocity')];
    return out; }

  // ---- before and now ----
  table() { const s = this.lab, w = s.world, B = s.before, hide = s.hidden && !s.atStart, L = s.M.L, oneD = s.oneD, H = Fmt.HIDE;
    // (anything below a billionth of the biggest value of its kind is round-off: shown as 0)
    const pbig = Math.max(1e-30, V.len(B.P), ...B.bodies.map((b) => V.len(b.p)), ...w.main.map((b) => b.m * V.len(b.v)), V.len(w.Pex)), vbig = Math.max(1e-30, ...B.bodies.map((b) => V.len(b.v)), ...w.main.map((b) => V.len(b.v)));
    const vec = (v, k) => { const tiny = (k === 1 ? pbig : vbig) * 1e-9; return oneD ? Fmt.sig(Math.abs(v.x) < tiny ? 0 : v.x / k) : Fmt.vec(v, k, false, tiny); };
    const rows = [];
    const row = (tex, before, now) => { if (oneD) rows.push({ isTex: false, isPair: false, isHead: false, isRow: true, tex, before, now: hide ? H : now }); else rows.push({ isHead: false, isRow: false, isTex: true, tex }, { isHead: false, isRow: false, isPair: true, label: 'before', val: before }, { isHead: false, isRow: false, isPair: true, label: 'now', val: hide ? H : now }); };
    w.main.forEach((b, i) => { const b0 = B.bodies[i]; rows.push({ isTex: false, isPair: false, isHead: true, isRow: false, head: b.name + ' · ' + Fmt.q(b0.m, 'kg') + (b.rk ? ' → ' + (hide ? H : Fmt.q(b.m, 'kg')) : ''), headStyle: 'grid-column:1/-1;font-size:11px;font-weight:700;color:' + Panel.ink(b.col) + ';margin-top:4px;' });
      const sb = Panel.sub(b); row('\\vec v' + sb + (oneD ? '\\;(' + s.M.vu + ')' : ''), vec(b0.v, L), vec(b.v, L));
      if (!oneD) row('v' + sb + ',\\ \\theta', Fmt.q(V.len(b0.v) / L, s.M.vu) + (V.len(b0.v) > 1e-12 ? ', ' + Fmt.deg(V.deg(b0.v)) : ''), Fmt.q(V.len(b.v) / L, s.M.vu) + (V.len(b.v) > 1e-12 ? ', ' + Fmt.deg(V.deg(b.v)) : ''));
      row('\\vec p' + sb + (oneD ? '\\;(\\text{kg}\\cdot\\text{m/s})' : ''), vec(b0.p, 1), vec(V.mul(b.v, b.m), 1)); });
    if (w.hasRocket) { rows.push({ isTex: false, isPair: false, isHead: true, isRow: false, head: 'Exhaust · ' + (hide ? H : Fmt.q(w.mex, 'kg')), headStyle: 'grid-column:1/-1;font-size:11px;font-weight:700;color:#c07a2c;margin-top:4px;' }); row('\\vec p_{\\text{exhaust}}', vec(V.O, 1), vec(w.Pex, 1)); }
    rows.push({ isTex: false, isPair: false, isHead: true, isRow: false, head: 'Everything together', headStyle: 'grid-column:1/-1;font-size:11px;font-weight:700;color:#3a414a;margin-top:6px;border-top:1px dashed #e4e8ec;padding-top:5px;' });
    row('\\vec P_{\\text{total}}', vec(B.P, 1), vec(w.P, 1));
    row('K_{\\text{total}}', Fmt.q(B.K, 'J'), Fmt.q(w.K + (w.hasRocket ? w.Kex : 0), 'J'));
    const checks = [];
    if (!hide && !s.atStart) { const dP = V.len(V.sub(w.P, B.P)), scale = pbig;
      checks.push({ tex: '\\Delta \\vec P_{\\text{total}}', val: dP < 1e-9 * scale ? '0' : Fmt.q(dP, 'kg·m/s'), mark: dP < 1e-9 * scale ? '✓ momentum kept' : '' });
      const dK = w.K + (w.hasRocket ? w.Kex : 0) - B.K; if (!s.setup.gravity && Math.abs(dK) > 1e-9 * Math.max(1e-30, B.K) && !w.busy) checks.push({ tex: '\\Delta K', val: Fmt.q(dK, 'J'), mark: '', text: w.hasRocket ? 'from the fuel' : w.charges.length && dK > 0 ? 'from the spring' : dK < 0 ? 'to heat, sound, squashing' : '' });
      else if (!s.setup.gravity && !w.busy && B.K > 0) checks.push({ tex: '\\Delta K', val: '0', mark: '✓ elastic' });
      if (!oneD && w.main.length === 2 && V.len(w.main[0].v) > 1e-9 && V.len(w.main[1].v) > 1e-9 && !w.busy && !s.setup.gravity && w.main[0].g !== w.main[1].g) { let a = Math.abs(V.deg(w.main[0].v) - V.deg(w.main[1].v)); if (a > 180) a = 360 - a; checks.push({ tex: '\\text{angle between } \\vec v' + Panel.sub(w.main[0]) + ',\\ \\vec v' + Panel.sub(w.main[1]), val: Fmt.deg(a), mark: '' }); }
      for (const b of w.main) if (b.rk) { const dv = V.len(V.sub(b.v, b.rk.v0)) / L, ideal = b.rk.u * Math.log(b.rk.m0 / b.m) / L; checks.push({ tex: '\\Delta v' + Panel.sub(b) + ' \\;\\text{vs}\\; u \\ln\\frac{m_0}{m}', val: Fmt.q(dv, s.M.vu) + ' vs ' + Fmt.q(ideal, s.M.vu), mark: Math.abs(dv - ideal) < 1e-3 * Math.max(ideal, 1e-12) ? '✓ equal' : '' }); } }
    const cmv = V.mul(B.P, 1 / w.M); checks.push({ tex: '\\vec v_{\\text{cm}} = \\vec P/M', val: (oneD ? Fmt.sig(cmv.x / L) : Fmt.vec(cmv, L, false, 1e-9)) + ' ' + s.M.vu, mark: '' });
    // the brief table: one row per body on the track (v and p, before → now); on the table and in space, a v row and a p row per body
    // (speeds with their directions on the table; sizes only in space, where the numbers are long and the arrows show the directions)
    const arrow = (a, b) => a + ' → ' + (hide ? H : b), sp = s.mode === 'space', brief = [], nm = (b, m) => ({ name: Panel.tag(b), title: b.name + ', ' + Fmt.q(m, 'kg'), nameStyle: "font-family:'Source Sans 3',sans-serif;font-size:11px;font-weight:700;color:" + Panel.ink(b.col) + ';white-space:nowrap;' });
    const vdir = (v) => (V.len(v) < 1e-9 * vbig ? '0' : Fmt.sig(V.len(v) / L) + (sp ? '' : ' ∠' + Math.round(V.deg(v)) + '°')), pmag = (p) => (V.len(p) < 1e-9 * pbig ? '0' : Fmt.sig(V.len(p)) + (sp ? '' : ' ∠' + Math.round(V.deg(p)) + '°'));
    w.main.forEach((b, i) => { const b0 = B.bodies[i], pn = V.mul(b.v, b.m);
      if (oneD) brief.push({ ...nm(b, b0.m), isTex: false, isText: true, v: arrow(vec(b0.v, L), vec(b.v, L)), p: arrow(vec(b0.p, 1), vec(pn, 1)) });
      else brief.push({ ...nm(b, b0.m), isTex: true, isText: false, tex: '\\vec v', p: arrow(vdir(b0.v), vdir(b.v)) + ' ' + s.M.vu }, { name: '', title: '', nameStyle: '', isTex: true, isText: false, tex: '\\vec p', p: arrow(pmag(b0.p), pmag(pn)) }); });
    if (w.hasRocket) brief.push({ name: 'exhaust', title: 'The exhaust: ' + (hide ? H : Fmt.q(w.mex, 'kg')), nameStyle: "font-family:'Source Sans 3',sans-serif;font-size:11px;font-weight:700;color:#c07a2c;", isTex: !oneD, isText: oneD, tex: '\\vec p', v: '', p: arrow('0', oneD ? vec(w.Pex, 1) : pmag(w.Pex)) });
    const dP = V.len(V.sub(w.P, B.P)), kept = !hide && !s.atStart && dP < 1e-9 * pbig, tot = { name: 'Total', title: 'Everything together', nameStyle: "font-family:'Source Sans 3',sans-serif;font-size:11px;font-weight:700;color:#3a414a;" };
    if (oneD) brief.push({ ...tot, isTex: false, isText: true, v: Fmt.sig(B.cmv.x / L) + ' (cm)', p: arrow(vec(B.P, 1), vec(w.P, 1)) + (kept ? ' ✓' : '') });
    else brief.push({ ...tot, isTex: true, isText: false, tex: '\\vec P', p: arrow(pmag(B.P), pmag(w.P)) + (kept ? ' ✓' : '') });
    brief.push({ name: 'K', title: 'Total kinetic energy', nameStyle: "font-family:'Source Serif 4',serif;font-style:italic;font-size:12px;font-weight:600;color:#3a414a;", isTex: false, isText: true, v: '', p: arrow(Fmt.q(B.K, 'J'), Fmt.q(w.K + (w.hasRocket ? w.Kex : 0), 'J')) });
    const out = { briefRows: brief, briefCols: oneD ? 'auto 1fr 1.1fr' : 'auto auto 1fr', vHead: oneD ? 'v (' + s.M.vu + ')' : '', pHead: oneD ? 'p (kg·m/s)' : 'before → now' + (sp ? ' (sizes; p in kg·m/s)' : ' (size ∠ direction; p in kg·m/s)'),
      showDetail: !!this.app.detail, detailLabel: (this.app.detail ? '▾ Hide' : '▸ Show') + ' every component', onToggleDetail: () => this.app.toggleDetail() };
    // (v_cm is in the full list below, one click away: on the track it is in the Total row)
    const cmRow = checks.find((c) => /v_{\\text{cm}}/.test(c.tex)); if (cmRow && !oneD) rows.push({ isTex: false, isPair: false, isHead: false, isRow: true, tex: '\\vec v_{\\text{cm}}', before: '', now: cmRow.val });
    return { ...out, tableRows: rows, tableChecks: checks.filter((c) => !/Delta \\vec P/.test(c.tex) && !/v_{\\text{cm}}/.test(c.tex)), beforeHead: oneD ? 'before (t = 0)' : '', nowHead: oneD ? (s.atStart ? 'now (t = 0)' : 'now') : '', tableCols: oneD ? 'auto 1fr 1fr' : '46px 1fr', tableNote: hide ? 'values hidden: predict first' : '' }; }

  // ---- momentum bars: before (faint) and now (solid), for x (and y) ----
  bars() { const s = this.lab, w = s.world, B = s.before, hide = s.hidden && !s.atStart, comps = s.oneD ? ['x'] : ['x', 'y'], groups = [];
    for (const c of comps) { const items = w.main.map((b, i) => ({ name: Panel.tag(b), col: b.col, was: B.bodies[i].p[c], now: b.m * b.v[c] }));
      if (w.hasRocket) items.push({ name: 'exhaust', col: '#c07a2c', was: 0, now: w.Pex[c] }); items.push({ name: 'total', col: '#3a414a', was: B.P[c], now: w.P[c] });
      const big = Math.max(1e-30, ...items.map((x) => Math.max(Math.abs(x.was), Math.abs(x.now)))), bar = (v, col, faint) => { const pc = Math.abs(v) < 1e-9 * big ? 0 : 47 * Math.abs(v) / big, ink = Panel.ink(col);
        // before: a pale bar with a fine outline; now: a solid bar, lit along its top
        const look = faint ? 'top:1px;height:6px;background:' + G3.alpha(ink, 0.16) + ';box-shadow:inset 0 0 0 1px ' + G3.alpha(ink, 0.45) + ';' : 'top:8px;height:8px;background:linear-gradient(180deg,' + G3.lite(ink, 0.3) + ',' + ink + ');box-shadow:0 1px 1.5px rgba(0,0,0,0.25);';
        return 'position:absolute;border-radius:3px;' + look + (v >= 0 ? 'left:50%;' : 'left:' + (50 - pc) + '%;') + 'width:' + pc + '%;' + (pc === 0 ? 'display:none;' : ''); };
      groups.push({ title: s.oneD ? 'Momentum p: before faint, now solid' : 'p' + c + ': before faint, now solid', rows: items.map((x) => ({ name: x.name === 'exhaust' ? 'exh.' : x.name, nameStyle: 'width:' + (s.oneD ? 40 : 30) + 'px;flex:none;font-size:10.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:' + Panel.ink(x.col) + ';', wasStyle: bar(x.was, x.col, true), nowStyle: hide ? 'display:none;' : bar(x.now, x.col, false) })) }); }
    return { barGroups: groups, barCols: groups.length > 1 ? '1fr 1fr' : '1fr' }; }

  canvas() { const app = this.app, s = this.lab, sp = s.speed;
    const box = (side) => 'position:absolute;bottom:10px;' + side + ':10px;display:flex;align-items:center;gap:4px;background:rgba(15,23,34,0.78);border:1px solid rgba(255,255,255,0.14);border-radius:8px;padding:4px;';
    const graphs = [['momentum', 'Momentum', 'Each body’s momentum and the total, against time'], ['force', 'Force', 'The force on each body from the others: equal and opposite, so the impulses cancel'], ['energy', 'Energy', 'Kinetic, stored and heat'], ['off', 'Off', 'No graphs']];
    const canClose = app.graphs.canClose(s) && s.graph === 'force';
    return { setCanvas: app.setCanvas, setGraph: app.setGraph, clockBoxStyle: box('left'), viewBoxStyle: box('right'),
      clockBtns: [{ label: s.playing ? '❚❚ Pause' : '▶ Run', title: s.playing ? 'Stop the clock (Space)' : 'Start the clock (Space)', style: UI.tool(s.playing), onClick: app.run(() => s.toggle()) },
        { label: '↺', title: 'Back to the start', style: UI.zoom, onClick: app.run(() => s.reset()) }, { label: '⏭', title: 'Step on a little', style: UI.zoom, onClick: app.run(() => s.step()) },
        { label: sp === 1 ? '1×' : sp === 0.25 ? '¼×' : '¹⁄₂₀×', title: 'Speed: full, a quarter, or a twentieth (to watch a collision happen)', style: UI.tool(sp < 1), onClick: app.run(() => { const k = Lab.SPEEDS.indexOf(sp); s.speed = Lab.SPEEDS[(k + 1) % 3]; s.bump(); }) }],
      timeStr: 't = ' + Fmt.dur(s.time),
      viewBtns: [{ label: '−', title: 'Zoom out', style: UI.zoom, onClick: () => app.zoom(1 / 1.25) }, { label: '+', title: 'Zoom in', style: UI.zoom, onClick: () => app.zoom(1.25) }, { label: 'Fit', title: 'Back to the whole picture', style: UI.zoom, onClick: app.run(() => { s.view.frame(s.view.home); s.bump(); }) }],
      showChips: Lab.SHOW.filter(([k]) => !(s.oneD && k === 'trails')).map(([k, label, title]) => ({ label, title, style: UI.chip(s.show[k]), onClick: app.run(() => s.toggleShow(k)) })),
      graphTabs: graphs.map(([k, label, title]) => ({ label, title, style: UI.chip(s.graph === k), onClick: app.run(() => s.setGraph(k)) })),
      hasAxes: !s.oneD && s.graph !== 'energy' && s.graph !== 'off', axisChips: ['x', 'y'].map((k) => ({ label: k, title: 'The ' + k + ' parts', style: UI.chip(s.axis === k), onClick: app.run(() => { s.axis = k; s.bump(); }) })),
      hasClose: canClose, closeLabel: s.close ? '◂ Whole run' : '🔍 Close-up', closeStyle: UI.chip(s.close), onClose: app.run(() => { s.close = !s.close; s.bump(); }),
      graphStyle: (s.graph !== 'off' ? 'display:block;' : 'display:none;') + 'width:100%;height:' + Graphs.H + 'px;margin-top:7px;border-radius:10px;',
      canvasStyle: 'display:block;width:100%;border-radius:10px;cursor:grab;touch-action:none;' + (s.graph === 'off' && !app.big && !app._obBig ? 'height:' + (Math.round((app._cw || 560) * 400 / 600) + Graphs.H + 7) + 'px;' : 'height:auto;aspect-ratio:600/400;'),
      timeTitle: s.mode === 'space' ? 'Clock: ' + Fmt.dur(s.warp) + ' of motion each second' : 'Time since the start',
      sitNote: (s.mode === 'space' && !s.setup.gravity ? 'Deep space, far from everything' : s.M.what) + '. ' + (s.mode === 'space' ? 'Clock: ' + Fmt.dur(s.warp) + ' of motion each second. ' : '') + 'Scroll or pinch (Ctrl+scroll in a page) to zoom; drag empty space to pan.' }; }

  share() { const app = this.app, st = this.ui;
    return { showShare: !!st.showShare, onCloseShare: () => app.setState({ showShare: false }), shareUrl: st.showShare ? Link.url(this.lab, st.shareHide) : '', onCopyShare: () => app.copyShare(), copyLabel: st.shareCopied ? 'Copied' : 'Copy',
      copyBtnStyle: "min-width:86px;flex:none;font-family:'Source Sans 3',sans-serif;font-size:12px;font-weight:700;padding:9px 15px;border-radius:8px;cursor:pointer;border:1px solid " + (st.shareCopied ? '#2f8f56' : 'rgba(224,184,90,0.5)') + ';background:' + (st.shareCopied ? '#2f8f56' : 'rgba(191,138,30,0.3)') + ';color:#fff;',
      shareHide: !!st.shareHide, onToggleShareHide: () => app.setState((x) => ({ shareHide: !x.shareHide, shareCopied: false })), selectAll: (e) => e.target.select() }; }

  info() { const app = this.app;
    return { showInfo: !!this.ui.showInfo, onCloseInfo: () => app.setState({ showInfo: false }), infoFormulas: [
      { expr: '\\vec p = m\\vec v', desc: 'momentum: a vector, along the velocity' },
      { expr: '\\vec J = \\int \\vec F\\,dt = \\Delta \\vec p', desc: 'impulse: the area under a force–time graph is the change of momentum it makes' },
      { expr: '\\vec F_{A\\text{ on }B} = -\\vec F_{B\\text{ on }A}', desc: 'Newton’s third law: so the two impulses in a collision cancel' },
      { expr: '\\vec P_{\\text{total}} = \\textstyle\\sum m\\vec v = \\text{constant}', desc: 'conservation of momentum, for a system with no outside force (each component on its own)' },
      { expr: '\\vec v_{\\text{cm}} = \\dfrac{\\vec P_{\\text{total}}}{M}', desc: 'the centre of mass moves in a straight line at a steady speed' },
      { expr: 'e = \\dfrac{\\text{speed apart}}{\\text{speed together}}', desc: 'coefficient of restitution: 1 elastic (K kept), 0 perfectly inelastic (they stick)' },
      { expr: 'v_{A,f} = \\dfrac{m_A - m_B}{m_A + m_B}\\, v_{A,i}', desc: '1D elastic collision with B at rest; then v_{B,f} = 2 m_A v_{A,i}/(m_A + m_B)' },
      { expr: '\\Delta v = u \\ln\\dfrac{m_0}{m}', desc: 'rocket: exhaust speed u, mass m₀ at the start and m now' }] }; }

  bugForm() { const app = this.app, st = this.ui, res = st.bugResult || '';
    return { showBug: !!st.showBug, onCloseBug: () => app.setState({ showBug: false }), stopBug: (e) => e.stopPropagation(), onBugText: (e) => app.setState({ bugText: e.target.value }), onBugEmail: (e) => app.setState({ bugEmail: e.target.value }),
      onSubmitBug: () => app.submitBug(), bugBtnLabel: st.bugSending ? 'Sending…' : 'Send report',
      bugBtnStyle: "flex:none;font-family:'Source Sans 3',sans-serif;font-size:12px;font-weight:700;padding:9px 15px;border-radius:8px;cursor:pointer;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.14);color:#fff;opacity:" + (st.bugSending ? '0.6' : '1') + ';',
      bugMsg: res.replace(/^(ok|err):/, ''), bugMsgColor: res.slice(0, 3) === 'ok:' ? '#7fd1a4' : '#f0a5a5' }; }
}

// ---- the address: ?mode=&preset=&restitution=&bodies=A,m,x,y,vx,vy,R;B,…&spring=E,t&rocket=fuel,rate,u,angle,start&hide=1 (SI units).
// Full names throughout, so a cache-buster like ?v=3 is never read as a setting. Bodies are listed only when the preset was changed. ----
const Link = {
  num: (x) => String(Number(Number(x).toPrecision(7))),
  url(lab, hide) { const s = lab.setup, q = new URLSearchParams(); q.set('mode', lab.mode); q.set('preset', s.preset);
    if (s.edited) { q.set('restitution', Link.num(s.e)); q.set('bodies', s.bodies.map((b) => [b.id, b.m, b.x, b.y, b.vx, b.vy, b.R].map((x, i) => (i ? Link.num(x) : x)).join(',')).join(';'));
      const c = s.charges[0]; if (c) q.set('spring', [c.E, c.at].map(Link.num).join(',')); const r = s.bodies.find((b) => b.rocket); if (r) q.set('rocket', [r.rocket.fuel, r.rocket.rate, r.rocket.u, r.rocket.ang, r.rocket.start].map(Link.num).join(',')); }
    if (hide) q.set('hide', '1'); let base = ''; try { base = location.origin + location.pathname; } catch (e) {} return base + '?' + q.toString(); },
  apply(lab, search) { let q; try { q = new URLSearchParams(search == null ? location.search : search); } catch (e) { return false; } const mode = q.get('mode');
    if (!mode || !MODES[mode]) { if (q.get('hide') === '1') lab.hide(true); return false; } lab.load(mode, PRESET(mode, q.get('preset')) ? q.get('preset') : PRESETS[mode][0].key);
    const bodies = q.get('bodies'), S = lab.setup, fin = (x, lo, hi) => { x = Number(x); return isFinite(x) ? Math.max(lo, Math.min(hi, x)) : null; };
    if (bodies || q.get('restitution') != null || q.get('spring') || q.get('rocket')) lab.edit(() => {
      const e = fin(q.get('restitution'), 0, 1); if (e != null && q.get('restitution') !== '') S.e = e;
      if (bodies) { const list = []; for (const part of bodies.split(';').slice(0, Lab.MAX)) { const [id, ...n] = part.split(','), i = NAMES.indexOf(id), old = S.bodies.find((b) => b.id === id);
          const v = n.map((x) => Number(x)); if (v.length < 6 || v.some((x) => !isFinite(x))) continue; const big = lab.mode === 'space' ? 1e13 : 10;
          const b = old ? { ...old } : body(i >= 0 ? i : list.length, 1, MODES[lab.mode].size, 0, 0, 0, 0); b.m = Math.max(1e-6, v[0]); b.x = fin(v[1], -big, big); b.y = lab.oneD ? 0 : fin(v[2], -big, big); b.vx = fin(v[3], -1e6, 1e6); b.vy = lab.oneD ? 0 : fin(v[4], -1e6, 1e6); if (v.length > 5) b.R = Math.max(0, fin(v[5], 0, 1e10));
          if (!list.some((x) => x.id === b.id)) list.push(b); }
        if (list.length) { S.bodies = list; S.charges = S.charges.filter((c) => list.some((b) => b.id === c.a) && list.some((b) => b.id === c.b)); } }
      const sp = (q.get('spring') || '').split(',').map(Number), c = S.charges[0]; if (c && sp.length === 2 && sp.every(isFinite)) { c.E = Math.max(0.001, Math.min(50, sp[0])); c.at = Math.max(0, Math.min(30, sp[1])); }
      const rk = (q.get('rocket') || '').split(',').map(Number), r = S.bodies.find((b) => b.rocket); if (r && rk.length === 5 && rk.every(isFinite)) r.rocket = { fuel: Math.min(Math.max(0, rk[0]), 0.95 * r.m), rate: Math.max(0.01, rk[1]), u: Math.max(1, rk[2]), ang: rk[3], start: Math.max(0, rk[4]) }; });
    if (q.get('hide') === '1') lab.hide(true); return true; },
};
