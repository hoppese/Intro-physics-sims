/* mp-tools.js — shared helpers for the math-practice sims.
   Loaded by each standalone sim page. Three things:

   1. Embed / expand  — canvas sits top-left; a corner drag-handle on the card
      grows the canvas area in place (standalone only); the ⤢ on the title pops
      the sim out to a new tab. Inside an iframe: pop-out only. ?big=1 starts wide.
   2. Responsive canvas — the <canvas data-mp-canvas> backing store tracks its
      rendered size (× dpr); MP.onResize(fn) is called (debounced) after each
      change so the sim redraws.
   3. Preview mode — ?preview=1 adds a level picker and an answer-key panel so a
      teacher can click through every level's problems without solving them.
      The sim registers via MP.register({ setLevel, currentLevel, levels,
      answerText, nextProblem }).
   4. MP.orbit3d — a drag-to-orbit projector for the 3D levels.

   No build step; plain ES5-ish so it runs anywhere the sims do. */
(function () {
  "use strict";
  var MP = (window.MP = window.MP || {});
  var embedded = false;
  try { embedded = window.self !== window.top; } catch (e) { embedded = true; }
  MP.embedded = embedded;
  MP.big = /[?&]big=1(&|$)/.test(location.search);
  MP.preview = /[?&]preview=1(&|$)/.test(location.search);

  var sim = null;                 // registered sim interface
  var resizeFns = [];
  MP.onResize = function (fn) { resizeFns.push(fn); };
  function fireResize() { for (var i = 0; i < resizeFns.length; i++) try { resizeFns[i](); } catch (e) {} }

  /* ---------- responsive canvas ---------- */
  function wireCanvas(cv) {
    // backing store = CSS pixel size (dpr 1) so every sim can just read
    // cv.width / cv.height as its drawing surface. Slight softness on retina,
    // in exchange for zero per-sim coordinate math.
    function fit() {
      var r = cv.getBoundingClientRect();
      var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      cv._mpDpr = 1;
    }
    MP._fitCanvas = fit;
    fit();
    if (window.ResizeObserver) {
      var raf = 0;
      new ResizeObserver(function () {
        if (raf) return;
        raf = requestAnimationFrame(function () { raf = 0; fit(); fireResize(); });
      }).observe(cv);
    }
    window.addEventListener('resize', function () { fit(); fireResize(); });
  }

  /* ---------- pop-out + expand ---------- */
  function popUrl() {
    var u = location.href.split('#')[0];
    if (!/[?&]big=1(&|$)/.test(u)) u += (u.indexOf('?') < 0 ? '?' : '&') + 'big=1';
    return u;
  }
  function decorateTitle() {
    var el = document.querySelector('.header .name');
    if (!el) return;
    var hint = document.createElement('span');
    hint.textContent = ' ⇱';
    hint.style.cssText = 'opacity:.55;font-weight:400;font-size:.8em;cursor:pointer;';
    hint.title = 'Open in a new tab';
    hint.addEventListener('click', function (e) { e.stopPropagation(); window.open(popUrl(), '_blank'); });
    el.appendChild(hint);
  }
  function addHandle(card) {
    if (embedded) return;
    var KEY = 'mpsize:' + location.pathname;
    var h = document.createElement('div');
    h.title = 'Drag to resize';
    h.style.cssText = 'position:absolute;right:2px;bottom:2px;width:16px;height:16px;cursor:nwse-resize;' +
      'background:linear-gradient(135deg,transparent 45%,#b9add6 45%,#b9add6 55%,transparent 55%,transparent 70%,#b9add6 70%,#b9add6 80%,transparent 80%);z-index:5;';
    card.style.position = 'relative';
    card.appendChild(h);
    function apply(w) {
      document.querySelector('.wrap').style.maxWidth = Math.round(w) + 'px';
    }
    try { var s = +localStorage.getItem(KEY); if (s > 700) apply(s); } catch (e) {}
    if (MP.big) apply(Math.min(1500, window.innerWidth - 40));
    var drag = null;
    h.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, w: document.querySelector('.wrap').getBoundingClientRect().width };
      h.setPointerCapture(e.pointerId); e.preventDefault();
    });
    h.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var w = Math.max(720, Math.min(window.innerWidth - 24, drag.w + (e.clientX - drag.x) * 2));
      apply(w);
      if (MP._fitCanvas) { MP._fitCanvas(); fireResize(); }
    });
    h.addEventListener('pointerup', function () {
      if (drag) { try { localStorage.setItem(KEY, String(document.querySelector('.wrap').getBoundingClientRect().width)); } catch (e) {} }
      drag = null;
    });
    h.addEventListener('dblclick', function () {
      document.querySelector('.wrap').style.maxWidth = '';
      try { localStorage.removeItem(KEY); } catch (e) {}
      if (MP._fitCanvas) { MP._fitCanvas(); fireResize(); }
    });
  }

  /* ---------- preview mode ---------- */
  function buildPreview() {
    if (!MP.preview || !sim) return;
    var bar = document.createElement('div');
    bar.style.cssText = 'background:#2e2450;color:#e6e1f5;padding:9px 14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;';
    var lab = document.createElement('span');
    lab.textContent = 'PREVIEW — jump to level:';
    lab.style.cssText = 'font-weight:700;letter-spacing:.05em;';
    bar.appendChild(lab);
    for (var i = 1; i <= sim.levels; i++) (function (n) {
      var b = document.createElement('button');
      b.textContent = n;
      b.style.cssText = 'width:26px;height:24px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;cursor:pointer;font-weight:600;';
      b.addEventListener('click', function () { sim.setLevel(n); refreshKey(); markLevel(); });
      b._n = n;
      bar.appendChild(b);
    })(i);
    var nx = document.createElement('button');
    nx.textContent = 'next ×10';
    nx.style.cssText = 'margin-left:6px;padding:0 10px;height:24px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;cursor:pointer;';
    nx.addEventListener('click', function () { for (var k = 0; k < 10; k++) sim.nextProblem(); refreshKey(); });
    bar.appendChild(nx);
    var card = document.querySelector('.card');
    if (card && card.parentNode) card.parentNode.insertBefore(bar, card);

    var key = document.createElement('div');
    key.id = 'mp-answer-key';
    key.style.cssText = 'background:#eef6ef;border:1px solid #b9dbc3;border-radius:9px;margin:10px 14px 0;padding:9px 12px;font:600 12.5px "JetBrains Mono",monospace;color:#1f7a45;';
    (document.querySelector('.ctlCol') || document.querySelector('.body') || document.body).appendChild(key);

    function markLevel() {
      [].forEach.call(bar.querySelectorAll('button'), function (b) {
        if (b._n) b.style.background = b._n === sim.currentLevel() ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.08)';
      });
    }
    function refreshKey() {
      var t = '—';
      try { t = sim.answerText(); } catch (e) {}
      key.textContent = 'answer key ▸ ' + t;
      markLevel();
    }
    MP._previewRefresh = refreshKey;
    refreshKey();
    // the page drives its own first problem and its "New problem" button; poll so
    // the key always reflects what's on screen without wiring every sim's newProblem
    setInterval(refreshKey, 400);
  }

  MP.register = function (iface) {
    sim = iface;   // { levels, setLevel(n), currentLevel(), answerText(), nextProblem() }
    try { buildPreview(); } catch (e) { if (window.console) console.warn('mp-tools preview:', e); }
  };
  MP.previewTick = function () { if (MP._previewRefresh) MP._previewRefresh(); };

  /* ---------- drag-to-orbit 3D ---------- */
  MP.makeOrbit = function (cv, redraw) {
    var st = { az: -0.6, el: 0.5, drag: null };
    cv.addEventListener('pointerdown', function (e) {
      st.drag = { x: e.clientX, y: e.clientY, az: st.az, el: st.el };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', function (e) {
      if (!st.drag) return;
      st.az = st.drag.az + (e.clientX - st.drag.x) * 0.01;
      st.el = Math.max(-1.45, Math.min(1.45, st.drag.el + (e.clientY - st.drag.y) * 0.01));
      redraw();
    });
    cv.addEventListener('pointerup', function () { st.drag = null; });
    cv.addEventListener('pointerleave', function () { st.drag = null; });
    st.project = function (x, y, z) {
      // right-handed: x right, y into screen, z up. az about z, el tilts.
      var ca = Math.cos(st.az), sa = Math.sin(st.az);
      var x1 = x * ca - y * sa;
      var y1 = x * sa + y * ca;
      var ce = Math.cos(st.el), se = Math.sin(st.el);
      var y2 = y1 * ce - z * se;
      var z2 = y1 * se + z * ce;
      return { sx: x1, sy: -z2, depth: y2 };
    };
    return st;
  };

  /* ---------- boot ---------- */
  function boot() {
    var card = document.querySelector('.card');
    var cv = document.querySelector('canvas[data-mp-canvas]') || document.querySelector('canvas');
    if (cv && cv.hasAttribute('data-mp-canvas')) wireCanvas(cv);
    if (card) { decorateTitle(); addHandle(card); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
