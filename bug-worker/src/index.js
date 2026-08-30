/**
 * sethhopper-bug-worker — receives "Submit bug" reports from the physics sims
 * and commits one Markdown file per report to <sim>/bugs/ in the GitHub repo.
 *
 * Route:  POST https://sims-api.sethhopper.com/report
 * Env:
 *   GITHUB_TOKEN  (secret)  fine-grained PAT, repo-scoped, Contents: read/write
 *   REPO          (var)     "hoppese/Intro-physics-sims"
 *   BRANCH        (var)     "main"
 *   ALLOWED_ORIGINS (var)   comma-separated; "*" allows any. e.g. "https://sims.sethhopper.com,https://moodle.example.edu"
 *   RL            (KV)      optional rate-limit namespace
 */

const SIMS = new Set([
  "ampere-loop", "center-of-mass", "circuit-builder", "circuit-lab", "current-loop-motor",
  "diffraction-pattern", "dipole-field-and-torque", "discrete-charge-builder-3d",
  "discrete-current-builder-3d", "drop-and-toss", "e-fields-conductors-and-insulators",
  "electroscope", "electrostatics-explorer", "energy-in-shm", "equipotential-explorer",
  "faraday-flux-explorer", "faraday-induction", "field-line-density-3d",
  "field-superposition-explorer", "gauss-flux", "interference-explorer", "keplers-laws",
  "kinetic-theory-speeds", "lens-ray-tracer", "lorentz-force", "magnetic-field-of-currents",
  "mirror-ray-tracer", "motion-diagram", "moving-charge-field", "oscillation-explorer",
  "pe-vs-separation", "pendulum", "polarization-malus", "radiation-wiggling-charge",
  "rail-flux-bar", "ray-optics", "rc-charging", "relative-velocity", "standing-waves",
  "thin-film-interference", "two-source-interference", "universal-gravitation", "wave-explorer",
]);

const MAX_TEXT = 4000;
const RL_LIMIT = 12;       // reports per IP
const RL_WINDOW = 3600;    // seconds

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = allowOrigin(origin, env);
    const baseHeaders = {
      "Access-Control-Allow-Origin": allowed || "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: baseHeaders });
    if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405, baseHeaders);

    const url = new URL(request.url);
    if (url.pathname !== "/report") return reply({ error: "not_found" }, 404, baseHeaders);
    if (origin && !allowed) return reply({ error: "origin_not_allowed" }, 403, baseHeaders);

    let body;
    try { body = await request.json(); } catch { return reply({ error: "bad_json" }, 400, baseHeaders); }

    // honeypot — bots fill hidden fields; pretend all is well
    if (body.website) return reply({ ok: true }, 200, baseHeaders);

    const sim = String(body.sim || "").trim();
    if (!SIMS.has(sim)) return reply({ error: "unknown_sim" }, 400, baseHeaders);

    const text = String(body.text || "").trim();
    if (text.length < 3) return reply({ error: "empty_report" }, 400, baseHeaders);
    if (text.length > MAX_TEXT) return reply({ error: "too_long" }, 413, baseHeaders);

    // rate-limit by IP (best-effort; only if KV bound)
    const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
    if (env.RL) {
      const key = `rl:${ip}`;
      const count = parseInt((await env.RL.get(key)) || "0", 10);
      if (count >= RL_LIMIT) return reply({ error: "rate_limited" }, 429, baseHeaders);
      await env.RL.put(key, String(count + 1), { expirationTtl: RL_WINDOW });
    }

    const now = new Date();
    const stamp = now.toISOString().replace(/[:]/g, "-").replace(/\.\d+Z$/, "Z");
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `${sim}/bugs/${stamp}_${rand}.md`;

    const front = {
      sim,
      submitted: now.toISOString(),
      status: "open",
      email: clip(body.email, 200),
      page_url: clip(body.pageUrl, 500),
      user_agent: clip(body.userAgent, 400),
      sim_state: body.simState ?? null,
    };
    const md =
      "---\n" +
      Object.entries(front).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n") +
      "\n---\n\n" + text + "\n";

    const commitMsg = `bug(${sim}): ${text.replace(/\s+/g, " ").slice(0, 60)}`;
    const api = `https://api.github.com/repos/${env.REPO}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
    const gh = await fetch(api, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "User-Agent": "sethhopper-bug-worker",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ message: commitMsg, content: b64(md), branch: env.BRANCH || "main" }),
    });

    if (!gh.ok) {
      const detail = (await gh.text()).slice(0, 300);
      return reply({ error: "commit_failed", status: gh.status, detail }, 502, baseHeaders);
    }
    return reply({ ok: true, path }, 200, baseHeaders);
  },
};

function allowOrigin(origin, env) {
  const list = String(env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.includes("*")) return origin || "*";
  return list.includes(origin) ? origin : "";
}
function clip(v, n) { return String(v == null ? "" : v).slice(0, n); }
function b64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
}
function reply(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
