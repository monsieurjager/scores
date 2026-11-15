// Vérification quotidienne : ESPN répond-il toujours, avec le format attendu, et en autorisant les navigateurs ?
// En cas d'échec, le workflow GitHub échoue et GitHub envoie un email au propriétaire du dépôt.
const BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const problems = [];
const check = (ok, msg) => ok || problems.push(msg);

async function get(url) {
  const res = await fetch(url, { headers: { Origin: 'https://example.github.io' } });
  check(res.ok, `${url} → HTTP ${res.status}`);
  check(res.headers.get('access-control-allow-origin') === '*', `${url} → en-tête CORS absent (le navigateur serait bloqué)`);
  return res.ok ? res.json() : null;
}

function checkScoreboard(json, label) {
  if (!json) return;
  check(Array.isArray(json.events), `${label} : champ "events" absent`);
  for (const e of json.events ?? []) {
    check(e.id && e.date && e.status?.type?.state, `${label} : match ${e.id ?? '?'} sans id/date/statut`);
    const c = e.competitions?.[0]?.competitors ?? [];
    check(c.length === 2, `${label} : match ${e.id} sans ses deux équipes`);
    for (const x of c) check(x.homeAway && x.team?.id && x.team?.displayName && x.team?.abbreviation, `${label} : équipe incomplète dans ${e.id}`);
  }
}

// Une journée de championnat de foot et de rugby récente (dates fixes passées : contenu stable)
checkScoreboard(await get(`${BASE}/soccer/eng.1/scoreboard?dates=20261107`), 'Premier League 7/11/2026');
checkScoreboard(await get(`${BASE}/rugby/17567/scoreboard?dates=20261113`), 'Championnat des Nations 13/11/2026');
// Tableaux du jour (format courant)
checkScoreboard(await get(`${BASE}/soccer/fra.1/scoreboard`), 'Ligue 1 (en cours)');
// Classement et détail d'un match
const st = await fetch('https://site.api.espn.com/apis/v2/sports/soccer/fra.1/standings').then((r) => (r.ok ? r.json() : null));
check(st?.children?.[0]?.standings?.entries?.length > 0, 'Classement Ligue 1 : format inattendu ou vide');
const sum = await get(`${BASE}/soccer/eng.1/summary?event=401878758`);
check(Array.isArray(sum?.rosters) && Array.isArray(sum?.boxscore?.teams), 'Détail de match : compositions ou statistiques absentes');

if (problems.length) {
  console.error(`✗ ${problems.length} problème(s) avec ESPN :\n- ` + problems.join('\n- '));
  process.exit(1);
}
console.log('✓ ESPN répond normalement (scores, classements, détails, CORS).');
