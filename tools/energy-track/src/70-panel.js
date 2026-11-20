// =====================================================================
// Panel -- the page around the canvas: the tracks, the rider, the settings,
// the energy now (K, U_g, E_th and their total, which stays put), the speed
// and the normal force, what the energy says about the track ahead (does it
// get over the next hill? the lowest start for the loop), the clock, what is
// drawn, the graph tabs, and the overlays. It reads the Sim and calls back
// into the app; it never changes the physics itself.
// =====================================================================
const UI = {
  chip: (on) => "font-family:'Source Sans 3',sans-serif;font-size:10.5px;font-weight:600;padding:3px 8px;border-radius:999px;cursor:pointer;white-space:nowrap;border:1px solid " + (on ? '#bf8a1e' : '#d7dbe0') + ';background:' + (on ? '#f6f0db' : '#fff') + ';color:' + (on ? '#7a5a12' : '#525a63') + ';',
  pick: (on) => "display:flex;align-items:center;gap:9px;width:100%;font-family:'Source Sans 3',sans-serif;font-size:12.5px;font-weight:600;padding:6px 10px;border-radius:8px;cursor:pointer;text-align:left;border:1px solid " + (on ? '#bf8a1e' : 'transparent') + ';background:' + (on ? '#f6f0db' : '#fff') + ';color:' + (on ? '#6b4f10' : '#3a414a') + ';',
  tool: (on) => 'font-size:11px;font-weight:700;height:24px;padding:0 8px;display:flex;align-items:center;gap:3px;border-radius:6px;cursor:pointer;white-space:nowrap;border:1px solid ' + (on ? '#bf8a1e' : '#d7dbe0') + ';background:' + (on ? '#f6f0db' : '#fff') + ';color:' + (on ? '#7a5a12' : '#3a414a') + ';',
  tab: (on) => "font-family:'Source Sans 3',sans-serif;font-size:11px;font-weight:700;padding:4px 10px;border-radius:7px 7px 0 0;cursor:pointer;border:1px solid " + (on ? '#15212e' : '#d7dbe0') + ';border-bottom:none;background:' + (on ? '#15212e' : '#fff') + ';color:' + (on ? '#f0c860' : '#525a63') + ';',
};

class Panel {
  static TEX = { weight: 'w', normal: 'n', kinetic: 'f_{\\text{k}}', static: 'f_{\\text{s}}' };
  constructor(app) { this.app = app; }
  get sim() { return this.app.sim; }
  get ui() { return this.app.state; }
  all() { return { ...this.header(), ...this.tracks(), ...this.settings(), ...this.energy(), ...this.results(), ...this.canvas(), ...this.history(), ...this.share(), ...this.info(), ...this.bugForm(), stop: (e) => e.stopPropagation() }; }

  header() { const app = this.app, st = this.ui, s = this.sim;
    const row = (a) => "display:flex;align-items:center;gap:8px;width:100%;font-family:'Source Sans 3',sans-serif;font-size:12.5px;font-weight:600;color:#dbe6ef;background:" + (a ? 'rgba(191,138,30,0.36)' : 'transparent') + ';border:none;border-radius:7px;padding:8px 9px;cursor:pointer;text-align:left;';
    const side = (a) => "display:flex;align-items:center;gap:9px;width:100%;font-family:'Source Sans 3',sans-serif;font-size:13px;font-weight:600;color:#dbe6ef;background:" + (a ? 'rgba(191,138,30,0.36)' : 'rgba(255,255,255,0.05)') + ';border:1px solid ' + (a ? 'rgba(224,184,90,0.6)' : 'rgba(255,255,255,0.08)') + ';border-radius:8px;padding:9px 11px;cursor:pointer;text-align:left;';
    const dot = (a) => (a ? 'display:inline-block;width:7px;height:7px;border-radius:50%;background:#e0b85a;flex:none;' : 'display:inline-block;width:7px;height:7px;flex:none;');
    const mk = (icon, label, onClick, active) => ({ icon, label, onClick, rowStyle: row(active), sideStyle: side(active), dotStyle: dot(active) });
    const menuItems = [mk('←', 'All sims', () => { try { window.open('../', '_blank', 'noopener'); } catch (e) {} }), mk('ⓘ', 'Info', () => app.setState((x) => ({ showInfo: !x.showInfo, menuOpen: false })), !!st.showInfo),
      mk('↗', 'Share link', () => app.setState({ showShare: true, menuOpen: false, shareCopied: false, shareHide: s.hidden })), mk('🐞', 'Submit bug', () => app.setState({ showBug: true, menuOpen: false, bugText: '', bugEmail: '', bugResult: '', bugSending: false }))];
    return { big: app.big, menuItems, menuOpen: !!st.menuOpen, onToggleMenu: () => app.setState((x) => ({ menuOpen: !x.menuOpen })), onCloseMenu: () => app.setState({ menuOpen: false }),
      menuBtnStyle: 'display:flex;align-items:center;justify-content:center;width:32px;height:30px;font-size:16px;border-radius:8px;cursor:pointer;border:1px solid ' + (st.menuOpen ? 'rgba(224,184,90,0.7)' : 'rgba(255,255,255,0.28)') + ';background:' + (st.menuOpen ? 'rgba(191,138,30,0.32)' : 'rgba(255,255,255,0.08)') + ';color:#cfe0f2;',
      hideLabel: s.hidden ? 'Show energies' : 'Hide energies', hideTitle: s.hidden ? 'Show the energies, the energy line and the energy graphs' : 'Hide the energies, so students work them out first', onToggleHide: app.run(() => s.hide(!s.hidden)) }; }

  // the first sentence of a note (the whole of it goes in the hover title)
  static first(t) { const i = t.search(/[.:](\s|$)/); return i > 0 && i < t.length - 1 ? t.slice(0, i + 1) : t; }
  tracks() { const app = this.app, s = this.sim, open = !!this.ui.tracksOpen, P = s.preset;
    const trackItems = Object.entries(PRESETS).map(([k, Q]) => ({ label: Q.name, icon: Q.icon, style: UI.pick(k === s.key && !s.custom), onClick: () => { s.choose(k); app.setState({ tracksOpen: false }); app.refresh(); } }));
    const riderChips = Sim.RIDERS.map(([k, chip, name, title]) => ({ label: chip, title: name + ': ' + title, style: UI.chip(s.rider === k), onClick: app.run(() => s.setRider(k)) }));
    const loopChips = s.loopMode ? Sim.LOOPS.map(([k, label, title]) => ({ label: k === 'circle' ? 'Perfect circle' : 'Spline loop', title: label + ': ' + title, style: UI.chip(s.loopMode === k), onClick: app.run(() => s.setLoopMode(k)) })) : [];
    const full = (s.custom ? 'Your own track, reshaped from ' + P.name + '. ' : '') + P.note;
    return { trackItems, tracksOpen: open, trackIcon: P.icon, trackName: P.name + (s.custom ? ' (reshaped)' : ''), onToggleTracks: () => app.setState((x) => ({ tracksOpen: !x.tracksOpen, menuOpen: false })), onCloseTracks: () => app.setState({ tracksOpen: false }),
      trackBtnStyle: "display:flex;align-items:center;gap:9px;width:100%;font-family:'Source Sans 3',sans-serif;font-size:13px;font-weight:700;padding:6px 11px;border-radius:9px;cursor:pointer;text-align:left;border:1px solid " + (open ? '#bf8a1e' : '#d3d8dd') + ';background:' + (open ? '#f6f0db' : '#fff') + ';color:#3a414a;box-shadow:0 1px 2px rgba(0,0,0,0.05);',
      riderChips, hasLoopChips: loopChips.length > 0, loopChips, trackNote: Panel.first(P.note), trackNoteFull: full, isCustom: s.custom, onRestore: app.run(() => s.choose(s.key)),
      editHint: (s.loopMode === 'circle' ? 'Perfect circle: set r, or choose Spline loop to reshape it' : 'Drag the white points to reshape · double-click the track to add a point, a point to remove it') + ' · drag the ' + s.who + ' to set the start · drag the Ug = 0 tag to move the zero' }; }

  settings() { const app = this.app, s = this.sim, st = this.ui, d = st.draft;
    const field = (p, v, onSet, extra) => { const dec = p.step >= 1 ? 0 : p.step >= 0.1 ? 1 : 2;
      return { label: p.label, tex: p.sym, unit: p.unit, min: p.min, max: p.max, step: p.step, value: String(v), text: d && d.key === p.key ? d.text : Fmt.fix(v, dec),
        onSlide: (e) => { onSet(e.target.value); app.refresh(); }, onType: (e) => app.setState({ draft: { key: p.key, text: e.target.value } }), onCommit: (e) => { onSet(parseFloat(e.target.value)); app.setState({ draft: null }); app.refresh(); }, ...extra }; };
    const b = s.track.bounds, hp = { key: 'h0', label: 'Start height', sym: 'y_{\\text{start}}', unit: 'm', min: Math.floor(b.y0 * 10) / 10, max: Math.ceil(b.y1 * 10) / 10, step: 0.1 };
    const fields = [field(Sim.P.m, s.vals.m, (v) => s.set('m', v)), field(hp, Math.round(s.h0 * 100) / 100, (v) => s.setHeight(v)), field(Sim.P.v0, s.vals.v0, (v) => s.set('v0', v)), field(Sim.P.y0, s.vals.y0, (v) => s.set('y0', v))];
    if (s.loopMode === 'circle') fields.splice(1, 0, field(Sim.P.r, s.vals.r, (v) => s.set('r', v)));
    if (s.friction && !s.rolling) fields.push(field(Sim.P.mu, s.vals.mu, (v) => s.set('mu', v)));
    // a ball rolling without slipping: friction grips but does no work (the contact point does not slide), so there is nothing to switch
    if (s.rolling) return { fields, frictionLabel: 'Rolls without slipping', frictionStyle: UI.chip(false).replace('cursor:pointer', 'cursor:default').replace('#d7dbe0', '#e4e7ea') + 'color:#8a929b;', frictionNote: 'static friction does no work: no energy lost',
      frictionTitle: 'Static friction at the contact makes it turn, but the contact point is not sliding, so it does no work: K_tr + K_rot + U_g stays the same. (Kinetic friction is for something that slides: try the ice cube.)', onFriction: () => {} };
    return { fields, frictionLabel: s.friction ? '✓ Friction on' : 'Friction off', frictionStyle: UI.chip(s.friction), frictionNote: s.friction ? 'kinetic friction turns mechanical energy into thermal' : 'no energy lost',
      frictionTitle: s.friction ? 'Turn friction off: no energy is lost' : 'Turn kinetic friction on: it turns mechanical energy into thermal energy', onFriction: app.run(() => s.setFriction(!s.friction)) }; }

  // ---- now: the energies (U_g from the zero line) beside the height, speed and forces, in one grid ----
  energy() { const s = this.sim, n = s.ride.now(), e = s.energy(n), E0 = s.E0, hid = s.hidden, mg = n.m * G, roll = s.rolling, th = (s.friction && !roll) || e.th > 0.05, H = '•••', blank = { tex: '', col: '#23262b', val: '', what: '' };
    const en = roll ? [{ tex: 'K_{\\text{tr}}', col: '#2f7fc8', val: hid ? H : Fmt.J(e.K), what: 'translational kinetic energy, ½ m v²' }, { tex: 'K_{\\text{rot}}', col: '#7a52c7', val: hid ? H : Fmt.J(e.Kr), what: 'rotational kinetic energy, ½ I ω² = ' + (s.rider === 'ball' ? '2/5' : '2/3') + ' of ½ m v² while it rolls' },
        { tex: 'U_g', col: '#3f8f2a', val: hid ? H : Fmt.J(e.U), what: 'gravitational potential energy, m g h, from the zero line' }, ...(th ? [{ tex: 'E_{\\text{th}}', col: '#c2621f', val: hid ? H : Fmt.J(e.th), what: 'thermal energy from landing jolts' }] : []),
        { tex: 'E', col: '#23262b', val: hid ? H : Fmt.J(e.E), what: 'the total: K_tr + K_rot + U_g' + (th ? ' + E_th' : '') }]
      : [{ tex: 'K', col: '#2f7fc8', val: hid ? H : Fmt.J(e.K), what: 'kinetic energy, ½ m v²' }, { tex: 'U_g', col: '#3f8f2a', val: hid ? H : Fmt.J(e.U), what: 'gravitational potential energy, m g h, from the zero line' },
      th ? { tex: 'E_{\\text{th}}', col: '#c2621f', val: hid ? H : Fmt.J(e.th), what: 'thermal energy made by friction (and landing jolts)' } : blank,
      { tex: 'E', col: '#23262b', val: hid ? H : Fmt.J(e.E), what: 'the total: K + U_g' + (th ? ' + E_th' : '') }];
    const mo = [{ tex: 'h', col: '#3a414a', val: Fmt.m(n.p.y - s.vals.y0), what: 'height above the zero of U_g' }, { tex: 'v', col: '#3a414a', val: Fmt.vel(n.speed), what: 'speed' },
      n.mode !== 'air' ? { tex: 'n', col: '#2f7fc8', val: Fmt.N(n.n), what: n.n < -1e-6 ? 'the normal force: negative, the rail pulls the car toward it' : 'the normal force: ' + (n.n < mg * 0.995 ? 'less than m g' : n.n > mg * 1.005 ? 'more than m g' : 'about m g') } : { tex: 'n', col: '#2f7fc8', val: '0 (in the air)', what: 'in the air, nothing pushes on it' },
      { tex: 'm g', col: '#c23b3b', val: Fmt.N(mg), what: 'the weight' }];
    const nowCells = []; for (let i = 0; i < Math.max(en.length, mo.length); i++) nowCells.push(en[i] || blank, mo[i] || blank);
    const same = Math.abs(e.E - E0) <= Math.max(0.05, 1e-5 * Math.abs(E0));
    return { nowCells, energyNote: hid ? 'Energies hidden: work out the kinetic, potential and total energy at the start and here, then press Show energies.' : same ? 'E is the same as at the start (' + Fmt.J(E0) + '): energy is conserved' : 'E is not the same as at the start (' + Fmt.J(E0) + ')',
      energyShort: hid ? 'energies hidden' : same ? '✓ E conserved' : 'E changed', energyNoteColor: hid ? '#8a929b' : same ? '#2f8f56' : '#b0413e' }; }

  // ---- what energy predicts: the speed from the drop, n round a perfect-circle loop, and the track ahead ----
  results() { const s = this.sim, n = s.ride.now(), out = [];
    const clean = !s.friction && s.ride.rec.every((r) => r.th < 0.05) && n.mode === 'track';
    const b = s.beta, bt = s.rider === 'ball' ? '2/5' : '2/3', roll = s.rolling;
    if (clean && !s.hidden) { const v = Math.sqrt(Math.max(0, s.vals.v0 * s.vals.v0 + 2 * G * (s.h0 - n.p.y) / (1 + b)));
      out.push(roll ? { tex: 'v = \\sqrt{v_0^2 + \\dfrac{2 g\\,\\Delta y}{1 + ' + bt + '}}', val: Fmt.vel(v), what: 'the speed energy predicts from the drop: rolling, ½ m v² (1 + β) with β = I/(m r²) = ' + bt + ' for a ' + (s.rider === 'ball' ? 'solid' : 'hollow') + ' ball. Mass and radius cancel; an ice cube would have √(v₀² + 2 g Δy)', mark: Math.abs(v - n.speed) < 2e-3 * Math.max(1, v) ? '✓' : '' }
        : { tex: 'v = \\sqrt{v_0^2 + 2 g\\,\\Delta y}', val: Fmt.vel(v), what: 'the speed energy predicts from the drop since the start (no friction)', mark: Math.abs(v - n.speed) < 2e-3 * Math.max(1, v) ? '✓' : '' }); }
    // a perfect-circle loop: n at its bottom and top, from energy and the circle, beside what the ride itself gave as it passed
    if (s.loopMode === 'circle' && !s.friction && !s.hidden) { const L = s.track.loop, r = L.r, v0 = s.vals.v0, seen = s.ride.seen || {}, m = n.m;
      const vb2 = v0 * v0 + 2 * G * (s.h0 - L.bottom) / (1 + b), vt2 = v0 * v0 + 2 * G * (s.h0 - L.y) / (1 + b), nb = m * (vb2 / r + G), nt = m * (vt2 / r - G);
      const check = (k, pred) => { const got = seen[k]; return !got ? '' : Math.abs(got.n - pred) <= 1e-3 * Math.max(1, Math.abs(pred)) ? '✓ = the ride' : '≠ the ride (' + Fmt.N(got.n) + ')'; };
      out.push({ tex: 'n_{\\text{bottom}} = m(v_{\\text{b}}^2/r + g)', val: Fmt.N(nb), what: 'just inside the circle at the bottom, with v_b from energy (no friction); ✓ once the ride has passed and agrees', mark: check('bottom', nb) });
      if (vt2 < 0) out.push({ tex: 'n_{\\text{top}}', val: 'never gets there', what: 'it has too little energy to reach the top', mark: '' });
      else out.push({ tex: 'n_{\\text{top}} = m(v_{\\text{t}}^2/r - g)', val: Fmt.N(nt), what: 'at the top of the circle, with v_t from energy (no friction)' + (nt < 0 && s.rider !== 'car' ? ': negative, so the ' + s.who + ' leaves the track before the top' : nt < 0 ? ': negative, so the rail pulls the car up' : ''),
        mark: nt < 0 && s.rider !== 'car' ? 'n < 0: leaves first' : check('top', nt) }); }
    const lines = [], A = s.ahead(), who = s.who;
    if (A && !s.hidden) { if (A.turn) lines.push({ t: 'Energy line ' + Fmt.m(A.yE) + ': the ' + who + ' turns back where the track reaches it' + (A.top ? ' (after the ' + Fmt.m(A.top.y) + ' hilltop)' : '') + '.', full: 'The energy line is at ' + Fmt.m(A.yE) + ': the track ahead rises to meet it, so K reaches zero there and the ' + who + ' turns back.' });
      else lines.push({ t: 'Energy line ' + Fmt.m(A.yE) + ': above everything ahead, so it gets over.', full: 'The energy line is at ' + Fmt.m(A.yE) + ', above everything ahead' + (A.top ? ' (the highest hilltop is ' + Fmt.m(A.top.y) + ')' : '') + ': it has the energy to get over.' }); }
    const hm = s.track.hminFor(b), L = s.track.loop, free = s.rider !== 'car', fx = hm && hm.exact ? Fmt.num(hm.f, roll && s.rider === 'hollow' ? 2 : 1) : '';
    if (hm && hm.exact) { if (free) lines.push({ t: 'Lowest start (from rest, no friction): ' + fx + ' r above the bottom = ' + Fmt.m(hm.h) + (s.h0 >= hm.h - 1e-9 ? ' ✓' : ': this start is lower, so it leaves near the top') + '.',
      full: 'To stay on round the loop the ' + who + ' needs v² ≥ g r at the top. From rest with no friction that means starting at least ' + fx + ' r above the bottom: ' + Fmt.m(L.bottom) + ' + ' + fx + ' × ' + Fmt.m(L.r) + ' = ' + Fmt.m(hm.h) + '.' + (roll ? ' Rolling, it needs (1 + β) × ½ m v² of kinetic energy at the top, not ½ m v²: 2 r + (1 + ' + bt + ') r/2 instead of the sliding 2.5 r.' : '') }); }
    else if (hm && free && s.h0 + s.vals.v0 * s.vals.v0 / (2 * G) > hm.y) lines.push({ t: 'Lowest start that keeps the ' + who + ' on (from rest, no friction): ' + Fmt.m(hm.h) + (s.h0 >= hm.h ? ' ✓' : ': this start is lower, so it leaves') + '.', full: 'Lowest start, from rest with no friction, that keeps n ≥ 0 everywhere on the track.' });
    if (L && !L.exact && free) lines.push({ t: 'For a circle, ' + Fmt.num(2 + (1 + b) / 2, s.rider === 'hollow' ? 2 : 1) + ' r above the bottom would be ' + Fmt.m(L.bottom + (2 + (1 + b) / 2) * L.r) + ': this loop is not quite a circle.', full: 'The loop: top at ' + Fmt.m(L.y) + ', radius there r = ' + Fmt.m(L.r) + '. For a circle of radius r the rule is “start 2.5 r above the bottom” = ' + Fmt.m(L.bottom + 2.5 * L.r) + '; this spline loop is not quite a circle, so the exact lowest start differs.' });
    return { resultRows: out, aheadLines: lines }; }

  canvas() { const app = this.app, s = this.sim, sp = s.speed;
    return { setCanvas: app.setCanvas, setGraphCanvas: app.setGraphCanvas,
      clockBtns: [{ label: s.playing ? '❚❚ Pause' : '▶ Run', title: s.playing ? 'Stop the clock (Space)' : 'Start the clock (Space)', style: UI.tool(s.playing), onClick: app.run(() => s.toggle()) },
        { label: '↺', title: 'Reset: back to the start', style: UI.tool(false), onClick: app.run(() => s.reset()) }, { label: '⏭', title: 'Step on 1/30 s (→ and ← jump between events)', style: UI.tool(false), onClick: app.run(() => s.step()) },
        { label: sp === 1 ? '1×' : sp === 0.5 ? '½×' : '¼×', title: 'Speed: full, half or quarter (slow motion)', style: UI.tool(sp < 1), onClick: app.run(() => { const k = Sim.SPEEDS.indexOf(sp); s.speed = Sim.SPEEDS[(k + 2) % 3]; s.bump(); }) }],
      timeStr: 't = ' + Fmt.time(s.time),
      showChips: Sim.SHOW.map(([k, label, title]) => ({ label, title, style: UI.chip(s.show[k]), onClick: app.run(() => s.toggleShow(k)) })),
      graphTabs: Sim.GRAPHS.map(([k, label]) => ({ label, style: UI.tab(s.graph === k), onClick: app.run(() => s.setGraph(k)) })), graphOn: s.graph !== 'off', graphBoxStyle: 'background:#0f1722;border-radius:0 0 10px 10px;overflow:hidden;' + (s.graph === 'off' ? 'display:none;' : ''),
      graphHint: s.graph === 'x' ? 'The green band is the potential energy the track itself gives at each x. Where the dashed mechanical-energy line meets it, K = 0: the turning points.' : s.graph === 'off' ? 'No graph' : 'Drag along the graph to go back to any moment of the run.' }; }

  // ---- the history: step from one noteworthy moment of the run to the next (← →); the canvas shows what happened there and why ----
  history() { const app = this.app, s = this.sim, E = s.events, at = s.evIndex, last = s.evLast, cur = at >= 0 ? at : last, D = cur >= 0 ? s.describe(cur) : null;
    const btn = (on) => 'font-size:11px;font-weight:700;height:22px;min-width:24px;padding:0 6px;margin-bottom:3px;border-radius:6px;cursor:' + (on ? 'pointer' : 'default') + ';border:1px solid #d7dbe0;background:#fff;color:' + (on ? '#3a414a' : '#c3c8ce') + ';';
    const canPrev = E.some((e) => e.t < s.time - 1e-7), canNext = !s.ride.done || E.some((e) => e.t > s.time + 1e-7);
    return { evPrevStyle: btn(canPrev), evNextStyle: btn(canNext), onPrevEvent: app.run(() => s.prevEvent()), onNextEvent: app.run(() => s.nextEvent()),
      evLabel: D ? (at >= 0 ? 'Event ' + (at + 1) + ' of ' + E.length + ': ' : 'After ' + (cur + 1) + ': ') + D.short : 'Events',
      evTitle: D ? (cur + 1) + '. ' + D.title + ' — ' + D.why : 'Step through the run’s noteworthy moments',
      evLabelStyle: "font-family:'Source Sans 3',sans-serif;font-size:11px;font-weight:700;margin-bottom:3px;padding:0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px;cursor:help;color:" + (at >= 0 ? '#8a6310' : '#8a929b') + ';' }; }

  share() { const app = this.app, st = this.ui;
    return { showShare: !!st.showShare, onCloseShare: () => app.setState({ showShare: false }), shareUrl: st.showShare ? Link.url(this.sim, st.shareHide) : '', onCopyShare: () => app.copyShare(), copyLabel: st.shareCopied ? 'Copied' : 'Copy',
      copyBtnStyle: "min-width:86px;flex:none;font-family:'Source Sans 3',sans-serif;font-size:12px;font-weight:700;padding:9px 15px;border-radius:8px;cursor:pointer;border:1px solid " + (st.shareCopied ? '#2f8f56' : 'rgba(224,184,90,0.5)') + ';background:' + (st.shareCopied ? '#2f8f56' : 'rgba(191,138,30,0.3)') + ';color:#fff;',
      shareHide: !!st.shareHide, onToggleShareHide: () => app.setState((x) => ({ shareHide: !x.shareHide, shareCopied: false })), selectAll: (e) => e.target.select() }; }

  info() { const app = this.app;
    return { showInfo: !!this.ui.showInfo, onCloseInfo: () => app.setState({ showInfo: false }), infoFormulas: [
      { expr: 'K = \\tfrac12 m v^2', desc: 'kinetic energy of something that slides (the ice cube, the coaster car)' },
      { expr: 'K = \\tfrac12 m v^2 + \\tfrac12 I\\omega^2 = (1+\\beta)\\,\\tfrac12 m v^2', desc: 'a ball rolling without slipping (ω = v/r, I = β m r²): β = 2/5 for a solid ball, 2/3 for a hollow one. Static friction makes it turn but does no work' },
      { expr: 'U_g = m g h', desc: 'gravitational potential energy, h measured from wherever you put the zero: only changes in it matter' },
      { expr: 'K_i + U_i = K_f + U_f', desc: 'conservation of mechanical energy, when only gravity does work (the normal force is always at right angles to the motion, so it does none)' },
      { expr: 'v = \\sqrt{v_0^2 + 2 g\\,\\Delta h}', desc: 'the speed after a drop Δh, whatever the shape of the track' },
      { expr: 'v = \\sqrt{v_0^2 + \\dfrac{2 g\\,\\Delta h}{1+\\beta}}', desc: 'rolling: slower, since part of the energy spins it; mass and radius cancel (a solid ball: √(10 g Δh/7) from rest)' },
      { expr: '\\Delta E_{\\text{th}} = f_k\\, d', desc: 'friction turns mechanical energy into thermal energy; the total, mechanical plus thermal, stays the same' },
      { expr: 'n = m\\left(g\\cos\\theta \\pm \\dfrac{v^2}{r}\\right)', desc: 'the normal force on a curve of radius r: less than m g cosθ over a crest (−), more in a dip (+)' },
      { expr: 'h \\ge 2.5\\,r', desc: 'something sliding from rest gets round a circular loop of radius r (without friction) only from at least 2.5 r above the bottom: then v² ≥ g r at the top' },
      { expr: 'h \\ge 2.7\\,r', desc: 'a solid ball rolling from rest needs 2.7 r (2 r + 7/10 r): its spin takes part of the energy (a hollow ball needs 2.83 r)' }] }; }

  bugForm() { const app = this.app, st = this.ui, res = st.bugResult || '';
    return { showBug: !!st.showBug, onCloseBug: () => app.setState({ showBug: false }), stopBug: (e) => e.stopPropagation(), onBugText: (e) => app.setState({ bugText: e.target.value }), onBugEmail: (e) => app.setState({ bugEmail: e.target.value }),
      onSubmitBug: () => app.submitBug(), bugBtnLabel: st.bugSending ? 'Sending…' : 'Send report',
      bugBtnStyle: "flex:none;font-family:'Source Sans 3',sans-serif;font-size:12px;font-weight:700;padding:9px 15px;border-radius:8px;cursor:pointer;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.14);color:#fff;opacity:" + (st.bugSending ? '0.6' : '1') + ';',
      bugMsg: res.replace(/^(ok|err):/, ''), bugMsgColor: res.slice(0, 3) === 'ok:' ? '#7fd1a4' : '#f0a5a5' }; }
}

// ---- the address: ?track=<preset>&rider=&mass=&along=<start, m along the track>&speed=&zero=&friction=&points=x:y,x:y…&graph=&hide=1&values=0 (values=0: arrows, height and bars without their numbers)
// (full names, so a cache-buster like ?v=3 is never read; every value clamped to its slider) ----
const Link = {
  url(sim, hide) { const q = new URLSearchParams(), r2 = (x) => String(Math.round(x * 100) / 100); q.set('track', sim.key); q.set('rider', sim.rider); if (sim.loopMode) q.set('loop', sim.loopMode); if (sim.loopMode === 'circle') q.set('radius', String(sim.vals.r)); q.set('mass', String(sim.vals.m)); q.set('along', r2(sim.s0)); q.set('speed', String(sim.vals.v0));
    q.set('zero', String(sim.vals.y0)); q.set('friction', sim.friction ? String(sim.vals.mu) : '0'); if (sim.custom) q.set('points', sim.track.pts.map((p) => r2(p.x) + ':' + r2(p.y)).join(','));
    if (sim.graph !== 'time') q.set('graph', sim.graph); if (hide) q.set('hide', '1'); if (!sim.show.nums) q.set('values', '0'); let base = ''; try { base = location.origin + location.pathname; } catch (e) {} return base + '?' + q.toString(); },
  apply(sim, search) { let q; try { q = new URLSearchParams(search == null ? location.search : search); } catch (e) { return false; } const has = (k) => q.get(k) != null && q.get(k) !== '';
    let any = false; if (has('track') && PRESETS[q.get('track')]) { sim.choose(q.get('track')); any = true; }
    if (has('points')) { const pts = q.get('points').split(',').map((s) => { const [x, y] = s.split(':').map(Number); return Track.clampPt({ x, y }); }); if (pts.every((p) => isFinite(p.x) && isFinite(p.y)) && sim.setPoints(pts)) any = true; }
    if (has('loop') && !has('points')) sim.setLoopMode(q.get('loop')); if (has('radius')) sim.set('r', q.get('radius'));
    if (has('rider')) sim.setRider(q.get('rider')); if (has('mass')) sim.set('m', q.get('mass')); if (has('speed')) sim.set('v0', q.get('speed')); if (has('zero')) sim.set('y0', q.get('zero'));
    if (has('friction')) { const f = Number(q.get('friction')); if (f > 0) { sim.set('mu', f); sim.setFriction(true); } else sim.setFriction(false); }
    if (has('along')) { const a = Number(q.get('along')); if (isFinite(a)) sim.setRelease(a); }
    if (has('graph')) sim.setGraph(q.get('graph')); if (q.get('hide') === '1') sim.hide(true); if (q.get('values') === '0') sim.show.nums = false; return any; },
};
