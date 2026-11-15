import { getSettings, updateSettings, type AlertSettings } from './settings';
import { getFavorites } from './favorites';

/** Adresse du service d'alertes (vide tant que Cloudflare n'est pas configuré). */
export const ALERTS_URL = (import.meta.env.VITE_ALERTS_URL ?? '').replace(/\/$/, '');
export const alertsAvailable = () => ALERTS_URL !== '';
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
/** Sur iPhone, les notifications web ne marchent que dans l'app installée sur l'écran d'accueil. */
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

// ---------------------------------------------------------------- app iPhone (pont natif)
// Dans l'app iPhone, les alertes passent par les notifications d'Apple (et les Activités en direct),
// demandées à l'app via window.webkit.messageHandlers.native ; réponse par window.__nativeReply(id, résultat).
type NativeWindow = Window & {
  __SCORES_NATIVE__?: { version: number };
  __nativeReply?: (id: string, result: unknown) => void;
  webkit?: { messageHandlers?: { native?: { postMessage(m: unknown): void } } };
};
const nw = window as NativeWindow;
export const isNative = () => !!nw.__SCORES_NATIVE__ && !!nw.webkit?.messageHandlers?.native;
const waiting = new Map<string, (r: Record<string, unknown>) => void>();
let seq = 0;
function nativeCall(type: string, data: Record<string, unknown> = {}, timeoutMs = 15_000): Promise<Record<string, unknown>> {
  nw.__nativeReply ??= (id, result) => {
    waiting.get(id)?.(result as Record<string, unknown>);
    waiting.delete(id);
  };
  const id = `n${++seq}`;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    setTimeout(() => waiting.has(id) && (waiting.delete(id), resolve({ error: 'timeout' })), timeoutMs);
    nw.webkit!.messageHandlers!.native!.postMessage({ id, type, ...data });
  });
}

const b64uToBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

async function post(path: string, body: unknown) {
  const res = await fetch(`${ALERTS_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Alertes ${path} : HTTP ${res.status}`);
  return res.json();
}

const prefsOf = (a: AlertSettings) => ({ goals: a.goals, kickoff: a.kickoff, halftime: a.halftime, fulltime: a.fulltime, red: a.red, lineups: a.lineups, live: a.live });
const teams = () => getFavorites().map((f) => f.key);

async function subscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export type EnableResult = 'ok' | 'denied' | 'unsupported' | 'error';

/** Active les alertes : autorisation, abonnement Web Push, envoi des équipes favorites au service. */
export async function enableAlerts(): Promise<EnableResult> {
  if (isNative()) {
    const alerts = { ...getSettings().alerts, enabled: true };
    // Laisse le temps de répondre à la demande d'autorisation d'iOS.
    const r = await nativeCall('alerts:enable', { teams: teams(), prefs: prefsOf(alerts) }, 120_000);
    if (r.ok === true) {
      updateSettings({ alerts });
      return 'ok';
    }
    const st = await nativeCall('alerts:status');
    return st.permission === 'denied' ? 'denied' : 'error';
  }
  if (!pushSupported() || !alertsAvailable()) return 'unsupported';
  try {
    // L'autorisation doit être demandée directement suite au geste de l'utilisateur.
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';
    const reg = await navigator.serviceWorker.ready;
    const { publicKey } = (await (await fetch(`${ALERTS_URL}/vapid`)).json()) as { publicKey: string };
    let sub = await reg.pushManager.getSubscription();
    // Abonnement créé avec une autre clé (service réinstallé) : on le remplace.
    const current = sub?.options.applicationServerKey;
    if (sub && current && btoa(String.fromCharCode(...new Uint8Array(current))) !== btoa(String.fromCharCode(...b64uToBytes(publicKey)))) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(publicKey) });
    const alerts = { ...getSettings().alerts, enabled: true };
    await post('/subscribe', { subscription: sub.toJSON(), teams: teams(), prefs: prefsOf(alerts) });
    updateSettings({ alerts });
    return 'ok';
  } catch {
    return 'error';
  }
}

export async function disableAlerts() {
  updateSettings({ alerts: { ...getSettings().alerts, enabled: false } });
  if (isNative()) {
    await nativeCall('alerts:disable');
    return;
  }
  try {
    const sub = await subscription();
    if (sub) {
      await post('/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe();
    }
  } catch {
    /* déjà désabonné */
  }
}

/** Renvoie au service les équipes favorites et les préférences (après un changement). */
export async function syncAlerts() {
  const a = getSettings().alerts;
  if (a.enabled && isNative()) {
    await nativeCall('alerts:sync', { teams: teams(), prefs: prefsOf(a) });
    return;
  }
  if (!a.enabled || !alertsAvailable() || !pushSupported()) return;
  try {
    const sub = await subscription();
    if (sub) await post('/subscribe', { subscription: sub.toJSON(), teams: teams(), prefs: prefsOf(a) });
  } catch {
    /* hors ligne : resynchronisé au prochain changement */
  }
}

export async function sendTestAlert(): Promise<boolean> {
  if (isNative()) return (await nativeCall('alerts:test')).ok === true;
  try {
    const sub = await subscription();
    if (!sub) return false;
    const r = (await post('/test', { endpoint: sub.endpoint })) as { ok: boolean };
    return r.ok;
  } catch {
    return false;
  }
}
