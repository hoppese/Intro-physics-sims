// =====================================================================
// Panel -- the page around the canvas. Turns the workbench into the values
// the template binds to (toolbar, the selected-part card, the meter list,
// the summary, the overlays). It reads the model and calls back into the
// app; it never changes the circuit itself.
// =====================================================================
const UI = {
  font: "font-family:'Source Sans 3',sans-serif;",
  row: 'display:flex;align-items:center;gap:8px;width:100%;font-size:12px;font-weight:600;color:#3a414a;background:transparent;border:none;border-radius:7px;padding:7px 9px;cursor:pointer;text-align:left;',
  header: 'font-size:9.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#9aa2ab;padding:8px 9px 3px;',
  zoom: 'font-size:12px;font-weight:700;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:6px;cursor:pointer;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#d7dee5;',
  // a toolbar button that lights up while its menu is open
  drop: (on) => 'display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:6px 10px;border-radius:8px;cursor:pointer;border:1px solid ' + (on ? '#bf8a1e' : '#d3d8dd') + ';background:' + (on ? '#f6f0db' : '#fff') + ';color:#525a63;',
  step: (on) => 'font-size:14px;line-height:1;font-weight:600;padding:5px 8px;border-radius:8px;border:1px solid #d3d8dd;background:#fff;color:#525a63;cursor:' + (on ? 'pointer' : 'default') + ';opacity:' + (on ? '1' : '0.35') + ';',
  // the little schematic symbols in the Add menu
  icon(inner) { const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 14" width="24" height="14">' + inner + '</svg>';
    return "width:24px;height:14px;display:inline-block;flex:none;background-repeat:no-repeat;background-position:center;background-size:contain;background-image:url('data:image/svg+xml," + encodeURIComponent(svg) + "');"; },
  // a meter: a ring on its leads with the letter inside, in the meter's own colour
  meterIcon(letter, colour) { return UI.icon('<path stroke="' + colour + '" stroke-width="1.6" fill="none" stroke-linecap="round" d="M1,7 L6,7 M18,7 L23,7"/><circle cx="12" cy="7" r="6" stroke="' + colour + '" stroke-width="1.6" fill="none"/><text x="12" y="10" font-size="8.5" font-weight="700" text-anchor="middle" fill="' + colour + '" font-family="Arial,Helvetica,sans-serif">' + letter + '</text>'); },
};
UI.S = 'stroke="#6b5a2a" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"';
UI.icons = {
  resistor: UI.icon('<path ' + UI.S + ' d="M1,7 L6,7 L8,2 L11,12 L14,2 L17,12 L19,7 L23,7"/>'),
  battery: UI.icon('<path ' + UI.S + ' d="M1,7 L8,7 M17,7 L23,7"/><path stroke="#6b5a2a" stroke-width="1.3" fill="none" d="M8,2 L8,12 M14,2 L14,12"/><path stroke="#6b5a2a" stroke-width="2.6" fill="none" d="M11,4 L11,10 M17,4 L17,10"/>'),
  cap: UI.icon('<path ' + UI.S + ' d="M1,7 L10,7 M13,7 L23,7"/><path stroke="#6b5a2a" stroke-width="2" fill="none" d="M10,2 L10,12 M13,2 L13,12"/>'),
  ind: UI.icon('<path ' + UI.S + ' d="M1,7 L3,7 C3,2 7,2 7,7 C7,2 11,2 11,7 C11,2 15,2 15,7 C15,2 19,2 19,7 L23,7"/>'),
  ac: UI.icon('<path ' + UI.S + ' d="M1,7 L6,7 M18,7 L23,7"/><circle cx="12" cy="7" r="6" ' + UI.S + '/><path stroke="#6b5a2a" stroke-width="1.3" fill="none" stroke-linecap="round" d="M8.6,7 C9.6,3.2 11.2,3.2 12,7 C12.8,10.8 14.4,10.8 15.4,7"/>'),
  volt: UI.meterIcon('V', '#b23843'),
  amm: UI.meterIcon('A', '#4a8a2c'),
  switch: UI.icon('<path ' + UI.S + ' d="M1,7 L7,7 M17,7 L23,7 M7,7 L16,2"/><circle cx="7" cy="7" r="1.5" fill="#6b5a2a"/><circle cx="17" cy="7" r="1.5" fill="#6b5a2a"/>'),
  swdt: UI.icon('<path ' + UI.S + ' d="M1,7 L6,7 M17,3 L23,3 M17,11 L23,11 M6,7 L16,3.4"/><circle cx="6" cy="7" r="1.5" fill="#6b5a2a"/><circle cx="17" cy="3" r="1.5" fill="#6b5a2a"/><circle cx="17" cy="11" r="1.5" fill="#6b5a2a"/>'),
  ground: UI.icon('<path ' + UI.S + ' d="M12,1 L12,6 M6,6 L18,6 M8.5,9 L15.5,9 M10.8,12 L13.2,12"/>'),
};

class Panel {
  constructor(app) { this.app = app; }
  get bench() { return this.app.bench; }
  get ui() { return this.app.state; }
  // is this part's reading being kept from the student right now?
  hidden(el) { return this.ui.hide && !(el && this.ui.peek[el.id]); }

  all() { return { ...this.header(), ...this.toolbar(), ...this.inspector(), ...this.meters(), ...this.summary(), ...this.share(), ...this.info(), ...this.exampleCard(), ...this.bugForm(), stop: (e) => e.stopPropagation() }; }

  // ---- title bar: hide / show solution, the menu ----
  header() { const app = this.app, st = this.ui, set = (p) => () => app.setState(p);
    const row = (a) => "display:flex;align-items:center;gap:8px;width:100%;font-family:'Source Sans 3',sans-serif;font-size:12.5px;font-weight:600;color:#dbe6ef;background:" + (a ? 'rgba(191,138,30,0.36)' : 'transparent') + ';border:none;border-radius:7px;padding:8px 9px;cursor:pointer;text-align:left;';
    const side = (a) => "display:flex;align-items:center;gap:9px;width:100%;font-family:'Source Sans 3',sans-serif;font-size:13px;font-weight:600;color:#dbe6ef;background:" + (a ? 'rgba(191,138,30,0.36)' : 'rgba(255,255,255,0.05)') + ';border:1px solid ' + (a ? 'rgba(224,184,90,0.6)' : 'rgba(255,255,255,0.08)') + ';border-radius:8px;padding:9px 11px;cursor:pointer;text-align:left;';
    const dot = (a) => a ? 'display:inline-block;width:7px;height:7px;border-radius:50%;background:#e0b85a;flex:none;' : 'display:inline-block;width:7px;height:7px;flex:none;';
    const mk = (icon, label, onClick, active) => ({ icon, label, onClick, rowStyle: row(active), sideStyle: side(active), dotStyle: dot(active) });
    const then = (fn) => () => { fn(); app.setState({ menuOpen: false }); };
    const menuItems = [
      mk('←', 'All sims', () => { try { window.open('../', '_blank', 'noopener'); } catch (e) {} }),
      mk('ⓘ', 'Info', () => app.setState((s) => ({ showInfo: !s.showInfo, menuOpen: false })), !!st.showInfo),
      mk('✎', 'Worked example', set({ showExample: true, showSol: false, menuOpen: false }), !!st.showExample),
      mk('↺', 'Clear circuit', then(() => this.bench.loadPreset('blank'))),
      mk('⚒', 'Clean up wires', then(() => this.bench.tidyWires())),
      mk('✨', 'Clean up circuit', then(() => this.bench.tidyLayout())),
      mk('↗', 'Share link', () => app.setState((s) => ({ showShare: true, menuOpen: false, shareCopied: false, shareHide: !!s.hide }))),   // the box starts as the sim is now
      mk('🐞', 'Submit bug', set({ showBug: true, menuOpen: false, bugText: '', bugEmail: '', bugResult: '', bugSending: false })),
    ];
    return { menuItems, variantNote: Scope.on ? 'Probe variant: click any part to plot it' : '', showMenuBtn: !app.big, menuOpen: !!st.menuOpen, onToggleMenu: () => app.setState((s) => ({ menuOpen: !s.menuOpen })), onCloseMenu: set({ menuOpen: false }),
      menuBtnStyle: 'display:flex;align-items:center;justify-content:center;width:32px;height:30px;font-size:16px;border-radius:8px;cursor:pointer;border:1px solid ' + (st.menuOpen ? 'rgba(224,184,90,0.7)' : 'rgba(255,255,255,0.28)') + ';background:' + (st.menuOpen ? 'rgba(191,138,30,0.32)' : 'rgba(255,255,255,0.08)') + ';color:#cfe0f2;',
      onToggleHide: () => app.setState((s) => ({ hide: !s.hide, peek: {} })), hideLabel: st.hide ? 'Show solution' : 'Hide solution',
      hideDotStyle: 'display:inline-block;width:8px;height:8px;border-radius:50%;background:' + (st.hide ? '#7fd1a4' : 'rgba(255,255,255,0.45)') + ';',
      hideBtnStyle: 'min-width:136px;display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;padding:6px 12px;border-radius:20px;cursor:pointer;border:1px solid ' + (st.hide ? '#bf8a1e' : 'rgba(255,255,255,0.25)') + ';background:' + (st.hide ? '#8a6310' : 'rgba(255,255,255,0.08)') + ';color:#fff;' }; }

  // ---- the strip above the canvas, and the zoom buttons on it ----
  toolbar() { const app = this.app, st = this.ui, b = this.bench, sim = b.sim, set = (p) => () => app.setState(p), addItems = [], groups = [];
    for (const type of Object.keys(ELEMENTS)) { const m = ELEMENTS[type].info.menu; if (!m) continue;
      let grp = groups.find((x) => x.name === m.group); if (!grp) { grp = { name: m.group, rows: [{ header: true, isBtn: false, label: m.group, rowStyle: UI.header }] }; groups.push(grp); }
      grp.rows.push({ header: false, isBtn: true, label: m.label, title: m.hint, rowStyle: UI.row, iconText: '', iconStyle: UI.icons[m.svg], onClick: () => { b.add(type); app.setState({ addOpen: false }); } }); }
    // two columns of whole groups, so the menu stays inside a short frame
    { const total = groups.reduce((n, x) => n + x.rows.length, 0); let col = 1, row = 0;
      for (const grp of groups) { if (col === 1 && row && row + grp.rows.length > Math.ceil(total / 2)) { col = 2; row = 0; }
        for (const it of grp.rows) { row++; it.rowStyle += 'grid-column:' + col + ';grid-row:' + row + ';'; addItems.push(it); } } }
    const presetItems = PRESETS.list.map(([name, label]) => ({ label, rowStyle: UI.row, onClick: () => { b.loadPreset(name); app.setState({ presetOpen: false }); } }));
    const zoom = (label, title, fn) => ({ label, title, style: UI.zoom, onClick: app.run(fn) }), playing = sim.playing;
    return { big: app.big, setCanvas: app.setCanvas, hintText: '',
      addOpen: !!st.addOpen, onToggleAdd: () => app.setState((s) => ({ addOpen: !s.addOpen, presetOpen: false })), onCloseAdd: set({ addOpen: false }), addItems, addBtnStyle: UI.drop(st.addOpen),
      presetOpen: !!st.presetOpen, onTogglePreset: () => app.setState((s) => ({ presetOpen: !s.presetOpen, addOpen: false })), onClosePreset: set({ presetOpen: false }), presetItems, presetBtnStyle: UI.drop(st.presetOpen),
      onNewCircuit: () => { b.loadPreset('blank'); app.setState({ addOpen: false, presetOpen: false }); },
      onUndo: app.run(() => b.undo()), onRedo: app.run(() => b.redo()), undoStyle: UI.step(b.history.canUndo), redoStyle: UI.step(b.history.canRedo),
      showTime: sim.timed, onPlay: app.run(() => { sim.playing = !sim.playing; }), playLabel: playing ? '❙❙ Pause' : '▶ Play',
      playStyle: 'font-size:11px;font-weight:700;padding:6px 11px;border-radius:8px;cursor:pointer;border:1px solid ' + (playing ? '#bf8a1e' : '#5a9e3a') + ';background:' + (playing ? '#f6f0db' : '#eef7e6') + ';color:' + (playing ? '#8a6310' : '#4a8a2c') + ';',
      onResetTime: app.run(() => sim.reset()), timeStr: 't = ' + sim.shown.toFixed(2) + ' s',
      zoomBtns: [zoom('−', 'Zoom out', () => b.view.zoomBy(1 / 1.25)), zoom('⤡', 'Fit the circuit in view', () => b.fit()), zoom('+', 'Zoom in', () => b.view.zoomBy(1.25))], zoomPct: b.view.percent }; }

  // ---- the "Selected component" card ----
  inspector() { const app = this.app, b = this.bench, el = b.selected; if (!el) return { hasSel: false, noSel: true };
    const I = el.info, K = el.constructor, name = b.circuit.labels().get(el.id), hide = this.hidden(el), m = b.sol ? b.sol.measure(el) : { dV: NaN, I: NaN };
    const field = (f) => { const d = this.ui.draft; return d && d.id === el.id && d.field === f ? d.text : String(el[f]); }, type = (f) => (e) => app.typeField(f, e.target.value);
    const canFlip = !!el.flipped(), secret = (s) => hide ? '?' : s;
    return { hasSel: true, noSel: false, selKind: I.name, selSym: name ? name.tex : '', selHasSym: !!(name && name.tex),
      selCanDelete: true, onDeleteSel: app.run(() => b.remove()), selCanRotate: !!I.rotatable, onRotateCW: app.run(() => b.rotate(1)), onRotateCCW: app.run(() => b.rotate(-1)),
      selHasValue: !!I.hasValue, selValLabel: I.valueLabel || '', selUnit: I.unit || '', selMin: I.min, selMax: I.max, selStep: I.step, selVal: I.hasValue ? field('value') : '', onSelValue: type('value'), onSelBlur: () => app.endField(false),
      selLabelW: (K.riLimits || K.freqLimits) ? '62px' : '0',     // two number boxes: line their labels up
      selHasRi: !!K.riLimits, selRi: K.riLimits ? field('ri') : '', onSelRi: type('ri'), selHasFreq: !!K.freqLimits, selFreq: K.freqLimits ? field('freq') : '', onSelFreq: type('freq'),
      // Flip sits beside the value box when there is one, and gets a row of its own when there is not
      onFlipSel: app.run(() => b.flip()), selFlipInRow: canFlip && !!I.hasValue, selFlipBelow: canFlip && !I.hasValue, selFlipLabel: I.isThrow ? '⇄ Flip orientation' : '⇄ Swap + and − leads',
      selFlipTitle: I.isThrow ? 'Mirror which side the two contacts sit on' : 'Swap the + and − ends',
      selShowMeas: !!I.showMeas, selVdrop: secret(Fmt.absV(m.dV)), selCurrent: secret(Fmt.A(m.I)),
      selIsCap: el instanceof Capacitor, selCharge: el instanceof Capacitor ? secret(Fmt.Q(Math.abs(el.charge))) : '',
      selIsSwitch: !!I.isSwitch, switchClosed: !!el.closed, onToggleSwitch: app.run(() => b.toggle(el)),
      switchBtnLabel: I.isThrow ? '◉ Position ' + el.position + ' — click for position ' + (3 - el.position) : (el.closed ? '● Closed — click to open' : '○ Open — click to close'),
      selIsMeter: !!I.isMeter, selMeterNote: I.note || '', selIsGround: el instanceof Ground,
      ...this.plot(el),
      // kept for the template's older bindings
      selIsBattery: false, selIsSwdt: false }; }

  // ---- the Probe variant: the selected part is on the graph. Its two readings are themselves the choice of which one is plotted (a row of chips of
  //      their own made the card taller than the canvas), and Keep leaves the trace up once the selection moves on. In the plain sim all of this is inert. ----
  plot(el) { const app = this.app, b = this.bench, nop = () => {};
    if (!Scope.on || !Scope.takes(el)) return { plotVStyle: '', plotVTitle: '', onPlotV: nop, plotIStyle: '', plotITitle: '', onPlotI: nop, keepStyle: 'display:none;', keepLabel: '', keepTitle: '', onKeepTrace: nop };
    const r = b.sim.scope.of(el), can = Scope.modes(el);
    // the padding is cancelled by the margin, so a reading that is a button sits exactly where a plain one does
    const pill = (m, ink, bg) => !can.includes(m) ? '' : 'padding:3px 7px;margin:-3px -7px;border-radius:7px;cursor:pointer;box-shadow:inset 0 0 0 1px ' + (r.mode === m ? ink : '#d3d8dd') + ';background:' + (r.mode === m ? bg : 'transparent') + ';';
    const tip = (m, what) => !can.includes(m) ? '' : r.mode === m ? 'On the graph: the ' + what + ' this part' : 'Click to graph the ' + what + ' this part instead';
    const go = (m) => can.includes(m) ? app.run(() => b.plot(m)) : nop;
    return { plotVStyle: pill('v', '#b23843', '#fdeef0'), plotVTitle: tip('v', 'potential difference across'), onPlotV: go('v'),
      plotIStyle: pill('i', '#4a8a2c', '#eef7e6'), plotITitle: tip('i', 'current through'), onPlotI: go('i'),
      keepLabel: r.kept ? '✓ Kept' : 'Keep', onKeepTrace: app.run(() => b.keepTrace()),
      keepTitle: r.kept ? 'Kept on the graph — click to take it off when this part is no longer selected' : 'Keep this trace on the graph when you click something else',
      keepStyle: 'margin-left:auto;align-self:center;font-size:10.5px;font-weight:700;padding:4px 8px;border-radius:7px;cursor:pointer;border:1px solid ' + (r.kept ? '#8a6310' : '#d3d8dd') + ';background:' + (r.kept ? '#f6f0db' : '#fff') + ';color:' + (r.kept ? '#8a6310' : '#8a929b') + ';' }; }

  // ---- the meter list and whether the graph is showing ----
  meters() { const app = this.app, b = this.bench, names = b.circuit.labels(), list = b.circuit.ofType(Meter);
    const meterList = list.map((m) => { const volt = m instanceof Voltmeter, hidden = this.hidden(m), r = b.sol ? m.reading(b.sol) : { err: 'unsolved' }, color = volt ? '#b23843' : '#4a8a2c', on = !!m.graph, sel = b.selId === m.id;
      return { id: m.id, label: (names.get(m.id) || {}).text || '', kindLabel: volt ? 'across' : 'in-line', color, hidden, shown: !hidden, graphOn: on,
        reading: r.err ? Fmt.none : (volt ? Fmt.V(r.dV) : Fmt.signedA(r.I)),
        onPeek: (e) => { e.stopPropagation(); app.setState((s) => ({ peek: { ...s.peek, [m.id]: true } })); },
        onSelect: app.run(() => { b.select(m); b.probe = null; }), onGraph: (e) => { e.stopPropagation(); b.toggleGraph(m); app.refresh(); },
        graphBtnStyle: 'font-size:10px;font-weight:700;padding:4px 8px;border-radius:6px;cursor:pointer;border:1px solid ' + (on ? color : '#d3d8dd') + ';background:' + (on ? (volt ? '#fdeef0' : '#eef7e6') : '#fff') + ';color:' + (on ? color : '#8a929b') + ';',
        rowStyle: 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:9px;cursor:pointer;border:1px solid ' + (sel ? color : '#eceef0') + ';background:' + (volt ? '#fdf6f7' : '#f7fbef') + ';' }; });
    return { hasMeters: list.length > 0, noMeters: list.length === 0, meterList, ...this.graph(names) }; }

  // ---- the graph: docked along the bottom of the canvas, or enlarged to cover it ----
  graph(names) { const app = this.app, b = this.bench, d = app.dock, c = b.circuit;
    const btn = 'font-family:\'Source Sans 3\',sans-serif;font-size:11px;font-weight:700;line-height:1;height:22px;padding:0 8px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:5px;border:1px solid rgba(255,255,255,0.2);background:rgba(20,31,44,0.92);color:#d7dee5;';
    // enlarged, the circuit is out of sight: its switches can be thrown from here, to watch what follows
    const switches = !d.big ? [] : c.parts.filter((s) => s.info.isSwitch).map((s) => { const name = (names.get(s.id) || {}).text || 'Switch', thrown = s.info.isThrow;
      return { label: name + (thrown ? ' ◉ position ' + s.position : (s.closed ? ' ● closed' : ' ○ open')), title: thrown ? 'Throw ' + name + ' to position ' + (3 - s.position) : (s.closed ? 'Open ' : 'Close ') + name,
        style: btn + 'color:' + (thrown || s.closed ? '#9be0b4' : '#f0b6b6') + ';', onClick: app.run(() => b.toggle(s)) }; });
    const size = { label: d.big ? '✕' : '⤢', title: d.big ? 'Back to the circuit (Esc)' : 'Enlarge the graph', style: btn + (d.big ? '' : 'height:20px;padding:0 6px;font-size:12px;'), onClick: () => app.setState((s) => ({ graphBig: !s.graphBig })) };
    // docked, the button sits in the top row against the plot's corner, clear of the numbers of a current axis
    const inset = d.big ? 'top:5px;right:6px;' : 'top:1px;right:' + GraphPainter.gutter(d.h, b.traces().some((tr) => tr.kind === 'amm')) + 'px;';
    return { showGraph: d.on, setGraphCanvas: app.setGraphCanvas, graphBtns: [...switches, size], graphBtnsStyle: 'position:absolute;' + inset + 'display:flex;align-items:center;gap:6px;', graphTip: d.big ? 'Click to go back to the circuit' : 'Click to enlarge',
      graphDockStyle: 'position:absolute;left:0;right:0;bottom:0;z-index:3;overflow:hidden;height:' + (d.big ? d.full : d.h) + 'px;transition:height 0.2s ease;background:#0b121b;'
        + 'border-radius:' + (d.big ? '10px' : '0 0 10px 10px') + ';box-shadow:0 -1px 0 rgba(255,255,255,0.16);cursor:' + (d.big ? 'zoom-out' : 'zoom-in') + ';',
      zoomBoxStyle: 'position:absolute;bottom:' + (d.h + 10) + 'px;right:10px;display:flex;align-items:center;gap:4px;background:rgba(15,23,34,0.78);border:1px solid rgba(255,255,255,0.14);border-radius:8px;padding:4px;' }; }

  // ---- one line on what the circuit is doing ----
  summary() { const b = this.bench, c = b.circuit, sol = b.sol, sim = b.sim, n = (K) => c.ofType(K).length, plural = (k, one, many) => k ? k + ' ' + (k > 1 ? many : one) : '';
    if (c.isEmpty) return { statusText: 'empty', summaryText: 'Use + Add Element to put parts on the grid, or load a preset above.' };
    if (sol && sol.shorted) return { statusText: 'short circuit', summaryText: 'A source is shorted by a zero-resistance path — current would be unlimited. Add a resistor in that loop.' };
    if (!sol || !sol.solved) return { statusText: 'no solution', summaryText: 'Part of the circuit can’t be solved as wired — look for a loop with a source or an inductor and no resistance in it.' };
    const bits = [plural(n(Resistor), 'resistor', 'resistors'), plural(n(Battery), 'battery', 'batteries'), plural(n(AcSource), 'AC source', 'AC sources'), plural(n(Capacitor), 'capacitor', 'capacitors'), plural(n(Inductor), 'inductor', 'inductors')].filter(Boolean);
    // an open switch only matters once it is wired in; "running" only means something once a part is
    const open = c.ofType(Switch).some((s) => !s.closed && c.wired(s)), switches = n(Switch) + n(ThrowSwitch), wiredUp = c.parts.some((e) => !(e instanceof Ground) && c.wired(e));
    let text = (open ? 'Switch open — click its lever to close the loop. ' : '') + (bits.join(', ') || 'No source or load yet');
    if (!wiredUp) text += ' — nothing is wired up yet. Drag from a terminal to lay wire.';
    else if (c.reactive) text += sim.playing ? ' — running.' + (open ? '' : ' ' + (switches ? 'Throw a switch or press' : 'Press') + ' ↻ t=0 to watch the transient from the start.') : ' — paused. Press Play to run the transient.';
    else text += c.ofType(Meter).length ? '.' : ' — add meters to read any branch, or click a part to see its ΔV and I.';
    if (!c.ofType(Ground).length) text += ' Add a ground if you want to probe node potentials.';
    return { statusText: sim.timed ? 't = ' + sim.shown.toFixed(2) + ' s' : 'DC solved', summaryText: text }; }

  // ---- overlays ----
  share() { const app = this.app, st = this.ui;
    return { showShare: !!st.showShare, onCloseShare: () => app.setState({ showShare: false }), shareUrl: st.showShare ? ShareLink.url(this.bench.circuit, st.shareHide) : '', onCopyShare: () => app.copyShare(), copyLabel: st.shareCopied ? 'Copied' : 'Copy',
      copyBtnStyle: "min-width:86px;flex:none;font-family:'Source Sans 3',sans-serif;font-size:12px;font-weight:700;padding:9px 15px;border-radius:8px;cursor:pointer;border:1px solid " + (st.shareCopied ? '#2f8f56' : 'rgba(224,184,90,0.5)') + ';background:' + (st.shareCopied ? '#2f8f56' : 'rgba(191,138,30,0.3)') + ';color:#fff;',
      shareHide: !!st.shareHide, onToggleShareHide: () => app.setState((s) => ({ shareHide: !s.shareHide, shareCopied: false })), selectAll: (e) => e.target.select() }; }

  info() { const app = this.app;
    return { showInfo: !!this.ui.showInfo, onCloseInfo: () => app.setState({ showInfo: false }), infoFormulas: [
      { expr: '\\Delta V_R = IR', desc: 'Ohm’s law for each resistor' },
      { expr: 'I_C = C\\,\\dfrac{d(\\Delta V_C)}{dt}', desc: 'capacitor current follows the rate of voltage change' },
      { expr: '\\Delta V_L = L\\,\\dfrac{dI}{dt}', desc: 'inductor voltage follows the rate of current change' },
      { expr: '\\textstyle\\sum I_{\\text{in}}=\\sum I_{\\text{out}}', desc: 'Kirchhoff’s current law at every node' }] }; }

  exampleCard() { const app = this.app, st = this.ui, ex = app.example, m = st.showExample ? ex.model() : null, pick = (kind) => () => { app.example = new WorkedExample(kind); app.setState({ showSol: false }); };
    const exKinds = WorkedExample.ORDER.map(([k, label]) => ({ label, onClick: pick(k), style: 'font-size:11.5px;font-weight:700;padding:6px 12px;border-radius:8px;cursor:pointer;border:1px solid ' + (ex.kind === k ? 'rgba(240,185,207,0.7)' : 'rgba(224,165,192,0.25)') + ';background:' + (ex.kind === k ? 'rgba(240,185,207,0.28)' : 'rgba(255,255,255,0.05)') + ';color:#fff;' }));
    const steps = m ? m.steps : [], last = steps.length - 1;
    return { showExample: !!st.showExample, showSol: !!st.showSol, exTitle: m ? m.title : '', exBlurb: m ? m.blurb : '', exTip: m ? m.tip : '', exKinds, exGiven: m ? m.given : [],
      exSteps: steps.map((s, i) => ({ ...s, boxStyle: 'background:' + (i === last ? 'rgba(240,185,207,0.12)' : 'rgba(255,255,255,0.05)') + ';border:1px solid ' + (i === last ? 'rgba(240,185,207,0.3)' : 'transparent') + ';border-radius:10px;padding:10px 13px;' })),
      onShowExample: () => app.setState({ showExample: true, showSol: false }), onCloseExample: () => app.setState({ showExample: false }), onShowSol: () => app.setState((s) => ({ showSol: !s.showSol })),
      onNewNumbers: () => { ex.roll(); app.setState({ showSol: false }); }, onBuildEx: () => { ex.build(this.bench); app.setState({ showExample: false }); },
      solBtnLabel: st.showSol ? 'Hide solution' : 'Show solution →', solBtnBg: st.showSol ? 'rgba(255,255,255,0.08)' : 'rgba(240,185,207,0.16)' }; }

  bugForm() { const app = this.app, st = this.ui, res = st.bugResult || '';
    return { showBug: !!st.showBug, onCloseBug: () => app.setState({ showBug: false }), stopBug: (e) => e.stopPropagation(), onBugText: (e) => app.setState({ bugText: e.target.value }), onBugEmail: (e) => app.setState({ bugEmail: e.target.value }),
      onSubmitBug: () => app.submitBug(), bugBtnLabel: st.bugSending ? 'Sending…' : 'Send report',
      bugBtnStyle: "flex:none;font-family:'Source Sans 3',sans-serif;font-size:12px;font-weight:700;padding:9px 15px;border-radius:8px;cursor:pointer;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.14);color:#fff;opacity:" + (st.bugSending ? '0.6' : '1') + ';',
      bugMsg: res.replace(/^(ok|err):/, ''), bugMsgColor: res.slice(0, 3) === 'ok:' ? '#7fd1a4' : '#f0a5a5' }; }
}
