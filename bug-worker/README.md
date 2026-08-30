# bug-worker

Cloudflare Worker behind `sims-api.sethhopper.com`. The "Submit bug" menu item in
each sim POSTs `/report` here; the Worker commits one Markdown file per report to
`<sim>/bugs/` in this repo via the GitHub Contents API.

## Report file format

`<sim>/bugs/2026-08-28T14-32-05Z_a1b2c3.md`

```markdown
---
sim: "pendulum"
submitted: "2026-08-28T14:32:05.123Z"
status: "open"
email: ""
page_url: "https://sims.sethhopper.com/pendulum/?L=2&g=9.8&th0=25"
user_agent: "Mozilla/5.0 ..."
sim_state: { "given": {...}, "computed": {...} }
---

The period readout doesn't change when I drag the bob to a bigger angle.
```

To triage: read the `<sim>/bugs/*.md` files, act on them, then set `status: "fixed"`
(or delete the file) and commit.

## Deploy

Prerequisites: `sethhopper.com` active on Cloudflare, `npx wrangler login` done.

```sh
cd bug-worker

# 1. GitHub token — fine-grained PAT, repo = Intro-physics-sims, Contents: read/write
npx wrangler secret put GITHUB_TOKEN

# 2. (optional) rate-limit KV
npx wrangler kv namespace create RL
#   → paste id into wrangler.toml, uncomment the [[kv_namespaces]] block

# 3. ship it
npx wrangler deploy
```

`wrangler deploy` creates the `sims-api.sethhopper.com` custom domain automatically
once the zone is on Cloudflare.

## Local smoke test

```sh
npx wrangler dev
curl -sX POST http://localhost:8787/report \
  -H 'content-type: application/json' \
  -d '{"sim":"pendulum","text":"test report from curl","pageUrl":"http://x","userAgent":"curl"}'
```

(Local dev still needs `GITHUB_TOKEN` — `npx wrangler secret put GITHUB_TOKEN` or a
`.dev.vars` file with `GITHUB_TOKEN=...`, which is gitignored.)
