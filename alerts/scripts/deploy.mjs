// Déploiement du service d'alertes sur Cloudflare (lancé par GitHub Actions).
// Prérequis : secrets CLOUDFLARE_API_TOKEN et CLOUDFLARE_ACCOUNT_ID.
// Étapes : sous-domaine workers.dev, base D1 (création si besoin + tables), wrangler.toml, déploiement.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const { CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: ACCOUNT, GITHUB_OUTPUT } = process.env;
if (!TOKEN || !ACCOUNT) {
  console.error('Secrets CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID absents : rien à déployer.');
  process.exit(1);
}

async function api(path, init = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}
const fail = (msg, r) => {
  console.error(`✗ ${msg} (HTTP ${r.status}) : ${JSON.stringify(r.json?.errors ?? r.json).slice(0, 400)}`);
  process.exit(1);
};

// 1. Sous-domaine workers.dev (créé s'il n'existe pas encore)
let r = await api('/workers/subdomain');
let subdomain = r.json?.result?.subdomain;
if (!subdomain) {
  const wanted = `scores-${Math.random().toString(36).slice(2, 8)}`;
  r = await api('/workers/subdomain', { method: 'PUT', body: JSON.stringify({ subdomain: wanted }) });
  if (!r.json?.success) fail('Création du sous-domaine workers.dev impossible', r);
  subdomain = wanted;
}
console.log(`✓ Sous-domaine : ${subdomain}.workers.dev`);

// 2. Base D1
r = await api('/d1/database?name=scores-alerts');
if (r.status === 403) fail("Le jeton n'a pas la permission D1 (Account → D1 → Edit)", r);
let dbId = (r.json?.result ?? []).find((d) => d.name === 'scores-alerts')?.uuid;
if (!dbId) {
  r = await api('/d1/database', { method: 'POST', body: JSON.stringify({ name: 'scores-alerts' }) });
  if (!r.json?.success) fail('Création de la base D1 impossible', r);
  dbId = r.json.result.uuid;
  console.log('✓ Base D1 créée');
} else console.log('✓ Base D1 existante');

// 3. Tables (idempotent)
for (const sql of readFileSync(new URL('../schema.sql', import.meta.url), 'utf8').split(';').map((s) => s.trim()).filter(Boolean)) {
  r = await api(`/d1/database/${dbId}/query`, { method: 'POST', body: JSON.stringify({ sql }) });
  if (!r.json?.success) fail('Création des tables impossible', r);
}
console.log('✓ Tables prêtes');

// 4. Configuration + déploiement
writeFileSync(new URL('../wrangler.toml', import.meta.url), readFileSync(new URL('../wrangler.template.toml', import.meta.url), 'utf8').replace('__D1_ID__', dbId));
execFileSync('npx', ['wrangler', 'deploy'], { stdio: 'inherit', cwd: new URL('..', import.meta.url).pathname });

const url = `https://scores-alerts.${subdomain}.workers.dev`;
console.log(`✓ Service déployé : ${url}`);
if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `url=${url}\n`);
