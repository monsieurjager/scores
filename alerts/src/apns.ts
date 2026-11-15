// Envoi vers le service de notifications d'Apple (APNs) : jeton ES256 signé avec la clé .p8 (WebCrypto).
// La clé ne vit que dans les secrets Cloudflare (copiés depuis les secrets GitHub au déploiement).

export interface ApnsConfig {
  key: string; // contenu du fichier .p8
  keyId: string;
  teamId: string;
  bundleId: string;
}

const b64u = (b: Uint8Array | string) => {
  const bytes = typeof b === 'string' ? new TextEncoder().encode(b) : b;
  let s = '';
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export async function importP8(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/** Jeton d'authentification APNs (valable 1 h ; Apple refuse qu'on le renouvelle plus d'une fois toutes les 20 min). */
export async function providerToken(cfg: ApnsConfig, iat = Math.floor(Date.now() / 1000)): Promise<string> {
  const head = b64u(JSON.stringify({ alg: 'ES256', kid: cfg.keyId }));
  const claims = b64u(JSON.stringify({ iss: cfg.teamId, iat }));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await importP8(cfg.key), new TextEncoder().encode(`${head}.${claims}`));
  return `${head}.${claims}.${b64u(new Uint8Array(sig))}`;
}

let cached: { token: string; at: number } | null = null;
async function tokenFor(cfg: ApnsConfig, store?: { get(): Promise<{ token: string; at: number } | null>; set(v: { token: string; at: number }): Promise<unknown> }) {
  const now = Date.now();
  if (cached && now - cached.at < 40 * 60_000) return cached.token;
  const kept = await store?.get();
  if (kept && now - kept.at < 40 * 60_000) return (cached = kept).token;
  cached = { token: await providerToken(cfg), at: now };
  await store?.set(cached);
  return cached.token;
}

export interface ApnsPush {
  deviceToken: string;
  env: 'sandbox' | 'production';
  type: 'alert' | 'liveactivity';
  payload: unknown;
  priority?: 5 | 10;
  collapseId?: string;
}

/** Renvoie le code HTTP d'Apple (200 = accepté ; 400/410 avec BadDeviceToken/Unregistered = jeton à oublier). */
export async function sendApns(cfg: ApnsConfig, p: ApnsPush, store?: Parameters<typeof tokenFor>[1]): Promise<{ status: number; reason?: string }> {
  const host = p.env === 'production' ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';
  const headers: Record<string, string> = {
    authorization: `bearer ${await tokenFor(cfg, store)}`,
    'apns-topic': p.type === 'liveactivity' ? `${cfg.bundleId}.push-type.liveactivity` : cfg.bundleId,
    'apns-push-type': p.type,
    'apns-priority': String(p.priority ?? 10),
    'content-type': 'application/json',
  };
  if (p.collapseId) headers['apns-collapse-id'] = p.collapseId.slice(0, 64);
  const res = await fetch(`https://${host}/3/device/${p.deviceToken}`, { method: 'POST', headers, body: JSON.stringify(p.payload) });
  if (res.ok) return { status: res.status };
  const reason = ((await res.json().catch(() => ({}))) as { reason?: string }).reason;
  if (res.status === 403 && (reason === 'ExpiredProviderToken' || reason === 'InvalidProviderToken')) cached = null;
  return { status: res.status, reason };
}

export const deadToken = (r: { status: number; reason?: string }) => r.status === 410 || (r.status === 400 && (r.reason === 'BadDeviceToken' || r.reason === 'DeviceTokenNotForTopic'));
