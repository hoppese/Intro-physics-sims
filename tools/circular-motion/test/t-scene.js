// The picture and the panel: every situation, variant, road, view and toggle draws without error, while running and
// after something gives out; the labels never cover each other; the share link round-trips.
const L = require('./load.js'), { V3, Sim, Renderer, Panel, Link, SITUATIONS, ok, near, done } = L;
let font = 12; const grad = { addColorStop() {} };
const g = new Proxy({}, { get: (t, k) => k === 'measureText' ? (s) => ({ width: String(s).length * font * 0.6 }) : (k === 'createRadialGradient' || k === 'createLinearGradient') ? () => grad : (typeof k === 'string' && /^[a-z]/.test(k) && !(k in t) ? () => {} : t[k]),
  set: (t, k, v) => { if (k === 'font') { const m = String(v).match(/(\d+(\.\d+)?)px/); if (m) font = parseFloat(m[1]); } t[k] = v; return true; } });
const app = (sim) => ({ sim, state: {}, big: false, run: (fn) => fn, refresh() {}, setState() {}, setCanvas() {}, copyShare() {}, submitBug() {} });
const r = new Renderer();
for (const key of Object.keys(SITUATIONS)) { const C = SITUATIONS[key]; for (const variant of (C.VARIANTS || [[null]]).map((x) => x[0])) for (const road of ['dry', 'wet', 'icy']) {
  const sim = new Sim(); sim.choose(key); if (variant) sim.setVariant(variant); sim.setRoad(road); const panel = new Panel(app(sim)), tag = key + (variant ? '/' + variant : '') + ' ' + road; let fine = true, worst = '';
  const look = (what) => { for (const [W, H] of [[600, 440], [360, 300]]) { sim.cam.resize(W, H); try { r.draw(g, sim, W, H); panel.all(); } catch (e) { fine = false; console.log(tag, what, e.stack.split('\n').slice(0, 3).join(' | ')); return; }
      const B = r.boxes.slice(-r.labels.length); for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) { const a = B[i], b = B[j]; if (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.5 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.5 && !worst) worst = what + ' ' + W + 'x' + H; } } };
  for (const v of ['3d', 'top', 'side']) { sim.view(v); look(v); }
  sim.view('3d'); for (const k of ['comps', 'axes']) { sim.toggleShow(k); look(k); } sim.hide(true); look('hidden'); sim.hide(false);
  sim.play(); for (let i = 0; i < 240; i++) { sim.tick(1 / 60); if (i % 40 === 0) look('running'); }
  if (key === 'puck') { sim.snip(); for (let i = 0; i < 200; i++) sim.tick(1 / 60); look('cut'); }
  if (key === 'vertical') { sim.set('vb', sim.sit.vbmin * 0.9); sim.play(); for (let i = 0; i < 180; i++) { sim.tick(1 / 60); if (i % 20 === 0) look('slack'); } }
  if (key === 'orbit') for (const v of [7.2, 7.9, 11.2]) { sim.set('v', v); sim.play(); for (let i = 0; i < 900; i++) { sim.tick(1 / 60); if (i % 150 === 0) look('orbit at ' + v); } ok(sim.trail.length <= 4000, 'orbit: the trail stays short'); }
  if (key === 'flat' || key === 'banked') { sim.set('v', 35); sim.play(); for (let i = 0; i < 120; i++) { sim.tick(1 / 60); if (i % 30 === 0) look('too fast'); } }
  ok(fine, tag + ': draws in every view, toggle and state'); ok(!worst, tag + ': no label covers another' + (worst ? ' (' + worst + ')' : '')); } }

// the table: ΣF_r beside m v²/r, equal on the circle
for (const key of Object.keys(SITUATIONS)) { const sim = new Sim(); sim.choose(key); const t = new Panel(app(sim)).table(); ok(t.checks.some((c) => /equal/.test(c.mark || '')), key + ': the table shows ΣF_r = m v²/r');
  sim.hide(true); const h = new Panel(app(sim)).table(); ok(h.forceRows.length === 0 && h.checks.length === 0 && !h.keys.some((k) => /^a/.test(k.tex)), key + ': hidden, no force, sum or acceleration is shown'); }

// the share link: the situation, variant, road and every setting come back; values out of range are clamped
{ const a = new Sim(); a.choose('banked'); a.setRoad('wet'); a.set('bank', 27); a.set('v', 21.5); const url = Link.url(a, true), b = new Sim(); Link.apply(b, url.slice(url.indexOf('?')));
  ok(b.key === 'banked' && b.sit.road === 'wet' && b.sit.vals.bank === 27 && b.sit.vals.v === 21.5 && b.hidden, 'share link: the setup comes back as it was');
  const c = new Sim(); Link.apply(c, '?s=vertical&variant=loop&bottomspeed=999&radius=-5'); ok(c.key === 'vertical' && c.sit.variant === 'loop' && c.sit.vals.vb === 30 && c.sit.vals.r === 4, 'share link: values are clamped to the sliders');
  const o = new Sim(); o.choose('orbit'); o.set('alt', 2000); const ou = Link.url(o), o2 = new Sim(); Link.apply(o2, ou.slice(ou.indexOf('?'))); ok(o2.key === 'orbit' && o2.sit.vals.alt === 2000 && o2.sit.circular, 'share link: an orbit comes back, still circular');
  const e = new Sim(); Link.apply(e, '?v=3&s=flat'); ok(e.sit.vals.v === 15, 'share link: a cache-buster ?v=3 is not a speed');
  const d = new Sim(); Link.apply(d, '?s=nonsense'); ok(d.key === 'puck', 'share link: nonsense leaves the default'); }

// loads paused; Run, then Reset, puts it back where it began
{ const s = new Sim(); ok(!s.playing && s.time === 0, 'loads paused at t = 0'); const p0 = s.sit.now().p; s.play(); for (let i = 0; i < 30; i++) s.tick(1 / 60); ok(V3.len(V3.sub(s.sit.now().p, p0)) > 0.1, 'Run moves it');
  s.reset(); ok(!s.playing && V3.len(V3.sub(s.sit.now().p, p0)) < 1e-12, 'Reset puts it back, paused'); }

done('scene');
