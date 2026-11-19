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
import { fetchDays, fetchEvent, signature, type Parsed } from './espn.ts';
import { frenchName } from '../../src/config/teamNames.ts';
import { generateVapid, sendPush, type Vapid } from './webpush.ts';
import { recapFor, teamKeysOf, type RecapMatch } from './recap.ts';
import { deadToken, sendApns, type ApnsConfig } from './apns.ts';
import { important, liveAttributes, liveContent, type LiveContent, type LiveTeam } from './live.ts';

interface Env {
  DB: D1Database;
  ORIGINS: string;
  SUBJECT: string;
  // App iPhone (facultatif) : clé Apple pour les notifications natives et les Activités en direct
  APNS_KEY?: string;
  APNS_KEY_ID?: string;
  APNS_TEAM_ID?: string;
  APNS_BUNDLE_ID?: string;
}

type Prefs = { goals: boolean; kickoff: boolean; halftime: boolean; fulltime: boolean; red: boolean; lineups: boolean; recap: boolean; live: boolean };
const DEFAULT_PREFS: Prefs = { goals: true, kickoff: true, halftime: true, fulltime: true, red: false, lineups: true, recap: true, live: true };
const PREF_OF: Record<Alert['kind'], keyof Prefs> = { score: 'goals', kickoff: 'kickoff', halftime: 'halftime', fulltime: 'fulltime', red: 'red', lineups: 'lineups' };
// Services push autorisés (évite que le service serve à envoyer des requêtes vers n'importe quelle adresse)
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];

interface SubRow { id: string; endpoint: string; p256dh: string; auth: string; teams: string; prefs: string }
interface NativeRow { id: string; token: string; env: 'sandbox' | 'production'; teams: string; prefs: string; start_token: string | null }
interface PlanMatch { id: string; kickoff: number; done?: boolean; comp?: string; home?: LiveTeam; away?: LiveTeam }
interface Plan { v?: number; day: string; at: number; comps: Record<string, PlanMatch[]> }
const PLAN_VERSION = 2;

const apnsConfig = (env: Env): ApnsConfig | null =>
  env.APNS_KEY && env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_BUNDLE_ID ? { key: env.APNS_KEY, keyId: env.APNS_KEY_ID, teamId: env.APNS_TEAM_ID, bundleId: env.APNS_BUNDLE_ID } : null;
const jwtStore = (env: Env) => ({ get: () => kvGet<{ token: string; at: number }>(env, 'apns-jwt'), set: (v: { token: string; at: number }) => kvSet(env, 'apns-jwt', v) });
const parisTime = (t: number) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date(t)).replace(':', ' h ');

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
      const team = (t: Parsed['snap']['home']): LiveTeam => ({ id: t.id, name: t.name, short: t.short || t.name.slice(0, 3).toUpperCase(), color: t.color || '1c1c1e' });
      if (ms.length) comps[c.id] = ms.map(({ snap, kickoff }) => ({ id: snap.id, kickoff, done: snap.state === 'post', comp: c.name, home: team(snap.home), away: team(snap.away) }));
    } catch {
      /* compétition indisponible : on réessaiera au prochain plan */
    }
  }
  const plan: Plan = { v: PLAN_VERSION, day, at: Date.now(), comps };
  await kvSet(env, 'plan', plan);
  await kvDel(env, 'dirty');
  return plan;
}

/** Matchs suivis en cours, surveillés toutes les 10 s entre deux passages complets. */
interface Watch { comp: string; id: string; sig: string }

interface TickInfo {
  subs: number;
  natives?: number;
  live?: number;
  rebuilt?: boolean;
  followed?: number;
  active?: number;
  alerts?: number;
}

async function tick(env: Env, fresh?: Map<string, Parsed>): Promise<TickInfo> {
  const subs = (await env.DB.prepare('SELECT id, endpoint, p256dh, auth, teams, prefs FROM subs').all<SubRow>()).results;
  const natives = (await env.DB.prepare('SELECT id, token, env, teams, prefs, start_token FROM native_subs').all<NativeRow>()).results;
  if (!subs.length && !natives.length) return { subs: 0, natives: 0 };
  const apns = apnsConfig(env);
  // Équipes à surveiller : favorites + équipes des joueurs suivis
  const fav = new Set([...subs, ...natives].flatMap((s) => [...teamKeysOf(JSON.parse(s.teams) as string[])]));
  const now = Date.now();
  const day = parisDay(now);
  const plan = await kvGet<Plan>(env, 'plan');
  if (!plan || plan.v !== PLAN_VERSION || plan.day !== day || now - plan.at > 30 * 60_000 || (await kvGet(env, 'dirty'))) {
    const fresh = await buildPlan(env, fav, day); // beaucoup de requêtes : on s'arrête là pour ce passage
    return { subs: subs.length, natives: natives.length, rebuilt: true, followed: Object.values(fresh.comps).flat().length };
  }

  // Compétitions avec un match suivi en cours (ou sur le point de commencer)
  const active = Object.entries(plan.comps).filter(([, ms]) => ms.some((m) => !m.done && now >= m.kickoff - 3 * 60_000 && now <= m.kickoff + 4 * 3_600_000));
  const alerts: Alert[] = [];
  let planChanged = false;
  let live = 0;
  const watch: Watch[] = [];
  for (const [compId, planned] of active) {
    const comp = COMPETITIONS.find((c) => c.id === compId);
    if (!comp) continue;
    // Matchs suivis de la fenêtre : lus un par un (point d'accès ESPN le plus réactif, 4 à 12 s d'avance
    // sur le tableau du jour), ou repris du coup d'œil qui vient de voir le changement.
    const ids = planned.filter((p) => !p.done && now >= p.kickoff - 3 * 60_000 && now <= p.kickoff + 4 * 3_600_000).map((p) => p.id);
    const parsed = (await Promise.all(ids.map((id) => fresh?.get(id) ?? fetchEvent(comp, id.slice(compId.length + 1)).catch(() => null)))).filter((x): x is Parsed => !!x);
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
      if (snap.state !== 'post' && now >= pm.kickoff - 3 * 60_000) watch.push({ comp: compId, id: snap.id, sig: signature(snap) });
      if (apns) live += await liveUpdate(env, apns, snap).catch(() => 0);
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
  await morningRecap(env, plan, subs, natives, apns, now).catch(() => {});
  await kvSet(env, 'watch', watch);
  if (apns) live += await liveStarts(env, apns, natives, plan, now).catch(() => 0);
  if (alerts.length) await logAlerts(env, alerts, now);
  if (alerts.length) await deliver(env, subs, alerts);
  if (alerts.length && apns) await deliverNative(env, apns, natives, alerts);
  // Ménage : états de matchs de plus de 3 jours
  if (new Date(now).getUTCMinutes() === 0) await env.DB.prepare('DELETE FROM matches WHERE updated < ?').bind(now - 3 * 86_400_000).run();
  return { subs: subs.length, natives: natives.length, followed: Object.values(plan.comps).flat().length, active: active.length, alerts: alerts.length, live };
}

/** Un passage, avec son résultat enregistré (consultable sur /status). */
async function safeTick(env: Env, fresh?: Map<string, Parsed>) {
  try {
    await kvSet(env, 'status', { at: Date.now(), ...(await tick(env, fresh)) });
  } catch (e) {
    await kvSet(env, 'status', { at: Date.now(), error: String(e) }).catch(() => {});
  }
}

/**
 * Déclenché chaque minute : un passage complet, puis jusqu'à la minute suivante, un coup d'œil toutes les 5 s
 * aux seuls matchs suivis en cours (requête légère, sans base de données). Au moindre changement
 * (but, carton, mi-temps, minute…), passage complet immédiat : détection, notifications, Activités en direct.
 */
async function everyMinute(env: Env) {
  const t0 = Date.now();
  await safeTick(env);
  let watch = (await kvGet<Watch[]>(env, 'watch').catch(() => null)) ?? [];
  // Offre gratuite : 50 requêtes externes par déclenchement. Toutes les 5 s jusqu'à 3 matchs en même temps, 10 s au-delà.
  let budget = 30;
  while (watch.length && Date.now() - t0 < 52_000 && budget >= watch.length) {
    await new Promise((r) => setTimeout(r, watch.length <= 3 ? 5_000 : 10_000));
    budget -= watch.length;
    const fresh = new Map<string, Parsed>();
    await Promise.all(
      watch.map(async (w) => {
        const comp = COMPETITIONS.find((c) => c.id === w.comp);
        const p = comp ? await fetchEvent(comp, w.id.slice(w.comp.length + 1)).catch(() => null) : null;
        if (p && signature(p.snap) !== w.sig) fresh.set(w.id, p);
      }),
    );
    if (fresh.size) {
      await safeTick(env, fresh);
      watch = (await kvGet<Watch[]>(env, 'watch').catch(() => null)) ?? [];
    }
  }
}

/** Journal des dernières alertes (heure de détection, minute ESPN) : consultable sur /status pour mesurer les délais. */
async function logAlerts(env: Env, alerts: Alert[], now: number) {
  const log = (await kvGet<unknown[]>(env, 'recent')) ?? [];
  for (const a of alerts) log.push({ at: new Date(now).toISOString(), kind: a.kind, title: a.title });
  await kvSet(env, 'recent', log.slice(-15));
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

/** Alertes destinées à un abonné (ses équipes, ses préférences), avec le texte propre à son équipe. */
function alertsFor(s: { teams: string; prefs: string }, alerts: Alert[]) {
  const entries = JSON.parse(s.teams) as string[];
  const teams = new Set(entries.filter((e) => !e.startsWith('p:')));
  const players = new Set(entries.filter((e) => e.startsWith('p:')).map((e) => e.slice(2).split('@')[0]));
  const prefs = { ...DEFAULT_PREFS, ...(JSON.parse(s.prefs) as Partial<Prefs>) };
  const out: { a: Alert; body: string }[] = [];
  for (const a of alerts) {
    if (!prefs[PREF_OF[a.kind]]) continue;
    if (a.teamKeys.some((k) => teams.has(k))) {
      // Équipe suivie ; si le buteur est aussi un joueur suivi, le titre le met en avant
      const title = a.scorer && players.has(a.scorer.key) ? a.scorer.title : a.title;
      out.push({ a: { ...a, title }, body: (a.bodyByTeam && a.teamKeys.map((k) => (teams.has(k) ? a.bodyByTeam![k] : undefined)).find(Boolean)) || a.body });
    } else if (a.scorer && players.has(a.scorer.key)) {
      // Seul le joueur est suivi : alerte à son nom (jamais silencieuse, l'abonné n'a pas reçu la première version)
      out.push({ a: { ...a, title: a.scorer.title, silent: false, tag: `${a.tag}-p` }, body: a.body });
    }
  }
  return out;
}

async function deliver(env: Env, subs: SubRow[], alerts: Alert[]) {
  const vapid = await vapidKeys(env);
  for (const s of subs) {
    for (const { a, body } of alertsFor(s, alerts)) {
      const status = await sendPush(s, { title: a.title, body, tag: a.tag, match: a.matchId, ...(a.silent ? { silent: true } : {}) }, vapid, env.SUBJECT).catch(() => 0);
      if (status === 404 || status === 410) {
        await env.DB.prepare('DELETE FROM subs WHERE id = ?').bind(s.id).run(); // abonnement expiré
        break;
      }
    }
  }
}

const forgetNative = (env: Env, id: string) => env.DB.batch([env.DB.prepare('DELETE FROM native_subs WHERE id = ?').bind(id), env.DB.prepare('DELETE FROM activities WHERE id = ?').bind(id)]);

const nativeAlert = (title: string, body: string, matchId?: string, silent = false) => ({ aps: { alert: { title, body }, ...(silent ? {} : { sound: 'default' }), ...(matchId ? { 'thread-id': matchId } : {}) }, ...(matchId ? { match: matchId } : {}) });

async function deliverNative(env: Env, apns: ApnsConfig, natives: NativeRow[], alerts: Alert[]) {
  for (const s of natives) {
    for (const { a, body } of alertsFor(s, alerts)) {
      const r = await sendApns(apns, { deviceToken: s.token, env: s.env, type: 'alert', payload: nativeAlert(a.title, body, a.matchId, a.silent), collapseId: a.tag }, jwtStore(env)).catch(() => ({ status: 0 }));
      if (deadToken(r)) {
        await forgetNative(env, s.id); // app supprimée ou notifications coupées
        break;
      }
    }
  }
}

// ---------------------------------------------------------------- Activités en direct (app iPhone)

/** Met à jour (ou termine) les Activités en direct d'un match quand ce qui s'affiche change. */
async function liveUpdate(env: Env, apns: ApnsConfig, snap: Parsed['snap']): Promise<number> {
  const acts = (await env.DB.prepare('SELECT id, token, env FROM activities WHERE match_id = ?').bind(snap.id).all<{ id: string; token: string; env: 'sandbox' | 'production' }>()).results;
  if (!acts.length) return 0;
  const content = liveContent(snap);
  const prev = await kvGet<LiveContent>(env, `la:${snap.id}`);
  if (prev && JSON.stringify(prev) === JSON.stringify(content)) return 0;
  const end = snap.state === 'post';
  const ts = Math.floor(Date.now() / 1000);
  // Sans nouvelle pendant 30 min (service arrêté…), iOS signale que l'affichage n'est plus à jour.
  const aps = { timestamp: ts, event: end ? 'end' : 'update', 'content-state': content, ...(end ? { 'dismissal-date': ts + 3600 } : { 'stale-date': ts + 30 * 60 }) };
  const priority = important(prev ?? undefined, content) ? 10 : 5;
  for (const a of acts) {
    const r = await sendApns(apns, { deviceToken: a.token, env: a.env, type: 'liveactivity', payload: { aps }, priority }, jwtStore(env)).catch(() => ({ status: 0 }));
    if (deadToken(r)) await env.DB.prepare('DELETE FROM activities WHERE id = ? AND match_id = ?').bind(a.id, snap.id).run();
  }
  if (end) {
    await env.DB.prepare('DELETE FROM activities WHERE match_id = ?').bind(snap.id).run();
    await kvDel(env, `la:${snap.id}`);
  } else await kvSet(env, `la:${snap.id}`, content);
  return acts.length;
}

/** Lance à distance l'Activité en direct ~1 h avant chaque match d'une équipe suivie (une fois par appareil et par match). */
async function liveStarts(env: Env, apns: ApnsConfig, natives: NativeRow[], plan: Plan, now: number): Promise<number> {
  const started = (await kvGet<string[]>(env, 'la-started')) ?? [];
  let n = 0;
  for (const s of natives) {
    if (!s.start_token) continue;
    const prefs = { ...DEFAULT_PREFS, ...(JSON.parse(s.prefs) as Partial<Prefs>) };
    if (!prefs.live) continue;
    const teams = new Set(JSON.parse(s.teams) as string[]);
    for (const [compId, planned] of Object.entries(plan.comps)) {
      const sport = COMPETITIONS.find((c) => c.id === compId)?.sport;
      for (const pm of planned) {
        if (pm.done || !pm.home || !pm.away || now < pm.kickoff - 60 * 60_000 || now > pm.kickoff + 2 * 3_600_000) continue;
        if (!teams.has(`${sport}:${pm.home.id}`) && !teams.has(`${sport}:${pm.away.id}`)) continue;
        const key = `${s.id}|${pm.id}`;
        if (started.includes(key)) continue;
        started.push(key);
        n++;
        const content: LiveContent = (await kvGet<LiveContent>(env, `la:${pm.id}`)) ?? { status: 'pre', homeScore: 0, awayScore: 0, clock: '' };
        const aps = {
          timestamp: Math.floor(now / 1000),
          event: 'start',
          'content-state': content,
          'attributes-type': 'MatchAttributes',
          attributes: liveAttributes(pm.id, pm.comp ?? '', pm.kickoff, pm.home, pm.away),
          alert: { title: `${pm.home.name} – ${pm.away.name}`, body: content.status === 'pre' ? `Coup d'envoi à ${parisTime(pm.kickoff)}` : (pm.comp ?? '') },
        };
        const r = await sendApns(apns, { deviceToken: s.start_token, env: s.env, type: 'liveactivity', payload: { aps }, priority: 10 }, jwtStore(env)).catch(() => ({ status: 0 }));
        if (deadToken(r)) {
          await env.DB.prepare('UPDATE native_subs SET start_token = NULL WHERE id = ?').bind(s.id).run();
          break;
        }
      }
    }
  }
  if (n) await kvSet(env, 'la-started', started.slice(-300));
  return n;
}

// ---------------------------------------------------------------- API pour l'app

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = env.ORIGINS.split(',').map((s) => s.trim());
  return allowed.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' } : {};
}
const json = (data: unknown, headers: Record<string, string>, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

// Équipes (« football:160 ») et joueurs suivis (« p:football:231388@football:160 »)
const parseTeams = (v: unknown) => (Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string' && /^((football|rugby):\d{1,10}|p:(football|rugby):\d{1,12}@(football|rugby):\d{1,10})$/.test(t)).slice(0, 150) : []);
function parsePrefs(v: unknown): Prefs {
  const p = (v ?? {}) as Record<string, unknown>;
  const prefs: Prefs = { ...DEFAULT_PREFS };
  for (const k of Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]) if (typeof p[k] === 'boolean') prefs[k] = p[k] as boolean;
  return prefs;
}

const HEX_TOKEN = /^[0-9a-f]{64,400}$/i;
const INSTALL_ID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;

/** API de l'app iPhone : abonnement par jeton Apple (identifiant d'installation aléatoire, aucune donnée personnelle). */
async function handleNative(req: Request, env: Env, pathname: string, h: Record<string, string>): Promise<Response> {
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const id = typeof b.id === 'string' && INSTALL_ID.test(b.id) ? b.id.toUpperCase() : '';
  if (!id) return json({ error: 'identifiant invalide' }, h, 400);
  const envOf = (v: unknown) => (v === 'production' ? 'production' : 'sandbox');

  if (pathname === '/native/subscribe') {
    const token = typeof b.deviceToken === 'string' && HEX_TOKEN.test(b.deviceToken) ? b.deviceToken : '';
    if (!token) return json({ error: 'jeton invalide' }, h, 400);
    const start = typeof b.startToken === 'string' && HEX_TOKEN.test(b.startToken) ? b.startToken : null;
    const teams = parseTeams(b.teams);
    await env.DB.prepare('INSERT INTO native_subs (id, token, env, teams, prefs, start_token, updated) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET token = excluded.token, env = excluded.env, teams = excluded.teams, prefs = excluded.prefs, start_token = COALESCE(excluded.start_token, native_subs.start_token), updated = excluded.updated')
      .bind(id, token, envOf(b.env), JSON.stringify(teams), JSON.stringify(parsePrefs(b.prefs)), start, Date.now())
      .run();
    await kvSet(env, 'dirty', 1);
    return json({ ok: true, teams: teams.length, live: !!apnsConfig(env) }, h);
  }

  if (pathname === '/native/unsubscribe') {
    await forgetNative(env, id);
    return json({ ok: true }, h);
  }

  if (pathname === '/native/activity') {
    const token = typeof b.token === 'string' && HEX_TOKEN.test(b.token) ? b.token : '';
    const matchId = typeof b.matchId === 'string' && /^[a-z0-9.]{2,40}-\d{1,12}$/i.test(b.matchId) ? b.matchId : '';
    if (!token || !matchId) return json({ error: 'activité invalide' }, h, 400);
    if (!(await env.DB.prepare('SELECT 1 FROM native_subs WHERE id = ?').bind(id).first())) return json({ error: 'abonnement inconnu' }, h, 404);
    await env.DB.prepare('INSERT INTO activities (id, match_id, token, env, updated) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id, match_id) DO UPDATE SET token = excluded.token, env = excluded.env, updated = excluded.updated')
      .bind(id, matchId, token, envOf(b.env), Date.now())
      .run();
    await kvDel(env, `la:${matchId}`); // la prochaine mise à jour part tout de suite, avec le score du moment
    return json({ ok: true }, h);
  }

  if (pathname === '/native/test') {
    const apns = apnsConfig(env);
    if (!apns) return json({ error: 'clé Apple non configurée sur le service' }, h, 503);
    const s = await env.DB.prepare('SELECT token, env FROM native_subs WHERE id = ?').bind(id).first<{ token: string; env: 'sandbox' | 'production' }>();
    if (!s) return json({ error: 'abonnement inconnu' }, h, 404);
    const r = await sendApns(apns, { deviceToken: s.token, env: s.env, type: 'alert', payload: nativeAlert('Alertes activées', 'Tu recevras les buts, coups d’envoi et résultats de tes équipes favorites.') }, jwtStore(env));
    return json({ ok: r.status === 200, status: r.status, reason: r.reason }, h);
  }

  return json({ error: 'not found' }, h, 404);
}

async function handle(req: Request, env: Env): Promise<Response> {
  const h = cors(req, env);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  const { pathname } = new URL(req.url);

  if (req.method === 'GET' && pathname === '/vapid') return json({ publicKey: (await vapidKeys(env)).publicKey }, h);

  if (req.method === 'GET' && pathname === '/health') {
    const espn = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard').then((r) => r.status).catch(() => 0);
    const subs = await env.DB.prepare('SELECT COUNT(*) AS n FROM subs').first<{ n: number }>();
    const natives = await env.DB.prepare('SELECT COUNT(*) AS n FROM native_subs').first<{ n: number }>();
    return json({ ok: espn === 200, espn, subs: subs?.n ?? 0, natives: natives?.n ?? 0, apns: !!apnsConfig(env) }, h, espn === 200 ? 200 : 503);
  }

  if (req.method === 'GET' && pathname === '/status') {
    // État du service : dernier passage (doit dater de moins d'une minute), matchs suivis, erreurs éventuelles.
    const st = await kvGet<{ at: number; error?: string } & TickInfo>(env, 'status');
    const age = st ? Math.round((Date.now() - st.at) / 1000) : null;
    return json({ ok: !!st && age! < 300 && !st.error, lastTickSecondsAgo: age, ...(st ?? {}), recent: (await kvGet(env, 'recent')) ?? [] }, h);
  }

  if (req.method !== 'POST') return json({ error: 'not found' }, h, 404);
  if (pathname.startsWith('/native/')) return handleNative(req, env, pathname, h);
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
    const teams = parseTeams(body?.teams);
    const prefs = parsePrefs(body?.prefs);
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

/** Récap du matin, à 9 h (heure de Paris), une fois par jour : les matchs du jour de chaque abonné. */
async function morningRecap(env: Env, plan: Plan, subs: SubRow[], natives: NativeRow[], apns: ApnsConfig | null, now: number) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }).format(new Date(now)));
  if (hour !== 9 || (await kvGet<string>(env, 'recap-day')) === plan.day) return;
  await kvSet(env, 'recap-day', plan.day);
  const matches: RecapMatch[] = [];
  for (const [compId, planned] of Object.entries(plan.comps)) {
    const comp = COMPETITIONS.find((c) => c.id === compId);
    if (!comp) continue;
    for (const pm of planned) if (!pm.done && pm.home && pm.away && parisDay(pm.kickoff) === plan.day && pm.kickoff > now) matches.push({ kickoff: pm.kickoff, sport: comp.sport, comp: comp.name, home: pm.home, away: pm.away });
  }
  if (!matches.length) return;
  const wants = (prefs: string) => ({ ...DEFAULT_PREFS, ...(JSON.parse(prefs) as Partial<Prefs>) }).recap;
  const vapid = await vapidKeys(env);
  for (const s of subs) {
    const r = wants(s.prefs) ? recapFor(JSON.parse(s.teams) as string[], matches) : null;
    if (r) await sendPush(s, { title: r.title, body: r.body, tag: `recap-${plan.day}` }, vapid, env.SUBJECT).catch(() => 0);
  }
  if (!apns) return;
  for (const s of natives) {
    const r = wants(s.prefs) ? recapFor(JSON.parse(s.teams) as string[], matches) : null;
    if (r) await sendApns(apns, { deviceToken: s.token, env: s.env, type: 'alert', payload: nativeAlert(r.title, r.body), collapseId: `recap-${plan.day}` }, jwtStore(env)).catch(() => ({ status: 0 }));
  }
}
