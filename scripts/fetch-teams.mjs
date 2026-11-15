// Régénère src/data/teams.json : la liste des équipes proposées dans le sélecteur de favoris.
// Les adresses /teams d'ESPN n'autorisent pas les navigateurs (pas d'en-tête CORS) : on les lit ici, au build.
// Usage : node scripts/fetch-teams.mjs   (à relancer à chaque début de saison)
import { writeFileSync } from 'node:fs';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';
// [sport, ligue ESPN, équipe nationale ?]
const SOURCES = [
  ['football', 'soccer/fra.1', false], ['football', 'soccer/eng.1', false], ['football', 'soccer/esp.1', false],
  ['football', 'soccer/ita.1', false], ['football', 'soccer/ger.1', false],
  ['football', 'soccer/uefa.champions', false], ['football', 'soccer/uefa.europa', false], ['football', 'soccer/uefa.europa.conf', false],
  ['football', 'soccer/uefa.nations', true], ['football', 'soccer/fifa.world', true], ['rugby', 'rugby/17567', true], ['rugby', 'rugby/180659', true],
  ['rugby', 'rugby/270559', false], ['rugby', 'rugby/271937', false], ['rugby', 'rugby/272073', false],
];

const byKey = new Map();
for (const [sport, path, national] of SOURCES) {
  const res = await fetch(`${BASE}/${path}/teams`);
  if (!res.ok) { console.warn(`! ${path}: HTTP ${res.status}`); continue; }
  const json = await res.json();
  for (const { team: t } of json.sports?.[0]?.leagues?.[0]?.teams ?? []) {
    byKey.set(`${sport}:${t.id}`, {
      sport, id: String(t.id), name: t.displayName, short: t.abbreviation,
      logo: t.logos?.[0]?.href?.replace(/^http:/, 'https:'), color: t.color, national,
    });
  }
  console.log(`✓ ${path}`);
}
const list = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

// Clubs français de rugby = clubs du Top 14 : sert à ne garder que leurs matchs en coupes d'Europe.
const top14 = await (await fetch(`${BASE}/rugby/270559/teams`)).json();
const frenchClubs = (top14.sports?.[0]?.leagues?.[0]?.teams ?? []).map(({ team }) => String(team.id));
writeFileSync(new URL('../src/data/frenchRugbyClubs.json', import.meta.url), JSON.stringify(frenchClubs) + '\n');
console.log(`${frenchClubs.length} clubs du Top 14 écrits.`);
writeFileSync(new URL('../src/data/teams.json', import.meta.url), JSON.stringify(list, null, 0) + '\n');
console.log(`${list.length} équipes écrites.`);
