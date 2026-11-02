// POST /api/generate {app: "Zoom" | "https://..."} -> guide JSON
const SYSTEM = `You research how a developer gets an OAuth app set up and approved for a given provider.
Prefer OFFICIAL developer docs. Return ONLY one JSON object, no prose, matching:
{"app":str,"website":str,"summary":str(2 sentences),"difficulty":"easy"|"review"|"gated",
"dev_ready":str,"prod_ready":str,"effort":str,
"dev_ready_basis":[claim ids],"prod_ready_basis":[claim ids],
"before_you_start":[{"t":str,"c":[claim ids]}],"setup_steps":[{"t":str,"c":[claim ids]}],
"review":{"required":bool,"what":str,"c":[claim ids],"rejection_risks":[{"t":str,"c":[claim ids]}]},
"who_does_what":{"agent":[str],"you":[str],"provider":[str]},
"blockers":[{"problem":str,"fix":str,"c":[claim ids]}],
"endpoints":{"authorize":str|null,"token":str|null},
"claims":[{"id":"c1","text":str,"label":"documented"|"inferred"|"unverified","source_url":str|null,"quote":str|null,"source_note":str}]}
Rules:
- difficulty: easy=self-serve, no review; review=self-serve but review/verification needed for real users; gated=partner approval, audit, paid tier or business verification.
- dev_ready and prod_ready must each be a time RANGE (for example "about 1 hour", "1-3 weeks") or "unknown". Give them separately. If no source states the time, add a claim for it labeled "inferred".
- before_you_start must name the app/integration types the provider offers and which one fits an agent connecting users' accounts, plus account or business requirements, if the sources say so.
- who_does_what.agent = setup TASKS an AI agent can do FOR the developer (drafting scope lists, redirect URIs, review submission text, test scripts). Do NOT list what the running integration does at runtime. "you" = what needs the developer's login, payment, identity or legal sign-off.
- Every factual claim (timelines, caps, scopes, fees, review rules) must appear in "claims". For each "documented" claim, "quote" must be a short passage (max 200 characters) copied EXACTLY, word for word, from the source text you were given for that source_url. If you cannot quote it exactly, label it "inferred" or "unverified" with quote null.
- Every item in before_you_start, setup_steps, rejection_risks, blockers, review.what and both readiness values must list in "c" (or *_basis) the ids of the claims that support it. Use an empty list if no claim supports it; do not invent support.
- Never guess. Never claim you tested anything. 8-14 claims.`;

const blocked = (h) => /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[|0\.)/.test(h) || !h.includes('.');

const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
function appKey(app) {
  try { if (app.includes('.')) { const h = new URL(/^https?:/.test(app) ? app : 'https://' + app).hostname.replace(/^www\./, '').split('.'); return norm(h.length > 1 ? h[h.length - 2] : h[0]); } } catch (e) {}
  return norm(app.split(/[ (]/)[0]);
}
function sourceType(url, key) {
  let h = '';
  try { h = new URL(url).hostname.toLowerCase(); } catch (e) { return 'unknown'; }
  if (/(youtube|youtu\.be|vimeo)/.test(h)) return 'video';
  if (/(devforum|forum|community|stackoverflow|stackexchange|reddit|quora|medium\.com|dev\.to|discuss)/.test(h)) return 'community';
  return key && norm(h).includes(key) ? 'official' : 'third-party';
}

// Verified by hand on 2026-10-31 from Composio's toolkit pages (badge: "Composio-managed OAuth available").
const COMPOSIO = { github: 'GitHub', gmail: 'Gmail', googledrive: 'Google Drive', zoom: 'Zoom' };
function composioNote(app) {
  const k = [norm(app), appKey(app)].find((x) => COMPOSIO[x]);
  if (!k) return null;
  return `Composio's ${COMPOSIO[k]} toolkit page lists managed OAuth (OAuth2) as available, checked 2026-10-31. If you use Composio, you may not need your own OAuth app for a first connection. Register your own for your brand on the consent screen, custom scopes, or a separate quota. This guide covers that own-app path.`;
}
// Best-effort protection (in-memory, per server instance; not shared across serverless instances).
const cache = new Map(), hits = new Map();

async function probe(label, url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || blocked(u.hostname)) return null;
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(6000) });
    return { text: `${label} endpoint responded HTTP ${r.status} to an unauthenticated GET`, label: 'tested', source_url: url, source_note: 'Server-side probe at generation time. Shows the endpoint exists; says nothing about approval rules.' };
  } catch (e) {
    return { text: `${label} endpoint probe failed (${e.name})`, label: 'tested', source_url: url, source_note: 'Probe error' };
  }
}

// Free-tier friendly research: Tavily search -> sources handed to the model.
async function research(app) {
  const qs = [`${app} OAuth app registration developer docs`, `${app} OAuth app review verification approval requirements`, `${app} OAuth scopes redirect URI rate limits`];
  const out = await Promise.all(qs.map(async (query) => {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.TAVILY_API_KEY },
      body: JSON.stringify({ query, max_results: 5, search_depth: 'basic' }),
      signal: AbortSignal.timeout(20000),
    });
    const d = await r.json();
    if (!r.ok) throw new Error('Search failed: ' + ((d.detail && d.detail.error) || d.error || r.status));
    return d.results || [];
  }));
  const seen = new Map();
  for (const x of out.flat()) if (x.url && !seen.has(x.url)) seen.set(x.url, { url: x.url, title: x.title, content: String(x.content || '').slice(0, 1500) });
  return [...seen.values()].slice(0, 12);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const app = String((req.body && req.body.app) || '').trim().slice(0, 100);
  if (!app) return res.status(400).json({ error: 'Provide an app name or website' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'Server missing GEMINI_API_KEY' });
  const ck = norm(app), hit = cache.get(ck);
  if (hit && Date.now() - hit.t < 30 * 60 * 1000) return res.status(200).json(hit.g);
  const ip = String((req.headers && req.headers['x-forwarded-for']) || 'local').split(',')[0].trim();
  const now = Date.now(), recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (recent.length >= 5) return res.status(429).json({ error: 'Too many guides requested. Try again in a few minutes.' });
  recent.push(now); hits.set(ip, recent);
  try {
    const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    let allowed = null, textBySource = null, prompt = `Research OAuth app setup and approval for: ${app}`, tools;
    if (process.env.TAVILY_API_KEY) {
      const sources = await research(app);
      if (!sources.length) return res.status(502).json({ error: 'Search returned no results for that app.' });
      allowed = new Set(sources.map((x) => x.url));
      textBySource = new Map(sources.map((x) => [x.url, norm(x.title + ' ' + x.content)]));
      prompt += '\n\nUse ONLY these sources. Every source_url must be exactly one of these URLs. If they do not cover something, label it unverified.\n\n' +
        sources.map((x, i) => `[${i + 1}] ${x.url}\n${x.title}\n${x.content}`).join('\n\n');
    } else {
      tools = [{ google_search: {} }];
    }
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      ...(tools ? { tools } : { generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } }),
    });
    const models = [model, ...(process.env.GEMINI_FALLBACKS || 'gemini-3.1-flash-lite,gemini-3.8-flash').split(',').map((x) => x.trim()).filter(Boolean)];
    let r, data, timedOut = false;
    for (const m of models) {
      timedOut = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
            method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body, signal: AbortSignal.timeout(45000),
          });
          data = await r.json();
        } catch (e) { timedOut = true; break; }
        if (![429, 500, 503].includes(r.status)) break;
        await new Promise((ok) => setTimeout(ok, 2000));
      }
      if (!timedOut && ![429, 500, 503].includes(r.status)) break;
    }
    if (timedOut) return res.status(504).json({ error: 'Every model timed out. Try again, or set GEMINI_MODEL to a faster Flash Lite model.' });
    if (r.status === 429) return res.status(429).json({ error: 'Rate limit or quota (429). Google says: ' + ((data.error && data.error.message) || 'no details').slice(0, 300) });
    if (r.status === 503 || r.status === 500) return res.status(503).json({ error: 'Gemini is overloaded on every model I tried. Wait a minute and retry.' });
    if (!r.ok) return res.status(502).json({ error: (data.error && data.error.message) || 'Upstream error' });
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const text = parts.map((x) => x.text || '').join('');
    const guide = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    // Critic pass (deterministic): the model cannot "test"; unsourced claims are downgraded.
    const key = appKey(app);
    guide.claims = (guide.claims || []).map((c) => {
      if (c.label === 'tested') c.label = 'documented';
      if (c.label === 'documented' && !c.source_url) c.label = 'unverified';
      if (allowed && c.source_url) {
        c.source_type = sourceType(c.source_url, key);
        if (c.label === 'documented') {
          const q = norm(c.quote);
          if (!allowed.has(c.source_url)) { c.label = 'unverified'; c.source_note = 'Source URL was not among the pages searched. ' + (c.source_note || ''); }
          else if (q.length < 15 || !(textBySource.get(c.source_url) || '').includes(q)) { c.label = 'unverified'; c.source_note = 'Downgraded: the quoted text was not found in the source text. ' + (c.source_note || ''); }
          else if (key.length > 2 && !(textBySource.get(c.source_url) || '').includes(key)) { c.label = 'unverified'; c.source_note = 'Downgraded: the source text never mentions ' + app + '. ' + (c.source_note || ''); }
          else if (c.source_type === 'video') { c.label = 'inferred'; c.source_note = 'Video source, cannot be quote-checked. ' + (c.source_note || ''); }
          else if (c.source_type === 'community') { c.label = 'community-reported'; c.source_note = 'Forum or community post, not official documentation. ' + (c.source_note || ''); }
        }
      }
      return c;
    });
    guide.claims.forEach((c, i) => { if (!c.id) c.id = 'c' + (i + 1); });
    const byId = new Map(guide.claims.map((c) => [c.id, c]));
    const rank = { sourced: 3, community: 2, inferred: 1, unsourced: 0 };
    const stat = (ids) => {
      let best = 'unsourced';
      for (const id of Array.isArray(ids) ? ids : []) {
        const c = byId.get(id); if (!c) continue;
        const st = c.label === 'documented' ? 'sourced' : c.label === 'community-reported' ? 'community' : c.label === 'inferred' ? 'inferred' : 'unsourced';
        if (rank[st] > rank[best]) best = st;
      }
      return best;
    };
    const wrap = (x) => { if (typeof x === 'string') x = { t: x, c: [] }; return { t: String(x.t || ''), c: x.c || [], status: stat(x.c) }; };
    guide.before_you_start = (guide.before_you_start || []).map(wrap);
    guide.setup_steps = (guide.setup_steps || []).map(wrap);
    if (guide.review) { guide.review.status = stat(guide.review.c); guide.review.rejection_risks = (guide.review.rejection_risks || []).map(wrap); }
    guide.blockers = (guide.blockers || []).map((b) => ({ ...b, status: stat(b.c) }));
    guide.dev_ready_status = stat(guide.dev_ready_basis);
    guide.prod_ready_status = stat(guide.prod_ready_basis);
    guide.composio_note = composioNote(app) || 'Not checked yet. Look this app up at docs.composio.dev/toolkits/managed-auth to see whether Composio provides a managed OAuth app.';
    for (const k of ['authorize', 'token']) {
      const p = guide.endpoints && guide.endpoints[k] ? await probe(k, guide.endpoints[k]) : null;
      if (p) { p.source_type = 'probe'; guide.claims.push(p); }
    }
    guide.generated_at = new Date().toISOString();
    guide.generated = true;
    cache.set(ck, { t: Date.now(), g: guide });
    res.status(200).json(guide);
  } catch (e) {
    res.status(500).json({ error: 'Generation failed: ' + e.message });
  }
};
