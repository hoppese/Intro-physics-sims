# Pre-class audit

Runs 24 h before each class (Sun / Tue / Thu). Compares what is published against
`data/schedule.json`, which is the source of truth. **Report only — it never
writes to Moodle.**

```
python3 tools/audit-schedule.py --moodle <pull.psv> [--days 7]
```

**Scope: the coming week, not the term.** By default only days from today to
today + `--days` are checked at all. Anything outside that window is *skipped,
not passed* — the header says so on every run, because a clean report must
never be read as "the whole term is fine".

Pass `--all` to audit the whole term. That also re-enables the three checks
that are meaningless on a one-week window: setting uniformity within a kind,
the term-wide video backlog totals, and "in Moodle but not on the schedule".
Worth doing occasionally — start of term, after a bulk edit — not every run.

Readiness deadlines are keyed to the deadline, not the class date, so work due
*now* for a class beyond the window still shows up (HW 4 closes Sep 30 but has
to be ready Sep 23, and it is reported on Sep 22).

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
      visible:val('visible'), rt:dc?dc.t:null, groups:gc&&gc.length?gc:null,
      content:await window.__content(a.cmid,a.mod)};   // see "content readiness" below
  }
  return {done:Object.keys(window.__detail).length,total:window.__acts.length};
};
await window.__pull(25)     // repeat until done === total
```

**Scope the pull before running it.** A whole-term pull is ~96 activities and
two fetches each; a week is about ten. Filter `window.__acts` to the cmids the
window actually needs — take them from `data/schedule.json` for the days in
range — before calling `__pull`:

```js
const want=new Set([145919,145954,145953,145918,145952,145917,150302,150465,145979,145978]);
window.__acts=window.__acts.filter(a=>want.has(+a.cmid));
```

Verified 2026-09-22: an 11-row windowed pull produced findings identical to the
full 96-row pull, in one readout call instead of nine.

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

### `--partial`

Only needed with `--all`. On a windowed run the "in Moodle but not on the
schedule" check is already off, because everything outside the window is
legitimately missing from a scoped pull. Use `--partial` when you want `--all`
against a pull that does not cover every activity.

### Things that do not work

- **Posting the data to a local HTTP receiver.** Blocked — an HTTPS page cannot
  reach `http://127.0.0.1`. It hangs rather than erroring.
- **Fetching Moodle from a `localhost` page.** Cross-origin, no session cookie.
- **Asking for more than ~9 rows per call.** The tool truncates the return
  silently, mid-row.

## Without `--moodle`

The Moodle half is skipped and says so loudly. A clean report in that mode does
**not** mean Moodle is fine — it means Moodle was never looked at.
