/**
 * sethhopper-bug-worker — receives "Submit bug" reports from the physics sims
 * and forwards them to the central bug-intake service (app: Intro Physics Sims).
 *
 * Route:  POST https://sims-api.sethhopper.com/report
 * Env:
 *   INTAKE_KEY    (secret)  per-app key "<appId>.<secret>" from the bug-intake dashboard
 *   INTAKE_URL    (var)     https://bug-intake-hopper.web.app/v1/reports
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

    // Forward to the central bug-intake service; reports are no longer committed to this public repo.
    const report = {
      version: clip(env.APP_VERSION || "web", 40) || "web",
      screen: sim,
      description: text,
      userAgent: clip(body.userAgent, 300) || undefined,
      context: JSON.stringify({
        pageUrl: clip(body.pageUrl, 500),
        reporterEmail: clip(body.email, 200),
        simState: body.simState ?? null,
      }).slice(0, 2000),
    };
    let res;
    try {
      res = await fetch(env.INTAKE_URL, {
        method: "POST",
        headers: { "X-API-Key": env.INTAKE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(report),
      });
    } catch {
      return reply({ error: "intake_unreachable" }, 502, baseHeaders);
    }
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return reply({ error: "intake_failed", status: res.status, detail }, 502, baseHeaders);
    }
    const { id } = await res.json().catch(() => ({}));
    return reply({ ok: true, id }, 200, baseHeaders);
  },
};

function allowOrigin(origin, env) {
  const list = String(env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.includes("*")) return origin || "*";
  return list.includes(origin) ? origin : "";
}
function clip(v, n) { return String(v == null ? "" : v).slice(0, n); }
function reply(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
