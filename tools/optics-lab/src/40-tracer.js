// =====================================================================
// Tracer -- follows every ray from every source until it leaves the bench
// or is stopped, and writes down what happened.
//
//   Tracer.trace(scene) -> {
//     segs    every straight piece of light, for drawing
//     paths   the route of each ray's reference colour: its corners, its directions,
//             and what happened at each surface (for angle labels, logs and images)
//     spots   where light landed on screens
//     images  the points rays come to, or seem to come from (see Imager)
//     ghosts  paths like `paths`, of rays nobody sees: an object's foot sends a few so that
//             the image of the foot can be found (they are never drawn, logged or counted)
//     stats   how much was traced, and whether anything had to be cut short
//   }
//
// The physics lives in the elements (interact()); the tracer only finds which
// surface a ray meets next.
// =====================================================================
class Tracer {
  static EPS = 1e-6;           // cm: a ray does not meet the surface it has just left
  static FAR = 1500;           // cm: how far a ray that meets nothing is drawn
  static MAX_HITS = 80;        // surfaces one ray may meet (a ray trapped between mirrors stops here)
  static MAX_SEGS = 12000;     // pieces of light in one picture
  static I_MIN = 0.012;        // a partial reflection fainter than this is dropped

  static trace(scene) { const opts = { partial: !!scene.opts.partial }, surfs = [];
    for (const el of scene.els) for (const s of el.surfaces()) { s.el = el; surfs.push(s); }
    const out = { segs: [], paths: [], ghosts: [], spots: [], images: [], stats: { rays: 0, segs: 0, tir: 0, capped: false, trapped: 0 } };
    for (const src of scene.els) { if (!src.emits) continue;
      for (const r of src.emit()) { if (r.ghost) { Tracer.follow(src, r, src.refNm, surfs, {}, out); continue; }
        for (const nm of src.wavelengths) { out.stats.rays++; Tracer.follow(src, r, nm, surfs, opts, out); } } }
    out.stats.segs = out.segs.length; out.images = Imager.find(scene, out); return out; }

  // One colour of one ray, and any partial reflections that split off it.
  // A ghost leaves no light behind: only its path, in `ghosts`.
  static follow(src, r, nm, surfs, opts, out) { const ref = nm === src.refNm, white = src.white, ghost = !!r.ghost, segs = ghost ? [] : out.segs;
    const path = ref ? { src: src.id, idx: r.idx, nm, pts: [r.p], dirs: [r.d], hits: [], open: false } : null; if (path) (ghost ? out.ghosts : out.paths).push(path);
    const queue = [{ p: r.p, d: r.d, I: 1, main: true, n: 0 }];
    while (queue.length) { let ray = queue.pop();
      for (;;) { if (out.segs.length >= Tracer.MAX_SEGS) { out.stats.capped = true; return; }
        if (ghost && segs.length > Tracer.MAX_HITS + 2) return;
        ray.nm = nm; const hit = Tracer.nearest(ray, surfs), seg = { a: ray.p, b: null, nm, I: ray.I, white, src: src.id, idx: r.idx, k: ray.n, main: ray.main, ref, open: !hit };
        segs.push(seg);
        if (!hit) { seg.b = V.at(ray.p, ray.d, Tracer.FAR); if (ray.main && path) path.open = true; break; }
        seg.b = hit.q; const outs = hit.el.interact(ray, hit, opts);
        if (hit.how === 'screen' && !ghost) out.spots.push({ el: hit.el.id, q: hit.q, nm, white, I: ray.I });
        if (hit.how === 'tir' && ref && ray.main && !ghost) out.stats.tir++;
        if (ray.main && path) { path.pts.push(hit.q); path.hits.push({ el: hit.el, part: hit.part || 0, q: hit.q, N: hit.Nin || hit.N, how: hit.how, th1: hit.th1, th2: hit.th2, n1: hit.n1, n2: hit.n2, inside: !!hit.inside, din: ray.d, dout: outs.length ? outs[0].d : null }); }
        if (!outs.length) break;
        for (let i = 1; i < outs.length; i++) if (outs[i].I >= Tracer.I_MIN) queue.push({ p: hit.q, d: outs[i].d, I: outs[i].I, main: false, n: ray.n + 1 });
        const o = outs[0]; if (o.I < Tracer.I_MIN) { if (ray.main && path) path.hits[path.hits.length - 1].dout = null; break; }
        if (ray.n + 1 > Tracer.MAX_HITS) { if (!ghost) out.stats.trapped++; if (ray.main && path) path.hits[path.hits.length - 1].dout = null; break; }
        if (ray.main && path) path.dirs.push(o.d);
        ray = { p: hit.q, d: o.d, I: o.I, main: ray.main, n: ray.n + 1 }; } } }

  // The first surface along the ray: { el, q, N, t, part }, or null. N is the surface's own normal there
  // (outward for glass, the reflecting side for a mirror); the element decides what it means.
  static nearest(ray, surfs) { let best = null, bt = Infinity; const p = ray.p, d = ray.d, EPS = Tracer.EPS;
    for (const s of surfs) {
      if (s.kind === 'seg') { const ex = s.b.x - s.a.x, ey = s.b.y - s.a.y, den = d.x * ey - d.y * ex; if (Math.abs(den) < 1e-12) continue;
        const ax = s.a.x - p.x, ay = s.a.y - p.y, t = (ax * ey - ay * ex) / den; if (!(t > EPS) || t >= bt) continue;
        const u = (ax * d.y - ay * d.x) / den; if (u < -1e-9 || u > 1 + 1e-9) continue;
        bt = t; best = { s, N: s.n }; }
      else { const fx = p.x - s.c.x, fy = p.y - s.c.y, b = fx * d.x + fy * d.y, c = fx * fx + fy * fy - s.r * s.r, disc = b * b - c; if (disc < 0) continue;
        const root = Math.sqrt(disc);
        for (const t of [-b - root, -b + root]) { if (!(t > EPS) || t >= bt) continue;
          const qx = fx + d.x * t, qy = fy + d.y * t; let rel = (Math.atan2(qy, qx) * 180 / Math.PI - s.a0) % 360; if (rel < 0) rel += 360;
          if (rel > s.sweep + 1e-7 && rel < 360 - 1e-7) continue;
          bt = t; best = { s, N: { x: s.sign * qx / s.r, y: s.sign * qy / s.r } }; break; } } }
    return best ? { el: best.s.el, part: best.s.part || 0, q: V.at(p, d, bt), N: best.N, t: bt } : null; }
}

// =====================================================================
// Imager -- finds images the way a person does with a ruler: take the rays
// that left one source and went through the same elements, and see where
// neighbouring ones cross.
//
// After the k-th surface a bundle of rays either really crosses ahead of that
// surface (a real image), would cross if traced backwards (a virtual image), or
// does not come to a point at all (parallel light, or an aberrated bundle). An
// image that would form beyond the next element is kept, unshown, as that
// element's object, so that s and s' can be given for every lens and mirror.
// =====================================================================
class Imager {
  static STAGES = 8;
  static FAR = 5000;           // cm: rays that would cross farther off than this are called parallel
  // The bundles of rays that should come to images, each with the point they left: a point source's
  // rays, a beam's (from infinitely far off), and an object's two (from its tip, and the unseen ones from its foot).
  static bundles(src, res) { const mine = (list) => list.filter((p) => p.src === src.id).sort((a, b) => a.idx - b.idx);
    if (src instanceof Lamp) return [{ obj: { p: src.pos }, paths: mine(res.paths), role: 'point' }];
    if (src instanceof Beam) return [{ obj: { inf: true }, paths: mine(res.paths), role: 'point' }];
    if (src instanceof Figure) return [{ obj: { p: src.tip }, paths: mine(res.paths), role: 'tip' }, { obj: { p: src.pos }, paths: mine(res.ghosts || []), role: 'foot' }];
    return []; }
  static find(scene, res) { const out = [];
    for (const src of scene.els) for (const bundle of Imager.bundles(src, res)) { const paths = bundle.paths; if (paths.length < 2) continue;
      // the object each bundle starts from, by the route it has taken so far ('' = straight from the source)
      const objects = new Map([['', bundle.obj]]);
      const sig = (p, k) => p.hits.slice(0, k).map((h) => h.el.id + '.' + h.part + h.how).join('|');
      for (let k = 1; k <= Imager.STAGES; k++) { const groups = new Map();
        for (const p of paths) { if (p.hits.length < k || !p.dirs[k]) continue; const key = sig(p, k); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p); }
        if (!groups.size) break;
        for (const [key, grp] of groups) { if (grp.length < 2) continue;
          const found = Imager.cross(grp, k); if (!found) continue;
          objects.set(key, found.inf ? { inf: true } : { p: found.p });
          if (found.inf) continue;
          const hits = grp[0].hits, hit = hits[k - 1], el = hit.el;
          // the object is what the light was coming from before it met this element (for a real lens, before its first face)
          let j = k - 1; while (j > 0 && hits[j - 1].el === el) j--;
          const obj = objects.get(sig(grp[0], j)) || null;
          const img = { src: src.id, role: bundle.role, key, stage: k, el: el.id, p: found.p, kind: found.kind, focus: !!(obj && obj.inf), rays: grp.map((p) => ({ from: p.pts[k], d: p.dirs[k] })), inGlass: hit.inside && el.glassy, s: null, sp: null, m: null };
          if ((el instanceof Lens || el instanceof Mirror) && obj && !img.inGlass) { const n = el.dir, front = el instanceof Mirror, side = front ? 1 : V.dot(hits[j].din, n) < 0 ? -1 : 1;
            img.s = obj.inf ? Infinity : (front ? 1 : -side) * V.dot(V.sub(obj.p, el.pos), n); img.sp = side * V.dot(V.sub(found.p, el.pos), n);
            img.m = obj.inf || Math.abs(img.s) < 1e-9 ? null : -img.sp / img.s; }
          out.push(img); } } }
    // an object's image gets the image of its foot, found by the same route, so the whole of it can be drawn
    for (const im of out) { if (im.role !== 'tip') continue; const foot = out.find((f) => f.role === 'foot' && f.src === im.src && f.key === im.key);
      if (foot && foot.kind === im.kind) { im.foot = foot.p; im.tilt = Imager.parity(im.key); } }
    // what is shown: real and virtual images in air. (The rest were only needed as objects.)
    const shown = out.filter((i) => i.kind !== 'onward' && !i.inGlass && i.role !== 'foot'); shown.forEach((im, i) => { im.no = i + 1; }); return shown; }
  // +1 if the light has been reflected an even number of times along this route (the image is the object
  // turned), -1 if odd (it is the object's mirror image)
  static parity(key) { const n = (key.match(/reflect|tir/g) || []).length; return n % 2 ? -1 : 1; }

  // Where the bundle's rays cross after their k-th surface: { p, kind } with kind real / virtual / onward,
  // { inf: true } if they are parallel, or null if they do not agree on a point.
  static cross(grp, k) { const pts = [], ts = []; let parallel = 0;
    for (let i = 0; i + 1 < grp.length; i++) { const a = grp[i], b = grp[i + 1], P = a.pts[k], Q = b.pts[k], D = a.dirs[k], E = b.dirs[k], den = V.cross(D, E);
      if (Math.abs(den) < 1e-7) { parallel++; continue; }
      const w = V.sub(Q, P), t = V.cross(w, E) / den, u = V.cross(w, D) / den; pts.push(V.at(P, D, t)); ts.push([a, t], [b, u]); }
    if (!pts.length) return parallel ? { inf: true } : null;
    if (parallel) return null;
    const med = (xs) => { const s = xs.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
    const p = { x: med(pts.map((q) => q.x)), y: med(pts.map((q) => q.y)) }, reach = med(ts.map((x) => Math.abs(x[1]))), tol = Math.max(0.2, 0.025 * reach);
    if (reach > Imager.FAR) return { inf: true };           // as good as parallel
    if (pts.some((q) => V.dist(q, p) > tol)) return null;
    const ahead = ts.every((x) => x[1] > 0), behind = ts.every((x) => x[1] < 0); if (!ahead && !behind) return null;
    if (behind) return { p, kind: 'virtual' };
    // real only if every ray gets there before it meets something else
    const reaches = grp.every((g) => { const next = g.pts[k + 1]; return !next || V.dist(g.pts[k], p) <= V.dist(g.pts[k], next) + 0.05; });
    return { p, kind: reaches ? 'real' : 'onward' }; }
}
