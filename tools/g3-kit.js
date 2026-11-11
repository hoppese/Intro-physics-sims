/* G3-KIT-BEGIN v1 — shared 3D drawing kit. The SAME block is inlined in every 3D sim
   (source of truth: tools/g3-kit.js; see docs/CONVENTIONS.md "3D scenes"). Do not edit one copy by hand.
   Everything takes a projector P(world{x,y,z}) -> {x,y,d,s}: screen px, depth (larger = nearer the viewer),
   and s = px per world unit at that point. */
const G3=(()=>{
  const BG=[13,21,31], TAU=6.2832, cache=new Map();
  const clamp=(v,a,b)=>v<a?a:v>b?b:v;
  const parse=(c)=>{ let p=cache.get(c); if(p) return p;
    if(c[0]==='#'){ let h=c.slice(1); if(h.length===3) h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2]; const n=parseInt(h.slice(0,6),16); p=[(n>>16)&255,(n>>8)&255,n&255,1]; }
    else { const m=(c.match(/-?[\d.]+/g)||[255,255,255]).map(Number); p=[m[0],m[1],m[2],m[3]==null?1:m[3]]; }
    cache.set(c,p); return p; };
  const str=(r,g,b,a)=>'rgba('+Math.round(r)+','+Math.round(g)+','+Math.round(b)+','+(+a.toFixed(3))+')';
  const mixTo=(c,t,k,a)=>{ const p=parse(c); return str(p[0]+(t[0]-p[0])*k,p[1]+(t[1]-p[1])*k,p[2]+(t[2]-p[2])*k,p[3]*(a==null?1:a)); };
  const lite=(c,k,a)=>mixTo(c,[255,255,255],k,a), dark=(c,k,a)=>mixTo(c,[4,8,13],k,a), dim=(c,k,a)=>mixTo(c,BG,k,a), alpha=(c,a)=>mixTo(c,BG,0,a);
  // depth cue: 0 (far side of the scene) .. 1 (near side), for a scene of half-size R world units
  const near=(d,R)=>clamp(0.5+0.5*d/(R||1),0,1);

  // text with a dark halo so it survives crossing lines / surfaces
  function label(ctx,t,x,y,o){ o=o||{}; ctx.save(); ctx.font=o.font||'11px JetBrains Mono, monospace'; ctx.textAlign=o.align||'center'; ctx.textBaseline=o.base||'middle';
    ctx.lineJoin='round'; ctx.lineWidth=o.halo||3; ctx.strokeStyle='rgba(11,18,27,0.88)'; ctx.strokeText(t,x,y); ctx.fillStyle=o.col||'#dbe4ee'; ctx.fillText(t,x,y); ctx.restore(); }

  // lit ball: key light from the upper left, dark rim, soft contact shadow
  function sphere(ctx,x,y,r,col,o){ o=o||{}; ctx.save(); if(o.alpha!=null) ctx.globalAlpha*=o.alpha;
    if(o.shadow!==false){ ctx.shadowColor='rgba(0,0,0,0.5)'; ctx.shadowBlur=r*0.9; ctx.shadowOffsetY=r*0.22; }
    if(o.glow){ ctx.shadowColor=alpha(col,0.9); ctx.shadowBlur=o.glow; ctx.shadowOffsetY=0; }
    const g=ctx.createRadialGradient(x-r*0.36,y-r*0.42,r*0.05,x,y,r);
    g.addColorStop(0,lite(col,0.66)); g.addColorStop(0.45,col); g.addColorStop(1,dark(col,0.58));
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill();
    ctx.shadowColor='transparent'; ctx.shadowBlur=0; ctx.shadowOffsetY=0;
    ctx.lineWidth=Math.max(0.8,r*0.09); ctx.strokeStyle=dark(col,0.66,0.9); ctx.stroke();
    if(r>=3.5){ ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(x-r*0.34,y-r*0.44,r*0.25,r*0.14,-0.6,0,TAU); ctx.fill(); }
    ctx.restore(); }

  // lit cylinder along a screen polyline: dark edge, body, soft mid-tone, offset highlight
  function tube(ctx,pts,w,col,o){ o=o||{}; if(!pts||pts.length<2) return;
    const path=(dx,dy)=>{ ctx.beginPath(); for(let i=0;i<pts.length;i++){ const p=pts[i]; if(!i||p.brk) ctx.moveTo(p.x+dx,p.y+dy); else ctx.lineTo(p.x+dx,p.y+dy); } if(o.closed) ctx.closePath(); };
    ctx.save(); if(o.alpha!=null) ctx.globalAlpha*=o.alpha; ctx.lineCap=o.cap||'round'; ctx.lineJoin='round'; if(o.dash) ctx.setLineDash(o.dash);
    if(o.glow){ ctx.shadowColor=alpha(col,0.85); ctx.shadowBlur=o.glow; }
    if(o.plain){ ctx.strokeStyle=col; ctx.lineWidth=w; path(0,0); ctx.stroke(); ctx.restore(); return; }
    ctx.strokeStyle=dark(col,0.62); ctx.lineWidth=w+(w>3?1.5:1); path(0,0); ctx.stroke();
    ctx.shadowColor='transparent'; ctx.shadowBlur=0;
    ctx.strokeStyle=col; ctx.lineWidth=w; path(0,0); ctx.stroke();
    if(w>=2.4 && !o.flat){
      ctx.strokeStyle=lite(col,0.22,0.9); ctx.lineWidth=w*0.56; path(-w*0.07,-w*0.11); ctx.stroke();
      ctx.strokeStyle=lite(col,0.7,0.8); ctx.lineWidth=Math.max(0.7,w*0.2); path(-w*0.13,-w*0.21); ctx.stroke(); }
    ctx.restore(); }

  // depth-cued tube: pts need .d. Segments are binned far -> near, the far side dimmer and thinner, so a
  // ring/coil seen edge-on overlaps itself correctly.
  function tubeD(ctx,pts,w,col,o){ o=o||{}; const n=pts.length; if(n<2) return; const R=o.R||10, B=o.bands||5, fade=o.fade==null?0.55:o.fade, thin=o.thin==null?0.28:o.thin;
    const bins=[]; for(let b=0;b<B;b++) bins.push([]);
    const m=o.closed?n:n-1;
    for(let i=0;i<m;i++){ const p=pts[i], q=pts[(i+1)%n]; if(q.brk) continue; const k=near((p.d+q.d)/2,R); const b=Math.min(B-1,Math.floor(k*B)); const L=bins[b]; const last=L[L.length-1];
      if(last && last._i===i){ const c={x:q.x,y:q.y}; c._i=i+1; L.push(c); } else { L.push({x:p.x,y:p.y,brk:true}); const c={x:q.x,y:q.y}; c._i=i+1; L.push(c); } }
    for(let b=0;b<B;b++){ if(!bins[b].length) continue; const k=(b+0.5)/B; tube(ctx,bins[b],w*(1-thin*(1-k)),dim(col,fade*(1-k)),{cap:o.cap,flat:o.flat,plain:o.plain,dash:o.dash,alpha:o.alpha,glow:o.glow&&k>0.5?o.glow:0}); } }

  // straight line between two projected points, graded dim (far end) -> full colour (near end)
  function seg(ctx,a,b,w,col,o){ o=o||{}; const R=o.R||10, fade=o.fade==null?0.6:o.fade; const ka=near(a.d,R), kb=near(b.d,R);
    ctx.save(); if(o.alpha!=null) ctx.globalAlpha*=o.alpha; if(o.dash) ctx.setLineDash(o.dash); ctx.lineCap=o.cap||'butt';
    if(Math.hypot(b.x-a.x,b.y-a.y)<1){ ctx.strokeStyle=dim(col,fade*(1-(ka+kb)/2)); } else { const g=ctx.createLinearGradient(a.x,a.y,b.x,b.y); g.addColorStop(0,dim(col,fade*(1-ka))); g.addColorStop(1,dim(col,fade*(1-kb))); ctx.strokeStyle=g; }
    ctx.lineWidth=w; ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); ctx.restore(); }

  // translucent lit surface patch (disc, plate, Gaussian cap) from a closed screen polygon
  function surface(ctx,pts,col,o){ o=o||{}; if(!pts||pts.length<3) return; const a=o.alpha==null?0.2:o.alpha;
    let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const p of pts){ if(p.x<x0)x0=p.x; if(p.x>x1)x1=p.x; if(p.y<y0)y0=p.y; if(p.y>y1)y1=p.y; }
    const g=ctx.createLinearGradient(x0,y0,x1,y1); g.addColorStop(0,lite(col,0.3,a*1.35)); g.addColorStop(0.55,alpha(col,a)); g.addColorStop(1,dark(col,0.3,a*0.8));
    ctx.save(); ctx.beginPath(); pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)); ctx.closePath(); ctx.fillStyle=g; ctx.fill();
    if(o.rim!==0){ ctx.lineJoin='round'; ctx.strokeStyle=o.rimCol||alpha(col,0.9); ctx.lineWidth=o.rim||1.6; if(o.dash) ctx.setLineDash(o.dash); ctx.stroke(); }
    ctx.restore(); }

  // arrow with a cone head that foreshortens. a,b: screen points. o.fore: 0..1 (1 = lies in the screen
  // plane), o.toward: +1 pointing at the viewer, -1 away (then you see the cone's dark base).
  function arrow(ctx,a,b,col,o){ o=o||{}; const lw=o.lw||3, fore=o.fore==null?1:clamp(o.fore,0,1);
    let ax=a.x, ay=a.y, bx=b.x, by=b.y; let L=Math.hypot(bx-ax,by-ay); const ux=L>1e-3?(bx-ax)/L:1, uy=L>1e-3?(by-ay)/L:0;
    const sg=o.startGap||0, tg=o.tipGap||0; if((sg||tg) && L>sg+tg+4){ ax+=ux*sg; ay+=uy*sg; bx-=ux*tg; by-=uy*tg; L-=sg+tg; }
    const hl=o.head||Math.max(7,lw*3.1), hr=hl*0.43, hs=Math.min(hl*fore,L), cx=bx-ux*hs, cy=by-uy*hs;
    const minor=hr*Math.sqrt(Math.max(0,1-fore*fore)), toward=(o.toward||0)>=0, nx=-uy, ny=ux, ang=Math.atan2(uy,ux);
    ctx.save(); if(o.alpha!=null) ctx.globalAlpha*=o.alpha; ctx.lineCap='butt'; ctx.lineJoin='round';
    if(o.glow){ ctx.shadowColor=alpha(col,0.9); ctx.shadowBlur=o.glow; }
    const shaft=()=>{ if(L-hs<0.6) return; if(o.dash) ctx.setLineDash(o.dash); else if(o.outline!==false && lw>=1.8){ ctx.strokeStyle=dark(col,0.72,0.75); ctx.lineWidth=lw+1.6; ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(cx,cy); ctx.stroke(); }
      ctx.strokeStyle=col; ctx.lineWidth=lw; ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(cx+ux*0.6,cy+uy*0.6); ctx.stroke(); ctx.setLineDash([]); };
    const tri=(f)=>{ ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(cx+nx*hr*f,cy+ny*hr*f); ctx.lineTo(cx-nx*hr*f,cy-ny*hr*f); ctx.closePath(); };
    const ell=()=>{ ctx.beginPath(); ctx.ellipse(cx,cy,Math.max(minor,0.01),hr,ang,0,TAU); };
    const lit=()=>{ const s=(nx*-0.5+ny*-0.85)>=0?1:-1; ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(cx,cy); ctx.lineTo(cx+s*nx*hr,cy+s*ny*hr); ctx.closePath(); ctx.fillStyle=lite(col,0.3); ctx.fill(); };
    if(minor<0.7){ shaft(); tri(1); ctx.fillStyle=col; ctx.fill(); if(hl>=8) lit(); }
    else if(toward){ shaft(); ell(); ctx.fillStyle=dark(col,0.16); ctx.fill(); tri(1); ctx.fillStyle=col; ctx.fill(); if(fore>0.35 && hl>=8) lit();
      ctx.shadowColor='transparent'; ctx.fillStyle=lite(col,0.6); ctx.beginPath(); ctx.arc(bx,by,Math.max(0.9,hr*0.2),0,TAU); ctx.fill(); }
    else { tri(1); ctx.fillStyle=col; ctx.fill(); ell(); ctx.shadowColor='transparent'; ctx.fillStyle=dark(col,0.5); ctx.fill(); ctx.strokeStyle=col; ctx.lineWidth=1; ctx.stroke(); shaft(); }
    ctx.restore(); return {a:{x:ax,y:ay}, b:{x:bx,y:by}}; }

  // arrow between two world points; foreshortening and toward/away worked out from the projector
  function arrow3(ctx,P,w0,w1,col,o){ o=Object.assign({},o||{}); const a=P(w0), b=P(w1);
    const Lw=Math.hypot(w1.x-w0.x,w1.y-w0.y,w1.z-w0.z), Ls=Math.hypot(b.x-a.x,b.y-a.y);
    o.fore=Lw>1e-9?clamp(Ls/(Lw*(a.s+b.s)/2),0,1):1; o.toward=b.d>=a.d?1:-1; return arrow(ctx,a,b,col,o); }

  // faint reference grid on the horizontal plane through `at` (o.up: 'y' or 'z'), fading out with distance
  function grid(ctx,P,o){ o=o||{}; const ext=o.ext||10, step=o.step||2, up=o.up||'y', col=o.col||'#8fb4d8', a0=o.alpha==null?0.2:o.alpha, h=o.at||0;
    const Wd=(u,v)=>up==='y'?{x:u,y:h,z:v}:{x:u,y:v,z:h}; const n=Math.round(ext/step);
    ctx.save(); ctx.lineWidth=1; ctx.lineCap='butt';
    for(let i=-n;i<=n;i++){ if(i===0 && !o.center) continue; const t=i*step, k=1-Math.abs(i)/(n+0.5);
      for(let dir=0;dir<2;dir++){ const A=P(dir?Wd(t,-ext):Wd(-ext,t)), B=P(dir?Wd(t,ext):Wd(ext,t)); const am=a0*(0.2+0.8*k);
        const g=ctx.createLinearGradient(A.x,A.y,B.x,B.y); g.addColorStop(0,alpha(col,0)); g.addColorStop(0.5,alpha(col,am)); g.addColorStop(1,alpha(col,0));
        ctx.strokeStyle=g; ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke(); } }
    ctx.restore(); }

  // x/y/z axes through the origin: fade from the negative end to a bright positive end with a cone tip,
  // tick marks + haloed tick numbers that are dropped when they would collide or bunch up.
  function axes(ctx,P,o){ o=o||{}; const ext=o.ext||10, major=o.major||2, placed=(o.avoid||[]).slice(), O=P({x:0,y:0,z:0});
    const list=o.list||[{u:{x:0,y:0,z:1},col:'#9bc2e6',label:'z'},{u:{x:0,y:1,z:0},col:'#9be3b0',label:'y'},{u:{x:1,y:0,z:0},col:'#f0b59c',label:'x'}];
    const at=(u,t)=>({x:u.x*t,y:u.y*t,z:u.z*t}); const font=o.font||'10px JetBrains Mono, monospace';
    const hit=(x,y,w,h)=>{ for(const b of placed){ if(Math.abs(x-b.x)<(w+b.w)/2+3 && Math.abs(y-b.y)<(h+b.h)/2+2) return true; } return false; };
    // o.box {w,h,m}: pull each axis end back inside the canvas so its cone tip and letter stay visible
    const lim=(u,sg)=>{ let t=ext; if(!o.box) return t; const m=o.box.m==null?24:o.box.m; for(let k=0;k<48;k++){ const p=P(at(u,sg*t*1.04)); if(p.x>=m && p.x<=o.box.w-m && p.y>=m && p.y<=o.box.h-m) break; t*=0.95; } return t; };
    ctx.save();
    for(const ax of list){ const eP=lim(ax.u,1), eN=lim(ax.u,-1); ax._eP=eP; ax._eN=eN; const N=P(at(ax.u,-eN)), E=P(at(ax.u,eP)); const sl=Math.hypot(E.x-N.x,E.y-N.y); ax._N=N; ax._E=E; ax._sl=sl;
      if(sl>2){ const g=ctx.createLinearGradient(N.x,N.y,E.x,E.y); g.addColorStop(0,alpha(ax.col,0.07)); g.addColorStop(0.5,alpha(ax.col,0.3)); g.addColorStop(1,alpha(ax.col,0.7));
        ctx.strokeStyle=g; ctx.lineWidth=1.25; ctx.beginPath(); ctx.moveTo(N.x,N.y); ctx.lineTo(E.x,E.y); ctx.stroke(); }
      arrow3(ctx,P,at(ax.u,eP*0.93),at(ax.u,eP*1.04),ax.col,{lw:1.25,head:9,alpha:0.85,outline:false}); }
    if(o.ticks!==false){ ctx.font=font; ctx.textAlign='center'; ctx.textBaseline='middle';
      for(const ax of list.slice().reverse()){ const N=ax._N, E=ax._E, sl=ax._sl; if(sl<24 || ax.ticks===false) continue;
        const ux=(E.x-N.x)/sl, uy=(E.y-N.y)/sl; let nx=-uy, ny=ux; if(ny<0){ nx=-nx; ny=-ny; } if(Math.abs(ny)<0.35 && nx>0){ nx=-nx; ny=-ny; }
        const eP=ax._eP, eN=ax._eN; const gap=sl*major/(eP+eN); const every=gap>=17?1:gap>=8.5?2:gap>=5.5?3:0;
        const nP=Math.floor(eP*0.9/major+1e-6), nN=Math.floor(eN/major+1e-6);
        if(gap>=14){ ctx.strokeStyle=alpha(ax.col,0.3); ctx.lineWidth=1; for(let j=-2*nN-1;j<=2*nP+1;j++){ if(j*major/2>eP*0.9 || j*major/2<-eN) continue; if(j%2===0) continue; const mp=P(at(ax.u,j*major/2)); ctx.beginPath(); ctx.moveTo(mp.x,mp.y); ctx.lineTo(mp.x+nx*2.5,mp.y+ny*2.5); ctx.stroke(); } }
        for(let i=-nN;i<=nP;i++){ if(i===0) continue; const t=i*major, tp=P(at(ax.u,t)); const kd=0.35+0.45*(i>0?1:0.45);
          ctx.strokeStyle=alpha(ax.col,kd); ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(tp.x,tp.y); ctx.lineTo(tp.x+nx*4,tp.y+ny*4); ctx.stroke();
          if(!every || i%every) continue; const txt=(o.fmt?o.fmt(t):String(+t.toFixed(6))); const w=ctx.measureText(txt).width, h=10; const off=7.5+w*0.5*Math.abs(nx)+5*Math.abs(ny), tx=tp.x+nx*off, ty=tp.y+ny*off;
          if(Math.hypot(tx-O.x,ty-O.y)<15 || hit(tx,ty,w,h)) continue; placed.push({x:tx,y:ty,w,h});
          ctx.lineJoin='round'; ctx.lineWidth=3; ctx.strokeStyle='rgba(11,18,27,0.88)'; ctx.strokeText(txt,tx,ty); ctx.fillStyle=alpha(ax.col,i>0?0.85:0.55); ctx.fillText(txt,tx,ty); } } }
    for(const ax of list){ const N=ax._N, E=ax._E, sl=ax._sl; let ux=0, uy=-1; if(sl>12){ ux=(E.x-N.x)/sl; uy=(E.y-N.y)/sl; }
      const T=P(at(ax.u,ax._eP*1.04)); label(ctx,ax.label,T.x+ux*12,T.y+uy*12,{font:o.labelFont||'italic 13px "Source Serif 4", serif',col:lite(ax.col,0.25)}); }
    ctx.restore(); }

  // scale factor that keeps a scene authored for a w0 x h0 canvas filling whatever canvas it gets
  const fit=(w,h,w0,h0)=>clamp(Math.min(w/w0,h/h0),0.55,3.2);

  return {clamp,lite,dark,dim,alpha,near,label,sphere,tube,tubeD,seg,surface,arrow,arrow3,grid,axes,fit};
})();
/* G3-KIT-END */
