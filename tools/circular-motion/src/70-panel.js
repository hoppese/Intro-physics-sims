// =====================================================================
// Panel -- the page around the canvas: the situations, their settings, the
// table of forces split along r (toward the centre) and z (or t, along the
// path, for a vertical circle) with ΣF_r set beside m v²/r, the key speeds,
// what is drawn, the clock, and the overlays. It reads the Sim and calls back
// into the app; it never changes the physics itself.
// =====================================================================
const UI = {
  chip: (on) => "font-family:'Source Sans 3',sans-serif;font-size:11px;font-weight:600;padding:4px 10px;border-radius:999px;cursor:pointer;border:1px solid " + (on ? '#bf8a1e' : '#d7dbe0') + ';background:' + (on ? '#f6f0db' : '#fff') + ';color:' + (on ? '#7a5a12' : '#525a63') + ';',
  pick: (on) => "display:flex;align-items:center;gap:9px;width:100%;font-family:'Source Sans 3',sans-serif;font-size:12.5px;font-weight:600;padding:7px 10px;border-radius:8px;cursor:pointer;text-align:left;border:1px solid " + (on ? '#bf8a1e' : '#e4e8ec') + ';background:' + (on ? '#f6f0db' : '#fff') + ';color:' + (on ? '#6b4f10' : '#3a414a') + ';',
  tool: (on) => 'font-size:11px;font-weight:700;height:24px;padding:0 8px;display:flex;align-items:center;gap:3px;border-radius:6px;cursor:pointer;white-space:nowrap;border:1px solid ' + (on ? 'rgba(240,200,96,0.8)' : 'rgba(255,255,255,0.18)') + ';background:' + (on ? 'rgba(191,138,30,0.45)' : 'rgba(255,255,255,0.07)') + ';color:' + (on ? '#fff3cf' : '#d7dee5') + ';',
  zoom: 'font-size:12px;font-weight:700;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:6px;cursor:pointer;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#d7dee5;',
};

class Panel {
  static ICONS = { puck: '◉', flat: '⟳', banked: '◢', conical: '△', vertical: '◯', ferris: '✲', orbit: '⊕' };
  static TEX = { weight: 'w', normal: 'n', static: 'f_{\\text{s}}', kinetic: 'f_{\\text{k}}', tension: 'T', gravity: 'F_{\\text{G}}' };
  static INK = { weight: '#d64545', normal: '#2f7fc8', static: '#b8860b', kinetic: '#b8860b', tension: '#3f8f2a', gravity: '#d64545' };
  static WHAT = { weight: 'Weight (gravity)', normal: 'Normal force', static: 'Static friction', kinetic: 'Kinetic friction', tension: 'Tension', gravity: 'Gravity, G M m / r²,' };
  static NOTES = {
    puck: 'The table is frictionless, so the string is the only thing pulling sideways: the tension is the centripetal force. Cut the string and watch which way the puck goes.',
    flat: 'Nothing but static friction from the road pulls the car toward the centre. It can give at most μs n, so there is a top speed for the curve, and it is lower on a wet or icy road.',
    banked: 'Tilting the road leans the normal force toward the centre. At the design speed that is all the car needs; faster, friction must help by pointing down the bank; slower, up it.',
    conical: 'The string pulls up and in: its vertical part holds the ball up (T cosθ = m g), its inward part makes it go round (T sinθ = m v²/r). The angle sets the speed.',
    vertical: 'Gravity speeds the object up on the way down and slows it on the way up, so the speed and the pull change all the way round. At the top, gravity alone can be enough: then T (or n) is zero.',
    ferris: 'The gondola stays level, so the seat pushes straight up (n) and grips sideways (static friction). At a steady speed they and gravity must add up to m v²/r toward the centre: the rider feels lighter at the top and heavier at the bottom. Compare the car in a loop, where the track pushes toward the centre.',
    orbit: 'Gravity is the only force, and it points at the Earth’s centre. At the circular speed it is exactly m v²/r, so the satellite keeps falling round the Earth without getting closer. Change the speed and the orbit becomes an ellipse, or crashes, or escapes.' };

  constructor(app) { this.app = app; }
  get sim() { return this.app.sim; }
  get ui() { return this.app.state; }
  all() { return { ...this.header(), ...this.situations(), ...this.settings(), ...this.table(), ...this.canvas(), ...this.share(), ...this.info(), ...this.bugForm(), stop: (e) => e.stopPropagation() }; }

  header() { const app = this.app, st = this.ui, s = this.sim;
    const row = (a) => "display:flex;align-items:center;gap:8px;width:100%;font-family:'Source Sans 3',sans-serif;font-size:12.5px;font-weight:600;color:#dbe6ef;background:" + (a ? 'rgba(191,138,30,0.36)' : 'transparent') + ';border:none;border-radius:7px;padding:8px 9px;cursor:pointer;text-align:left;';
    const side = (a) => "display:flex;align-items:center;gap:9px;width:100%;font-family:'Source Sans 3',sans-serif;font-size:13px;font-weight:600;color:#dbe6ef;background:" + (a ? 'rgba(191,138,30,0.36)' : 'rgba(255,255,255,0.05)') + ';border:1px solid ' + (a ? 'rgba(224,184,90,0.6)' : 'rgba(255,255,255,0.08)') + ';border-radius:8px;padding:9px 11px;cursor:pointer;text-align:left;';
    const dot = (a) => (a ? 'display:inline-block;width:7px;height:7px;border-radius:50%;background:#e0b85a;flex:none;' : 'display:inline-block;width:7px;height:7px;flex:none;');
    const mk = (icon, label, onClick, active) => ({ icon, label, onClick, rowStyle: row(active), sideStyle: side(active), dotStyle: dot(active) });
    const menuItems = [mk('←', 'All sims', () => { try { window.open('../', '_blank', 'noopener'); } catch (e) {} }), mk('ⓘ', 'Info', () => app.setState((x) => ({ showInfo: !x.showInfo, menuOpen: false })), !!st.showInfo),
      mk('↗', 'Share link', () => app.setState({ showShare: true, menuOpen: false, shareCopied: false, shareHide: s.hidden })), mk('🐞', 'Submit bug', () => app.setState({ showBug: true, menuOpen: false, bugText: '', bugEmail: '', bugResult: '', bugSending: false }))];
    return { big: app.big, menuItems, menuOpen: !!st.menuOpen, onToggleMenu: () => app.setState((x) => ({ menuOpen: !x.menuOpen })), onCloseMenu: () => app.setState({ menuOpen: false }),
      menuBtnStyle: 'display:flex;align-items:center;justify-content:center;width:32px;height:30px;font-size:16px;border-radius:8px;cursor:pointer;border:1px solid ' + (st.menuOpen ? 'rgba(224,184,90,0.7)' : 'rgba(255,255,255,0.28)') + ';background:' + (st.menuOpen ? 'rgba(191,138,30,0.32)' : 'rgba(255,255,255,0.08)') + ';color:#cfe0f2;',
      hideLabel: s.hidden ? 'Show forces' : 'Hide forces', hideTitle: s.hidden ? 'Show the forces, the acceleration and their values' : 'Hide every force and the acceleration, to draw the free-body diagram first', onToggleHide: app.run(() => s.hide(!s.hidden)) }; }

  situations() { const app = this.app, s = this.sim, sit = s.sit, C = sit.constructor;
    const sitItems = Object.entries(SITUATIONS).map(([k, K]) => ({ label: K.NAME, icon: Panel.ICONS[k], style: UI.pick(k === s.key).replace('border:1px solid #e4e8ec', 'border:1px solid transparent'), onClick: () => { s.choose(k); app.setState({ sitsOpen: false }); app.refresh(); } }));
    const open = !!this.ui.sitsOpen, sitMenu = { sitsOpen: open, sitIcon: Panel.ICONS[s.key], sitName: C.NAME, onToggleSits: () => app.setState((x) => ({ sitsOpen: !x.sitsOpen, menuOpen: false })), onCloseSits: () => app.setState({ sitsOpen: false }),
      sitBtnStyle: "display:flex;align-items:center;gap:9px;width:100%;font-family:'Source Sans 3',sans-serif;font-size:13px;font-weight:700;padding:8px 11px;border-radius:9px;cursor:pointer;text-align:left;border:1px solid " + (open ? '#bf8a1e' : '#d3d8dd') + ';background:' + (open ? '#f6f0db' : '#fff') + ';color:#3a414a;box-shadow:0 1px 2px rgba(0,0,0,0.05);' };
    const variantChips = (C.VARIANTS || []).map(([k, label]) => ({ label, style: UI.chip(sit.variant === k), onClick: app.run(() => s.setVariant(k)) }));
    const usesRoad = s.key === 'flat' || s.key === 'banked', roadChips = usesRoad ? Situation.ROADS.map(([k, label, ms, mk]) => ({ label, title: 'μs = ' + ms + ', μk = ' + mk, style: UI.chip(sit.road === k), onClick: app.run(() => s.setRoad(k)) })) : [];
    return { ...sitMenu, sitItems, hasVariants: variantChips.length > 0, variantChips, hasRoads: usesRoad, roadChips, roadNote: usesRoad ? 'μs = ' + sit.mu.s + ', μk = ' + sit.mu.k : '', sitNote: Panel.NOTES[s.key],
      hasSnip: s.key === 'puck' || s.key === 'orbit', ...(s.key === 'orbit'
        ? { snipLabel: '◯ Circular speed', snipTitle: 'Set the speed to √(GM/r) for this height: just right to go round in a circle', snipStyle: Panel.ACT(sit.circular), onSnip: app.run(() => s.circular()) }
        : { snipLabel: sit.cut ? '↺ Tie it back on' : '✂ Cut the string', snipTitle: '', snipStyle: Panel.ACT(false, true), onSnip: app.run(() => { s.snip(); if (s.sit.cut && !s.playing) s.play(); }) }) }; }
  static ACT(on, red) { return 'align-self:flex-start;font-size:12px;font-weight:700;padding:6px 12px;border-radius:8px;cursor:pointer;border:1px solid ' + (red ? '#d7a8a8' : on ? '#9cc7a9' : '#d7c08a') + ';background:' + (red ? '#fbefef' : on ? '#eef7f0' : '#fbf4e2') + ';color:' + (red ? '#93343c' : on ? '#2f7a48' : '#7a5a12') + ';'; }

  settings() { const app = this.app, s = this.sim, sit = s.sit, st = this.ui, d = st.draft;
    const fields = sit.specs.map((p) => { const v = sit.vals[p.key], dec = p.step >= 1 ? 0 : p.step >= 0.1 ? 1 : 2;
      return { label: p.label, tex: p.sym + (p.sub ? '_{\\text{' + p.sub + '}}' : ''), unit: p.unit, min: p.min, max: p.max, step: p.step, value: String(v), text: d && d.key === p.key ? d.text : Fmt.fix(v, dec),
        onSlide: (e) => { s.set(p.key, e.target.value); app.refresh(); }, onType: (e) => app.setState({ draft: { key: p.key, text: e.target.value } }), onCommit: (e) => { s.set(p.key, parseFloat(e.target.value)); app.setState({ draft: null }); app.refresh(); } }; });
    return { fields }; }

  // ---- the forces along r and z (or r and t), their sums, and m v²/r ----
  table() { const s = this.sim, sit = s.sit, n = sit.now(), vert = s.key === 'vertical' || s.key === 'ferris', cols = vert ? ['r', 't'] : ['r', 'z'], axes = { r: n.rhat, t: n.that, z: n.zhat }, comp = (F, c) => (axes[c] ? V3.dot(F, axes[c]) : NaN);
    const num = (x) => (isFinite(x) ? Fmt.N(Math.abs(x) < 5e-4 * Math.max(1, n.m * G) ? 0 : x) : '–'), v = V3.len(n.v);
    const forceRows = s.hidden ? [] : n.forces.map((f) => ({ tex: Panel.TEX[f.kind], col: Panel.INK[f.kind], what: Panel.WHAT[f.kind] + (f.by ? ' from ' + f.by : ''), mag: Fmt.N(V3.len(f.F)), c1: num(comp(f.F, cols[0])), c2: num(comp(f.F, cols[1])) }));
    const sum = n.forces.reduce((a, f) => V3.add(a, f.F), V3.O), on = n.onCircle && !!n.rhat;
    const head = [{ tex: '', text: 'Force' }, { text: 'size' }, { tex: cols[0], text: cols[0] === 'r' ? '(in)' : '' }, { tex: cols[1], text: '' }];
    const need = on ? n.m * v * v / n.R : NaN, sumR = comp(sum, 'r'), orb = s.key === 'orbit', same = Math.abs(sumR - need) < (orb ? 2e-4 : 1e-6) * Math.max(1, need);
    const checks = !on ? [{ tex: '', text: vert ? 'Off the circle: only gravity acts, so it falls like a projectile.' : (s.key === 'orbit' ? 'On the ground: it is not going round any more.' : 'Not going round a circle any more: nothing pulls it toward the centre.'), val: '' }]
      : [{ tex: '\\Sigma F_r', val: num(sumR) }, { tex: 'm v^2/r', val: num(need), mark: same ? (orb ? '✓ equal: a circle' : '✓ equal') : '', text: same || !orb ? '' : sumR > need ? 'gravity is more: it falls inward' : 'gravity is less: it swings outward' },
        vert ? { tex: '\\Sigma F_t = m a_t', val: num(comp(sum, 't')) } : { tex: '\\Sigma F_z', val: num(comp(sum, 'z')), mark: Math.abs(comp(sum, 'z')) < 1e-6 * n.m * G ? '✓ zero: no up-down motion' : '' }];
    // the speeds that matter here
    const keys = [{ tex: 'v', val: Fmt.vel(v) }]; if (on && !s.hidden) keys.push(s.key === 'orbit' ? { tex: 'a = G M/r^2', val: Fmt.acc(V3.len(n.a)) } : { tex: 'a_r = v^2/r', val: Fmt.acc(v * v / n.R) });
    if (orb) { const c = Orbit.conic(n.p, n.v); keys[0].val = Orbit.kms(v); keys.push({ tex: 'v_{\\text{circ}} = \\sqrt{GM/r}', val: Orbit.kms(Math.sqrt(Orbit.GM / n.R)) }, { tex: 'v_{\\text{esc}} = \\sqrt{2GM/r}', val: Orbit.kms(Math.sqrt(2 * Orbit.GM / n.R)) },
      { tex: '\\text{height}', val: Orbit.km(n.R - Orbit.RE) }, { tex: '\\text{period}', val: c.bound ? Orbit.dur(c.T) : 'never comes back' }); }
    else if (s.key !== 'vertical' && on && v > 0) keys.push({ tex: '\\text{period} = 2\\pi r/v', val: Fmt.time(2 * Math.PI * n.R / v) });
    if (s.key === 'flat') keys.push({ tex: 'v_{\\max} = \\sqrt{\\mu_s g r}', val: Fmt.vel(sit.vmax) });
    if (s.key === 'banked') keys.push({ tex: 'v_{\\text{design}} = \\sqrt{g r \\tan\\theta}', val: Fmt.vel(sit.design) });
    if (s.key === 'conical') keys.push({ tex: 'r = L\\sin\\theta', val: Fmt.m(sit.r) });
    if (s.key === 'ferris') { const { m, r } = sit.vals, ac = v * v / r; keys.push({ tex: 'n_{\\text{top}} = m(g - v^2/r)', val: Fmt.N(m * (G - ac)) }, { tex: 'n_{\\text{bottom}} = m(g + v^2/r)', val: Fmt.N(m * (G + ac)) }, { tex: 'v_{\\text{top, max}} = \\sqrt{g r}', val: Fmt.vel(sit.vtop) }); }
    if (s.key === 'vertical') keys.push({ tex: 'v_{\\text{top, min}} = \\sqrt{g r}', val: Fmt.vel(sit.vtop) }, { tex: 'v_{\\text{bottom, min}} = \\sqrt{5 g r}', val: Fmt.vel(sit.vbmin) });
    return { forceRows, hasTable: !s.hidden, hiddenNote: s.hidden ? 'Forces hidden: draw the free-body diagram, split each force along r (toward the centre) and z, then press Show forces.' : '', head, checks: s.hidden ? [] : checks, keys,
      colA: cols[0], colB: cols[1] }; }

  canvas() { const app = this.app, s = this.sim, cam = s.cam, sp = s.speed;
    const box = (side) => 'position:absolute;bottom:10px;' + side + ':10px;display:flex;align-items:center;gap:4px;background:rgba(15,23,34,0.78);border:1px solid rgba(255,255,255,0.14);border-radius:8px;padding:4px;';
    return { setCanvas: app.setCanvas, clockBoxStyle: box('left'), viewBoxStyle: box('right'),
      clockBtns: [{ label: s.playing ? '❚❚ Pause' : '▶ Run', title: s.playing ? 'Stop the clock (Space)' : 'Start the clock (Space)', style: UI.tool(s.playing), onClick: app.run(() => s.toggle()) },
        { label: '↺', title: 'Back to the start', style: UI.zoom, onClick: app.run(() => s.reset()) }, { label: '⏭', title: 'Step on 1/30 s', style: UI.zoom, onClick: app.run(() => s.step()) },
        { label: sp === 1 ? '1×' : sp === 0.5 ? '½×' : '¼×', title: 'Speed: full, half or quarter (slow motion)', style: UI.tool(sp < 1), onClick: app.run(() => { const k = Sim.SPEEDS.indexOf(sp); s.speed = Sim.SPEEDS[(k + 2) % 3]; s.bump(); }) }],
      timeStr: s.sit.clock ? s.sit.clock() : 't = ' + Fmt.time(s.time),
      viewBtns: [['3d', '3D', 'From above and to the side (drag to turn it)'], ['top', 'Top', 'Looking straight down'], ['side', 'Side', 'Level, from the side']].map(([k, label, title]) => ({ label, title, style: UI.tool(cam.view === k), onClick: app.run(() => s.view(k)) })),
      zoomBtns: [{ label: '−', title: 'Zoom out', style: UI.zoom, onClick: app.run(() => { cam.zoomBy(1 / 1.2); s.bump(); }) }, { label: '+', title: 'Zoom in', style: UI.zoom, onClick: app.run(() => { cam.zoomBy(1.2); s.bump(); }) }],
      showChips: Sim.SHOW.map(([k, label, title]) => ({ label, title, style: UI.chip(s.show[k]), onClick: app.run(() => s.toggleShow(k)) })) }; }

  share() { const app = this.app, st = this.ui;
    return { showShare: !!st.showShare, onCloseShare: () => app.setState({ showShare: false }), shareUrl: st.showShare ? Link.url(this.sim, st.shareHide) : '', onCopyShare: () => app.copyShare(), copyLabel: st.shareCopied ? 'Copied' : 'Copy',
      copyBtnStyle: "min-width:86px;flex:none;font-family:'Source Sans 3',sans-serif;font-size:12px;font-weight:700;padding:9px 15px;border-radius:8px;cursor:pointer;border:1px solid " + (st.shareCopied ? '#2f8f56' : 'rgba(224,184,90,0.5)') + ';background:' + (st.shareCopied ? '#2f8f56' : 'rgba(191,138,30,0.3)') + ';color:#fff;',
      shareHide: !!st.shareHide, onToggleShareHide: () => app.setState((x) => ({ shareHide: !x.shareHide, shareCopied: false })), selectAll: (e) => e.target.select() }; }

  info() { const app = this.app;
    return { showInfo: !!this.ui.showInfo, onCloseInfo: () => app.setState({ showInfo: false }), infoFormulas: [
      { expr: 'a_r = \\dfrac{v^2}{r}', desc: 'centripetal acceleration: toward the centre, for anything going round a circle at speed v' },
      { expr: '\\Sigma F_r = \\dfrac{m v^2}{r}', desc: 'Newton’s second law along r: the forces’ parts toward the centre add up to m v²/r. No new force: some real force (tension, friction, the normal force, gravity) does it' },
      { expr: '\\Sigma F_z = 0', desc: 'for a horizontal circle: nothing moves up or down, so the vertical parts cancel' },
      { expr: 'v_{\\max} = \\sqrt{\\mu_s g r}', desc: 'flat curve: the fastest static friction can hold' },
      { expr: 'v_{\\text{design}} = \\sqrt{g r \\tan\\theta}', desc: 'banked curve: the speed at which no friction is needed' },
      { expr: 'v_{\\text{top}} \\ge \\sqrt{g r}', desc: 'vertical circle: at the top, gravity alone must not be more than m v²/r, or the string goes slack' },
      { expr: 'F_G = \\dfrac{G M m}{r^2} = \\dfrac{m v^2}{r} \\;\\Rightarrow\\; v = \\sqrt{\\dfrac{G M}{r}}', desc: 'a circular orbit: gravity is the centripetal force. r is measured from the Earth’s centre, not the ground' },
      { expr: 'v_{\\text{esc}} = \\sqrt{\\dfrac{2 G M}{r}}', desc: 'escape speed: this fast or faster and the satellite never comes back' },
      { expr: 'T = \\dfrac{2\\pi r}{v}', desc: 'the period: the time for one trip round (here T is a time, not the tension)' }] }; }

  bugForm() { const app = this.app, st = this.ui, res = st.bugResult || '';
    return { showBug: !!st.showBug, onCloseBug: () => app.setState({ showBug: false }), stopBug: (e) => e.stopPropagation(), onBugText: (e) => app.setState({ bugText: e.target.value }), onBugEmail: (e) => app.setState({ bugEmail: e.target.value }),
      onSubmitBug: () => app.submitBug(), bugBtnLabel: st.bugSending ? 'Sending…' : 'Send report',
      bugBtnStyle: "flex:none;font-family:'Source Sans 3',sans-serif;font-size:12px;font-weight:700;padding:9px 15px;border-radius:8px;cursor:pointer;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.14);color:#fff;opacity:" + (st.bugSending ? '0.6' : '1') + ';',
      bugMsg: res.replace(/^(ok|err):/, ''), bugMsgColor: res.slice(0, 3) === 'ok:' ? '#7fd1a4' : '#f0a5a5' }; }
}

// ---- the address: ?s=<situation>&variant=&road=&<setting>=<value>&hide=1&values=0 (values=0: arrows without their numbers) (every value clamped to its slider's range).
// Settings go by full names (speed, not v), so a cache-buster like ?v=3 is never read as a speed. ----
const Link = {
  NAMES: { m: 'mass', r: 'radius', v: 'speed', bank: 'bank', L: 'length', angle: 'angle', vb: 'bottomspeed', alt: 'height' },
  name(key) { return Link.NAMES[key] || key; },
  url(sim, hide) { const s = sim.sit, q = new URLSearchParams(); q.set('s', sim.key); if (s.variant) q.set('variant', s.variant); if (sim.key === 'flat' || sim.key === 'banked') q.set('road', s.road);
    for (const p of s.specs) q.set(Link.name(p.key), String(s.vals[p.key])); if (hide) q.set('hide', '1'); if (!sim.show.nums) q.set('values', '0'); let base = ''; try { base = location.origin + location.pathname; } catch (e) {} return base + '?' + q.toString(); },
  apply(sim, search) { let q; try { q = new URLSearchParams(search == null ? location.search : search); } catch (e) { return false; } const k = q.get('s') || q.get('situation'); if (q.get('values') === '0') sim.show.nums = false; if (!k || !SITUATIONS[k]) { if (q.get('hide') === '1') sim.hide(true); return false; }
    sim.choose(k); if (q.get('variant')) sim.setVariant(q.get('variant')); if (q.get('road')) sim.setRoad(q.get('road')); for (const p of sim.sit.specs) { const v = q.get(Link.name(p.key)); if (v != null && v !== '') sim.set(p.key, v); }
    if (q.get('hide') === '1') sim.hide(true); return true; },
};
