/**
 * Service d'alertes de « Scores » (Cloudflare Worker, offre gratuite).
 * - L'app s'abonne (Web Push) avec ses équipes favorites et ses préférences.
 * - Chaque minute, le service relit les scores ESPN des matchs concernés et envoie les notifications.
 * Données stockées (D1) : abonnements (adresse de notification + équipes + préférences), dernier état connu
 * des matchs suivis, clés VAPID. Aucune donnée personnelle (ni nom, ni email).
 */
import { COMPETITIONS } from '../../src/config/competitions.ts';
import type { Competition } from '../../src/types';
import { detect, lineupsAlert, type Alert, type Stored, type TeamSheet } from './detect.ts';
import { fetchDays } from './espn.ts';
import { frenchName } from '../../src/config/teamNames.ts';
import { generateVapid, sendPush, type Vapid } from './webpush.ts';

interface Env {
  DB: D1Database;
  ORIGINS: string;
  SUBJECT: string;
}

type Prefs = { goals: boolean; kickoff: boolean; halftime: boolean; fulltime: boolean; red: boolean; lineups: boolean };
const DEFAULT_PREFS: Prefs = { goals: true, kickoff: true, halftime: true, fulltime: true, red: false, lineups: true };
const PREF_OF: Record<Alert['kind'], keyof Prefs> = { score: 'goals', kickoff: 'kickoff', halftime: 'halftime', fulltime: 'fulltime', red: 'red', lineups: 'lineups' };
// Services push autorisés (évite que le service serve à envoyer des requêtes vers n'importe quelle adresse)
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];

interface SubRow { id: string; endpoint: string; p256dh: string; auth: string; teams: string; prefs: string }
interface PlanMatch { id: string; kickoff: number; done?: boolean }
interface Plan { day: string; at: number; comps: Record<string, PlanMatch[]> }

const parisDay = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const prevDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const daysFor = (c: Competition, day: string) => (c.sport === 'rugby' && c.onlyTeams ? [prevDay(day), day] : [day]);

async function kvGet<T>(env: Env, k: string): Promise<T | null> {
  const row = await env.DB.prepare('SELECT v FROM kv WHERE k = ?').bind(k).first<{ v: string }>();
  return row ? (JSON.parse(row.v) as T) : null;
}
const kvSet = (env: Env, k: string, v: unknown) => env.DB.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, JSON.stringify(v)).run();
const kvDel = (env: Env, k: string) => env.DB.prepare('DELETE FROM kv WHERE k = ?').bind(k).run();

async function vapidKeys(env: Env): Promise<Vapid> {
  // Générées une fois, côté Cloudflare : la clé privée ne quitte jamais le service.
  const v = await kvGet<Vapid>(env, 'vapid');
  if (v) return v;
  const fresh = await generateVapid();
  await kvSet(env, 'vapid', fresh);
  return fresh;
}

const sha256 = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

// ---------------------------------------------------------------- surveillance (chaque minute)

/** Plan du jour : matchs des équipes suivies, par compétition (reconstruit toutes les 30 min ou si les abonnements changent). */
async function buildPlan(env: Env, fav: Set<string>, day: string): Promise<Plan> {
  const sports = new Set([...fav].map((k) => k.split(':')[0]));
  const comps: Plan['comps'] = {};
  for (const c of COMPETITIONS.filter((x) => sports.has(x.sport))) {
    try {
      const ms = (await fetchDays(c, daysFor(c, day))).filter(({ snap }) => fav.has(`${snap.sport}:${snap.home.id}`) || fav.has(`${snap.sport}:${snap.away.id}`));
      if (ms.length) comps[c.id] = ms.map(({ snap, kickoff }) => ({ id: snap.id, kickoff, done: snap.state === 'post' }));
    } catch {
      /* compétition indisponible : on réessaiera au prochain plan */
    }
  }
  const plan = { day, at: Date.now(), comps };
  await kvSet(env, 'plan', plan);
  await kvDel(env, 'dirty');
  return plan;
}

interface TickInfo {
  subs: number;
  rebuilt?: boolean;
  followed?: number;
  active?: number;
  alerts?: number;
}

async function tick(env: Env): Promise<TickInfo> {
  const subs = (await env.DB.prepare('SELECT id, endpoint, p256dh, auth, teams, prefs FROM subs').all<SubRow>()).results;
  if (!subs.length) return { subs: 0 };
  const fav = new Set(subs.flatMap((s) => JSON.parse(s.teams) as string[]));
  const now = Date.now();
  const day = parisDay(now);
  const plan = await kvGet<Plan>(env, 'plan');
  if (!plan || plan.day !== day || now - plan.at > 30 * 60_000 || (await kvGet(env, 'dirty'))) {
    const fresh = await buildPlan(env, fav, day); // beaucoup de requêtes : on s'arrête là pour ce passage
    return { subs: subs.length, rebuilt: true, followed: Object.values(fresh.comps).flat().length };
  }

  // Compétitions avec un match suivi en cours (ou sur le point de commencer)
  const active = Object.entries(plan.comps).filter(([, ms]) => ms.some((m) => !m.done && now >= m.kickoff - 3 * 60_000 && now <= m.kickoff + 4 * 3_600_000));
  const alerts: Alert[] = [];
  let planChanged = false;
  for (const [compId, planned] of active) {
    const comp = COMPETITIONS.find((c) => c.id === compId);
    if (!comp) continue;
    const parsed = await fetchDays(comp, daysFor(comp, day)).catch(() => []);
    for (const { snap } of parsed) {
      const pm = planned.find((p) => p.id === snap.id);
      if (!pm || pm.done) continue;
      const row = await env.DB.prepare('SELECT state FROM matches WHERE id = ?').bind(snap.id).first<{ state: string }>();
      const prev = row ? (JSON.parse(row.state) as Stored) : undefined;
      const { alerts: found, next } = detect(prev, snap);
      if (!prev || JSON.stringify(prev) !== JSON.stringify(next)) {
        await env.DB.prepare('INSERT INTO matches (id, state, updated) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated = excluded.updated').bind(snap.id, JSON.stringify(next), now).run();
      }
      alerts.push(...found);
      if (snap.state === 'post') {
        pm.done = true;
        planChanged = true;
      }
    }
  }
  // Compositions officielles : dans les 90 min avant le coup d'envoi, jusqu'à leur publication (une seule fois).
  const sent = (await kvGet<string[]>(env, 'lineups-sent')) ?? [];
  for (const [compId, planned] of Object.entries(plan.comps)) {
    const comp = COMPETITIONS.find((c) => c.id === compId);
    if (!comp) continue;
    for (const pm of planned) {
      if (pm.done || sent.includes(pm.id) || now < pm.kickoff - 90 * 60_000 || now > pm.kickoff + 15 * 60_000) continue;
      const a = await fetchLineups(comp, pm.id).catch(() => null);
      if (a) {
        alerts.push(a);
        sent.push(pm.id);
        await kvSet(env, 'lineups-sent', sent.slice(-60));
      }
    }
  }

  if (planChanged) await kvSet(env, 'plan', plan);
  if (alerts.length) await deliver(env, subs, alerts);
  // Ménage : états de matchs de plus de 3 jours
  if (new Date(now).getUTCMinutes() === 0) await env.DB.prepare('DELETE FROM matches WHERE updated < ?').bind(now - 3 * 86_400_000).run();
  return { subs: subs.length, followed: Object.values(plan.comps).flat().length, active: active.length, alerts: alerts.length };
}

/** Un passage, avec son résultat enregistré (consultable sur /status). */
async function safeTick(env: Env) {
  try {
    await kvSet(env, 'status', { at: Date.now(), ...(await tick(env)) });
  } catch (e) {
    await kvSet(env, 'status', { at: Date.now(), error: String(e) }).catch(() => {});
  }
}

/** Déclenché chaque minute : deux passages à 30 s d'intervalle (alertes ~2× plus rapides, toujours en offre gratuite). */
async function everyMinute(env: Env) {
  await safeTick(env);
  await new Promise((r) => setTimeout(r, 30_000));
  await safeTick(env);
}

/** Compositions d'un match (détail ESPN), ou null si elles ne sont pas encore publiées. */
async function fetchLineups(comp: Competition, matchId: string): Promise<Alert | null> {
  const eid = matchId.slice(comp.id.length + 1);
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${comp.espn.sport}/${comp.espn.league}/summary?event=${eid}`);
  if (!res.ok) return null;
  type P = { starter?: boolean; jersey?: string; athlete?: { shortName?: string; displayName?: string } };
  const j = (await res.json()) as { rosters?: { homeAway: string; formation?: string; team?: { id?: string; displayName?: string }; roster?: P[] }[]; header?: { competitions?: { competitors?: { homeAway: string; team?: { id?: string; displayName?: string } }[] }[] } };
  const nameOf = (p: P) => (p.athlete?.shortName ?? p.athlete?.displayName ?? '').replace(/^[A-ZÀ-Ý]\.\s*/, '');
  const sheets: TeamSheet[] = (j.rosters ?? []).map((r) => {
    const roster = r.roster ?? [];
    // Rugby : les numéros 1 à 15 sont les titulaires (l'indicateur « starter » d'ESPN n'est pas fiable)
    const starters = comp.sport === 'rugby' ? roster.filter((p) => Number(p.jersey) >= 1 && Number(p.jersey) <= 15).sort((a, b) => Number(a.jersey) - Number(b.jersey)) : roster.filter((p) => p.starter);
    return { teamId: String(r.team?.id ?? ''), name: r.team?.displayName ?? '', formation: r.formation, starters: starters.map(nameOf).filter(Boolean) };
  });
  const home = j.rosters?.find((r) => r.homeAway === 'home');
  const away = j.rosters?.find((r) => r.homeAway === 'away');
  if (!home?.team?.id || !away?.team?.id) return null;
  const nm = (n?: string) => (n ? (comp.onlyTeams ? frenchName(n) : n) : '');
  for (const sh of sheets) sh.name = nm(sh.name);
  return lineupsAlert({ id: matchId, sport: comp.sport, home: { id: String(home.team.id), name: nm(home.team.displayName) }, away: { id: String(away.team.id), name: nm(away.team.displayName) } }, sheets);
}

async function deliver(env: Env, subs: SubRow[], alerts: Alert[]) {
  const vapid = await vapidKeys(env);
  for (const s of subs) {
    const teams = new Set(JSON.parse(s.teams) as string[]);
    const prefs = { ...DEFAULT_PREFS, ...(JSON.parse(s.prefs) as Partial<Prefs>) };
    for (const a of alerts) {
      if (!prefs[PREF_OF[a.kind]] || !a.teamKeys.some((k) => teams.has(k))) continue;
      const body = (a.bodyByTeam && a.teamKeys.map((k) => (teams.has(k) ? a.bodyByTeam![k] : undefined)).find(Boolean)) || a.body;
      const status = await sendPush(s, { title: a.title, body, tag: a.tag, match: a.matchId }, vapid, env.SUBJECT).catch(() => 0);
      if (status === 404 || status === 410) {
        await env.DB.prepare('DELETE FROM subs WHERE id = ?').bind(s.id).run(); // abonnement expiré
        break;
      }
    }
  }
}

// ---------------------------------------------------------------- API pour l'app

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = env.ORIGINS.split(',').map((s) => s.trim());
  return allowed.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' } : {};
}
const json = (data: unknown, headers: Record<string, string>, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

async function handle(req: Request, env: Env): Promise<Response> {
  const h = cors(req, env);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  const { pathname } = new URL(req.url);

  if (req.method === 'GET' && pathname === '/vapid') return json({ publicKey: (await vapidKeys(env)).publicKey }, h);

  if (req.method === 'GET' && pathname === '/health') {
    const espn = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard').then((r) => r.status).catch(() => 0);
    const subs = await env.DB.prepare('SELECT COUNT(*) AS n FROM subs').first<{ n: number }>();
    return json({ ok: espn === 200, espn, subs: subs?.n ?? 0 }, h, espn === 200 ? 200 : 503);
  }

  // Diagnostic temporaire : Cloudflare peut-il joindre le service de notifications d'Apple (HTTP/2) ?
  if (req.method === 'GET' && pathname === '/diag/apns') {
    const out: Record<string, unknown> = {};
    for (const host of ['api.sandbox.push.apple.com', 'api.push.apple.com']) {
      try {
        const r = await fetch(`https://${host}/3/device/0000`, { method: 'POST', headers: { 'apns-topic': 'test', 'apns-push-type': 'alert' }, body: '{}' });
        out[host] = { status: r.status, body: (await r.text()).slice(0, 200) };
      } catch (e) {
        out[host] = { error: String(e) };
      }
    }
    return json(out, h);
  }

  if (req.method === 'GET' && pathname === '/status') {
    // État du service : dernier passage (doit dater de moins d'une minute), matchs suivis, erreurs éventuelles.
    const st = await kvGet<{ at: number; error?: string } & TickInfo>(env, 'status');
    const age = st ? Math.round((Date.now() - st.at) / 1000) : null;
    return json({ ok: !!st && age! < 300 && !st.error, lastTickSecondsAgo: age, ...(st ?? {}) }, h);
  }

  if (req.method !== 'POST') return json({ error: 'not found' }, h, 404);
  const body = (await req.json().catch(() => null)) as { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; endpoint?: string; teams?: unknown; prefs?: unknown } | null;
  const endpoint = body?.subscription?.endpoint ?? body?.endpoint ?? '';
  let host = '';
  try {
    const u = new URL(endpoint);
    host = u.protocol === 'https:' ? u.hostname : '';
  } catch {
    /* adresse invalide */
  }
  if (!host || !PUSH_HOSTS.some((r) => r.test(host))) return json({ error: 'abonnement invalide' }, h, 400);
  const id = await sha256(endpoint);

  if (pathname === '/subscribe') {
    const { p256dh = '', auth = '' } = body?.subscription?.keys ?? {};
    const teams = Array.isArray(body?.teams) ? (body!.teams as unknown[]).filter((t): t is string => typeof t === 'string' && /^(football|rugby):\d{1,10}$/.test(t)).slice(0, 100) : [];
    const p = (body?.prefs ?? {}) as Record<string, unknown>;
    const prefs: Prefs = { ...DEFAULT_PREFS };
    for (const k of Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]) if (typeof p[k] === 'boolean') prefs[k] = p[k] as boolean;
    if (!p256dh || !auth) return json({ error: 'clés manquantes' }, h, 400);
    await env.DB.prepare('INSERT INTO subs (id, endpoint, p256dh, auth, teams, prefs, updated) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, teams = excluded.teams, prefs = excluded.prefs, updated = excluded.updated')
      .bind(id, endpoint, p256dh, auth, JSON.stringify(teams), JSON.stringify(prefs), Date.now())
      .run();
    await kvSet(env, 'dirty', 1); // reconstruire le plan avec les nouvelles équipes
    return json({ ok: true, teams: teams.length }, h);
  }

  if (pathname === '/unsubscribe') {
    await env.DB.prepare('DELETE FROM subs WHERE id = ?').bind(id).run();
    return json({ ok: true }, h);
  }

  if (pathname === '/test') {
    const s = await env.DB.prepare('SELECT id, endpoint, p256dh, auth, teams, prefs FROM subs WHERE id = ?').bind(id).first<SubRow>();
    if (!s) return json({ error: 'abonnement inconnu' }, h, 404);
    const status = await sendPush(s, { title: 'Alertes activées', body: 'Tu recevras les buts, coups d’envoi et résultats de tes équipes favorites.', tag: 'test' }, await vapidKeys(env), env.SUBJECT);
    return json({ ok: status >= 200 && status < 300, status }, h);
  }

  return json({ error: 'not found' }, h, 404);
}

export default {
  fetch: (req: Request, env: Env) => handle(req, env).catch((e) => new Response(JSON.stringify({ error: String(e) }), { status: 500 })),
  scheduled: (_c: ScheduledController, env: Env, ctx: ExecutionContext) => ctx.waitUntil(everyMinute(env)),
} satisfies ExportedHandler<Env>;
