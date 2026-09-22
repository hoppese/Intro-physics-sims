# Pre-class audit

Runs 24 h before each class (Sun / Tue / Thu). Compares what is published against
`data/schedule.json`, which is the source of truth. **Report only — it never
writes to Moodle.**

```
python3 tools/audit-schedule.py --moodle <pull.psv> [--days 7]
```

Exit 0 = nothing wrong, 1 = at least one ERROR or DRIFT. Findings are grouped
into "needs action in the next N days" and "later", each in date order.

| severity | meaning |
|---|---|
| `ERROR` | something is broken — a scheduled activity is missing from Moodle, or a check could not run |
| `DRIFT` | Moodle and the schedule disagree on points / attempts / opens / closes / track |
| `NOTE`  | worth an eyeball — hidden activity, an activity Moodle has that the schedule doesn't, non-uniform settings within a kind |

## Getting the Moodle pull

The comparison is scripted; the pull is not, because it needs a logged-in
session. Do it in the browser with Claude in Chrome, on any page of
`moodle.earlham.edu` (the fetches are same-origin):

```js
window.__acts=[];
for(const [mod,url] of [['quiz','/mod/quiz/index.php?id=4157'],
                        ['assign','/mod/assign/index.php?id=4157']]){
  const h=await fetch(url,{credentials:'same-origin'}).then(r=>r.text());
  const d=new DOMParser().parseFromString(h,'text/html');
  [...d.querySelectorAll('a')].forEach(a=>{
    const href=a.getAttribute('href')||'';           // quiz links are RELATIVE
    const m=href.match(/(?:^|\/)view\.php\?id=(\d+)/);
    if(!m) return;
    if(href.includes('/mod/') && !href.includes('/mod/'+mod+'/')) return;
    const name=a.textContent.trim();
    if(name && !window.__acts.some(x=>x.cmid===m[1])) window.__acts.push({mod,cmid:m[1],name});
  });
}
window.__detail={};
window.__pull=async(n)=>{
  for(const a of window.__acts.filter(a=>!window.__detail[a.cmid]).slice(0,n)){
    const h=await fetch('/course/modedit.php?update='+a.cmid,{credentials:'same-origin'}).then(r=>r.text());
    const d=new DOMParser().parseFromString(h,'text/html');
    const val=nm=>{const e=d.querySelector('[name="'+nm+'"]'); if(!e) return null;
      if(e.tagName==='SELECT'){const o=e.querySelector('option[selected]')||e.options[e.selectedIndex]; return o?o.value:null;}
      if(e.type==='checkbox') return e.checked||e.getAttribute('checked')!==null;
      return e.value;};
    const g=(nm,f)=>{const e=d.querySelector('[name="'+nm+'['+f+']"]'); if(!e) return null;
      if(e.tagName==='SELECT'){const o=e.querySelector('option[selected]')||e.options[e.selectedIndex]; return o?o.value:null;} return e.value;};
    // WALL CLOCK, never epoch — Moodle's date fields are site-local. Converting
    // them as UTC shifts every due date by the offset (it produced
    // "KO 11 closes 06:15" once; the real value is 10:15).
    const wall=nm=>{const en=d.querySelector('[name="'+nm+'[enabled]"]');
      if(!(en&&(en.checked||en.getAttribute('checked')!==null))) return null;
      const p=x=>String(x).padStart(2,'0');
      return `${g(nm,'year')}-${p(g(nm,'month'))}-${p(g(nm,'day'))} ${p(g(nm,'hour'))}:${p(g(nm,'minute'))}`;};
    let av=null; try{const r=val('availabilityconditionsjson'); av=r?JSON.parse(r):null;}catch(e){}
    const dc=av&&(av.c||[]).find(c=>c.type==='date');          // Restrict access date
    const gc=av&&(av.c||[]).filter(c=>c.type==='group').map(c=>c.id);
    window.__detail[a.cmid]={name:a.name,mod:a.mod,cmid:+a.cmid,
      points:val('grade[modgrade_point]')||val('grade'),
      attempts:a.mod==='quiz'?val('attempts'):null,
      close:a.mod==='quiz'?wall('timeclose'):wall('duedate'),
      quizOpen:a.mod==='quiz'?wall('timeopen'):wall('allowsubmissionsfromdate'),
      visible:val('visible'), rt:dc?dc.t:null, groups:gc&&gc.length?gc:null};
  }
  return {done:Object.keys(window.__detail).length,total:window.__acts.length};
};
await window.__pull(25)     // repeat until done === total (about 4 calls)
```

Then turn it into the pipe-separated rows the script expects:

```js
const tz=t=>t?new Date(t*1000).toLocaleString('sv-SE',
  {timeZone:'America/Indiana/Indianapolis'}).slice(0,16):null;
window.__tsv=Object.values(window.__detail).map(x=>
  [x.name,x.mod,x.cmid,x.points??'',x.attempts??'',tz(x.rt)??'',x.quizOpen??'',
   x.close??'',x.visible??'',(x.groups||[]).join('+'),x.content??''].join('|')).sort();
window.__chunk=(i,n)=>window.__tsv.slice(i,i+n).join('\n');
window.__chunk(0,9)         // read out ~9 rows at a time; the tool truncates ~1.5 kB
```

Paste the rows into a `.psv` file and pass it with `--moodle`.

### The 11th field: content readiness

The readiness check needs to know whether each activity actually has questions
or problems in it, which is the difference between "the deadline arrived" and
"you missed the deadline". Collect it alongside the rest:

```js
window.__content=async(id,mod)=>{
  const d=new DOMParser().parseFromString(
    await fetch(`/mod/${mod}/view.php?id=${id}`,{credentials:'same-origin'}).then(r=>r.text()),'text/html');
  const t=(d.body.textContent||'').replace(/\s+/g,' ');
  if(mod==='quiz') return /No questions have been added yet/i.test(t)?'empty':'ready';
  const files=[...d.querySelectorAll('a[href*="pluginfile"]')].length;
  const blocks=[...d.querySelectorAll('.box, .activity-description, [id*="intro"], .no-overflow')]
     .map(e=>e.textContent.replace(/\s+/g,' ').trim())
     .filter(t=>t.length>20 && !/^Grading summary/.test(t));
  return (files>0||blocks.length>0)?'ready':'empty';
};
```

An assignment counts as ready if it has either a description with real text or
an attached file. Checking only the description misses the ones where the
problems are in an attached PDF — HW 3B is set up that way.

### Auditing just the next class

For a quick "is Friday ready?" pass you do not need all 95 activities. Pull only
the cmids you care about and add `--partial`, which suppresses the "in the
schedule but not in Moodle" check — without it every activity you left out of
the pull is reported as deleted.

```
python3 tools/audit-schedule.py --moodle next-class.psv --partial --days 9
```

### Things that do not work

- **Posting the data to a local HTTP receiver.** Blocked — an HTTPS page cannot
  reach `http://127.0.0.1`. It hangs rather than erroring.
- **Fetching Moodle from a `localhost` page.** Cross-origin, no session cookie.
- **Asking for more than ~9 rows per call.** The tool truncates the return
  silently, mid-row.

## Without `--moodle`

The Moodle half is skipped and says so loudly. A clean report in that mode does
**not** mean Moodle is fine — it means Moodle was never looked at.
