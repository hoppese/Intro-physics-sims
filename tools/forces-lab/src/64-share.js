// =====================================================================
// ShareLink -- the bench as a URL and back.
//   ?lab=<packed scene>   a bench someone built        (Scene.encode / Scene.decode)
//   ?preset=<key>         one of the built-in benches  (see PRESETS)
//   &hide=1               open with the forces hidden, for a "predict first" question
//   &values=0             open with the arrows' numbers off (the arrows and their symbols stay)
// =====================================================================
const ShareLink = {
  url(scene, hide, values) { const p = new URLSearchParams(); p.set('lab', scene.encode()); if (hide) p.set('hide', 1); if (values === false) p.set('values', 0);
    const loc = typeof location !== 'undefined' ? location : { origin: '', pathname: '' }; return (loc.origin || '') + loc.pathname + '?' + p.toString(); },
  // what the address asks for; `search` defaults to the page's own
  read(search) { const none = { lab: null, preset: null, hide: false, values: true };
    try { const q = new URLSearchParams(search == null ? location.search : search), h = q.get('hide'); const vq = q.get('values'); return { lab: q.get('lab'), preset: q.get('preset'), hide: !!h && h !== '0' && h !== 'false', values: !(vq === '0' || vq === 'false') }; } catch (e) { return none; } },
  // the scene the address describes, or null if it describes none (or nonsense)
  scene(link) { if (!link) return null; if (link.lab) { const s = Scene.decode(link.lab); if (s && !s.isEmpty) return s; }
    const p = link.preset && PRESET(link.preset); return p ? Scene.from({ els: p.els, opts: p.opts }) : null; },
};
