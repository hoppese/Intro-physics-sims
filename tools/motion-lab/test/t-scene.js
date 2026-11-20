// The picture and the panel: every activity, task, target, preset and toggle draws without error at two sizes, while
// running and after; the labels never cover each other; the share link round-trips; it loads paused.
const L = require('./load.js'), { Sim, Renderer, Panel, Link, TARGETS, ok, near, done } = L;
let font = 12; const grad = { addColorStop() {} };
const g = new Proxy({}, { get: (t, k) => k === 'measureText' ? (s) => ({ width: String(s).length * font * 0.6 }) : (k === 'createRadialGradient' || k === 'createLinearGradient') ? () => grad : (typeof k === 'string' && /^[a-z]/.test(k) && !(k in t) ? () => {} : t[k]),
  set: (t, k, v) => { if (k === 'font') { const m = String(v).match(/(\d+(\.\d+)?)px/); if (m) font = parseFloat(m[1]); } t[k] = v; return true; } });
const app = (sim, state) => ({ sim, state: state || { showWork: true }, big: false, run: (fn) => fn, refresh() {}, setState() {}, setCanvas() {}, copyShare() {}, submitBug() {} });
const r = new Renderer();
const overlaps = (B) => { for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) { const a = B[i], b = B[j]; if (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.5 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.5) return [a, b]; } return null; };
function look(sim, tag) { let fine = true, worst = ''; for (const [W, H] of [[600, 600], [360, 540], [800, 660], [560, 430], [700, 470]]) { try { r.draw(g, sim, W, H); new Panel(app(sim)).all(); } catch (e) { fine = false; console.log(tag, e.stack.split('\n').slice(0, 4).join(' | ')); break; }
    const o = overlaps(r.boxes); if (o && !worst) worst = W + 'x' + H + ' ' + JSON.stringify(o.map((b) => [Math.round(b.x0), Math.round(b.y0), Math.round(b.x1), Math.round(b.y1), b.what])); }
  ok(fine, tag + ': draws'); ok(!worst, tag + ': no label covers another ' + worst); }
function runThrough(sim, tag) { look(sim, tag + ' at rest'); sim.play(); for (let i = 0; i < 1200 && sim.playing; i++) { sim.tick(1 / 60); if (i % 90 === 0) look(sim, tag + ' t=' + sim.t.toFixed(1)); } look(sim, tag + ' end');
  for (const k of ['hints', 'dots', 'arrows', 'nums']) { sim.toggleShow(k); look(sim, tag + ' ' + k); sim.toggleShow(k); } sim.seek(sim.T * 0.4); look(sim, tag + ' scrubbed back'); }

// match: drive every target (with the throttle, then dragging), and sketch each graph of each
for (const T of TARGETS) { const s = new Sim(); s.setTarget(T.key); s.throttle(0.25); runThrough(s, 'drive ' + T.key); ok(s.result && isFinite(s.result.pct), 'drive ' + T.key + ': scored');
  const d = new Sim(); d.setTarget(T.key); d.play(); for (let i = 0; i < 300; i++) { d.dragTo(1 + 0.004 * i); d.tick(1 / 60); } d.release(); look(d, 'drag ' + T.key);
  for (const k of ['x', 'v']) { const s2 = new Sim(); s2.setTask('sketch'); s2.setTarget(T.key); s2.setSketchOf(k); runThrough(s2, 'sketch ' + k + ' ' + T.key); for (let i = 0; i <= 50; i++) s2.pen(i / 5, k === 'x' ? 2 : 0.1, i === 0); s2.penUp(); ok(s2.check(), 'sketch ' + T.key + ': checks'); look(s2, 'sketch checked ' + T.key);
    const p = new Panel(app(s2)).all(); ok(p.matchScore.endsWith('%'), 'sketch ' + T.key + ': the panel shows a score'); } }
// Values off: the arrows and the track keep their symbols but lose their numbers (the graphs keep their read-outs); on again, the numbers are back
{ const said = []; const was = r.say; r.say = function (runs, ...a) { said.push(runs.map((x) => x.t).join('')); return was.call(this, runs, ...a); };      // (the track's labels; the graphs' read-outs stay as they are)
  const nums = () => said.some((t) => /^([AB] +)?[xva]x? = -?[0-9]/.test(t));      // (a label on the track: not the status line's sentence)
  for (const mode of ['match', 'cars', 'program', 'diagram']) { const s = new Sim(); s.choose(mode); s.play(); for (let i = 0; i < 90; i++) s.tick(1 / 60); s.pause && s.pause();
    said.length = 0; r.draw(g, s, 700, 470); const on = nums(), arrowsOn = said.some((t) => /^vx/.test(t));
    s.toggleShow('nums'); said.length = 0; r.draw(g, s, 700, 470); ok(on && !nums(), mode + ': Values off takes the numbers off the track'); ok(!arrowsOn || said.some((t) => t === 'vx'), mode + ': the arrows keep their symbols');
    if (mode === 'cars') ok(said.includes('A') && said.includes('B'), 'cars: each car keeps its letter');
    look(s, mode + ' values off'); s.toggleShow('nums'); said.length = 0; r.draw(g, s, 700, 470); ok(nums(), mode + ': and on again they are back'); }
  r.say = was; }
{ const rt = (a) => { const url = Link.url(a), b = new Sim(); Link.apply(b, url.slice(url.indexOf('?'))); return b; }; const s = new Sim(); s.choose('cars'); s.toggleShow('nums'); const b = rt(s); ok(b.show.nums === false && Link.url(s).includes('values=0'), 'share: Values off comes back off'); ok(rt(new Sim()).show.nums === true && !Link.url(new Sim()).includes('values'), 'share: on by default, and not in the link'); }
// while sketching, nothing gives the answer away: no read-outs, no arrows, no other curves
{ const s = new Sim(); s.setTask('sketch'); s.play(); for (let i = 0; i < 120; i++) s.tick(1 / 60); const p = new Panel(app(s)).all(); ok(p.nowRows.length === 0 && p.nowHidden, 'sketching: the read-outs are hidden'); ok(s.snapshot().bodies.length === 0, 'sketching: the page reports no values'); }
// cars, program, diagram: every preset and case
for (const P of Sim.CARS) { const s = new Sim(); s.choose('cars'); s.setCars(P.key); runThrough(s, 'cars ' + P.key); }
{ const s = new Sim(); s.choose('cars'); s.setCar('B', 'v0', -40); s.setCar('A', 'a', -5); runThrough(s, 'cars reversing'); }
{ const s = new Sim(); s.choose('program'); runThrough(s, 'program'); s.addPiece(); s.setPiece(3, 'a', -1.5); s.setPiece(3, 'd', 6); runThrough(s, 'program reversing'); ok(s.prog.pieces.length === 4, 'a piece is added');
  for (let i = 0; i < 9; i++) s.addPiece(); ok(s.prog.pieces.length === Sim.MAXPIECES, 'no more than ' + Sim.MAXPIECES + ' pieces'); s.removePiece(0); ok(s.prog.pieces.length === Sim.MAXPIECES - 1, 'a piece is removed'); }
for (const C of Sim.CASES) { const s = new Sim(); s.choose('diagram'); s.setCase(C.key); runThrough(s, 'diagram ' + C.key); }
// the signs in the diagram panel
{ const s = new Sim(); s.choose('diagram'); s.setCase('down-left'); const p = new Panel(app(s)).all(); ok(p.signRows[0].val === '−' && p.signRows[1].val === '+' && /slowing/.test(p.signHow), 'slowing toward −x: v −, a +, slowing down');
  s.setCase('up-left'); ok(/speeding/.test(new Panel(app(s)).all().signHow), 'speeding up toward −x');
  s.setCase('turn'); s.seek(2); const q = new Panel(app(s)).all(); ok(/turning/.test(q.signHow) && q.signRows[0].val === '0', 'at the turning point: v = 0, turning round'); }
// the worked meeting in the panel
{ const s = new Sim(); s.choose('cars'); s.setCars('bus'); const p = new Panel(app(s)).all(); ok(p.meetLines.some((l) => /t = 4/.test(l.tex)) && p.meetLines.some((l) => /t = 20/.test(l.tex)), 'bus: both meetings are written out');
  ok(p.meetLines[2].tex.includes('-0.25t^2 + 6t - 20 = 0'), 'bus: the equation is written as on paper (' + p.meetLines[2].tex + ')');
  s.setCars('miss'); ok(new Panel(app(s)).all().meetLines.some((l) => /closest/.test(l.note)), 'miss: the closest approach is given'); }
ok(Panel.poly(1, -1, 0) === 't^2 - t' && Panel.poly(0, 0, 0) === '0' && Panel.poly(-1.25, 20, 30) === '-1.25t^2 + 20t + 30', 'polynomials are written as on paper');

// the share link: each activity comes back as it was; nonsense and out-of-range values are handled; ?v= is not a setting
const round = (a) => { const url = Link.url(a), b = new Sim(); Link.apply(b, url.slice(url.indexOf('?'))); return b; };
{ const a = new Sim(); a.setTask('sketch'); a.setTarget('turn-x'); a.setSketchOf('x'); const b = round(a); ok(b.mode === 'match' && b.task === 'sketch' && b.targetKey === 'turn-x' && b.sketchOf === 'x', 'share: a sketch task comes back'); }
{ const a = new Sim(); a.choose('cars'); a.setCars('toward'); ok(round(a).carsKey === 'toward', 'share: a car preset comes back'); a.setCar('A', 'v0', 17.5); a.setTime(33); const b = round(a); ok(b.cars.A.v0 === 17.5 && b.cars.time === 33 && b.cars.B.x0 === 300, 'share: changed cars come back'); }
{ const a = new Sim(); a.choose('program'); a.setPiece(1, 'a', 0.7); a.addPiece(); a.setProg('v0', -3); const b = round(a); ok(b.mode === 'program' && b.prog.pieces.length === 4 && b.prog.pieces[1].a === 0.7 && b.prog.v0 === -3, 'share: a program comes back'); }
{ const a = new Sim(); a.choose('diagram'); a.setDiag('a', -2.2); const b = round(a); ok(b.mode === 'diagram' && b.diag.a === -2.2 && b.diag.v0 === 3.2, 'share: a changed diagram comes back'); }
{ const b = new Sim(); Link.apply(b, '?activity=cars&velocityA=999&accelB=-80'); ok(b.cars.A.v0 === 40 && b.cars.B.a === -5, 'share: values are clamped');
  const c = new Sim(); Link.apply(c, '?v=7&activity=diagram'); ok(c.mode === 'diagram' && c.diag.v0 === 3.2, 'share: a cache-buster ?v=7 is not a velocity');
  const d = new Sim(); ok(!Link.apply(d, '?activity=nonsense') && d.mode === 'match', 'share: nonsense leaves the default'); }

// loads paused; Run moves; Reset puts it back
{ const s = new Sim(); ok(!s.playing && s.t === 0 && s.mode === 'match', 'loads paused at t = 0, matching a graph'); s.choose('program'); s.play(); for (let i = 0; i < 60; i++) s.tick(1 / 60); ok(s.t > 0.9 && s.motion().at(s.t).x > 0.5, 'Run moves it'); s.reset(); ok(!s.playing && s.t === 0, 'Reset: back to 0, paused');
  s.play(); for (let i = 0; i < 2000; i++) s.tick(1 / 60); ok(!s.playing && Math.abs(s.t - s.T) < 1e-9, 'the clock stops at the end'); s.play(); ok(s.playing && s.t === 0, 'Run at the end starts again'); }
// velocity programs: draw and run, with the spikes; switching keeps each list; the panel says what the jumps are
{ const s = new Sim(); s.choose('program'); s.setBuild('v'); runThrough(s, 'velocity program'); const p = new Panel(app(s)).all();
  ok(p.pieceRows.length === 3 && p.pieceRows[0].q.tex === 'v_x' && p.pieceRows[0].facts.length === 1 && /Δx/.test(p.pieceRows[0].facts[0].t), 'velocity pieces: vₓ and Δt, with Δx');
  ok(!p.progFields.some((f) => f.tex === 'v_{0x}'), 'velocity pieces: no starting-velocity box (the first piece sets it)'); ok(/jumps/.test(p.jumpNote), 'the jumps are explained');
  s.show.hints = true; s.seek(8); look(s, 'velocity program, slope & area'); s.setBuild('a'); const q = new Panel(app(s)).all(); ok(q.pieceRows[0].facts.length === 3 && !q.jumpNote, 'acceleration pieces: Δvₓ, Δx, vₓ after'); }
{ const a = new Sim(); a.choose('program'); a.setBuild('v'); a.setPiece(1, 'v', 0.5); a.setProg('x0', -4); const b = round(a); ok(b.byVel && b.pieces.length === 3 && b.pieces[1].v === 0.5 && b.prog.x0 === -4, 'share: a velocity program comes back');
  const c = round((() => { const z = new Sim(); z.choose('program'); return z; })()); ok(!c.byVel && c.pieces[2].a === -2.5, 'share: an acceleration program comes back'); }
// a braking car: drawn at rest after it stops, the worked solution uses x_stop
{ const s = new Sim(); s.choose('cars'); s.setCar('A', 'x0', 0); s.setCar('A', 'v0', 4); s.setCar('A', 'a', 0); s.setCar('B', 'x0', 10); s.setCar('B', 'v0', 12); s.setCar('B', 'a', -3); runThrough(s, 'cars braking');
  const L = new Panel(app(s)).all().meetLines; ok(L.some((l) => /B stops at/.test(l.tex) && /4\.00/.test(l.tex)), 'the stop is worked out: t = −v0x/ax = 4.00 s'); ok(L.some((l) => /x_\{B,\\text\{stop\}\}/.test(l.tex)), 'the meeting equation uses x_B,stop');
  ok(L.some((l) => /t = 8\.50/.test(l.tex)), 'and gives t = 8.50 s'); }
// folded, the working shows just the answers; menus list every choice and pick it
{ const s = new Sim(); s.choose('cars'); s.setCars('bus'); const p = new Panel(app(s, {})).all(); ok(p.meetLines.length === 2 && p.meetLines.every((l) => /^t = /.test(l.tex)), 'folded working: just the two answers');
  ok(/Show/.test(p.workLabel), 'and a Show the working button'); ok(p.carsMenu.items.length === Sim.CARS.length && p.carsMenu.label === 'Catch the bus (twice)', 'the setups menu');
  p.carsMenu.items[0].onClick(); ok(s.carsKey === 'chase', 'picking from the menu sets it up');
  const q = new Panel(app(s, {})).all(); ok(q.actMenu.items.length === 4 && q.actMenu.label === 'Two cars, one road', 'the activity menu'); q.actMenu.items[2].onClick(); ok(s.mode === 'program', '... picks an activity');
  s.choose('match'); const r = new Panel(app(s, {})).all(); ok(r.targetMenu.items.length === TARGETS.length && r.targetMenu.tag.includes('★'), 'the targets menu, with stars');
  s.choose('diagram'); const d = new Panel(app(s, {})).all(); ok(d.caseMenu.items.length === Sim.CASES.length && d.caseMenu.label === 'Turning round', 'the cases menu'); }
// number boxes get an ASCII minus (a number input shows nothing for '−')
{ const s = new Sim(); s.choose('diagram'); const f = new Panel(app(s)).all().diagFields.find((x) => x.tex === 'a_x'); ok(f.text === '-1.6', 'a negative setting shows in its number box (' + f.text + ')'); }
done('scene');
