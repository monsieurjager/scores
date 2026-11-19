// Récap du matin : les matchs du jour des équipes favorites et des équipes des joueurs suivis.

export interface RecapMatch {
  kickoff: number;
  sport: 'football' | 'rugby';
  comp: string;
  home: { id: string; name: string };
  away: { id: string; name: string };
}

const hhmm = (t: number) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date(t)).replace(':', ' h ').replace(' h 00', ' h');

/** Clés d'équipes d'un abonné : équipes favorites + équipes des joueurs suivis (« p:football:1@football:160 »). */
export function teamKeysOf(entries: string[]): Set<string> {
  return new Set(entries.map((e) => (e.startsWith('p:') ? e.split('@')[1] : e)).filter(Boolean));
}

/** Notification du récap, ou null s'il n'y a aucun match. */
export function recapFor(entries: string[], matches: RecapMatch[]): { title: string; body: string } | null {
  const keys = teamKeysOf(entries);
  const mine = matches.filter((m) => keys.has(`${m.sport}:${m.home.id}`) || keys.has(`${m.sport}:${m.away.id}`)).sort((a, b) => a.kickoff - b.kickoff);
  if (!mine.length) return null;
  const lines = mine.slice(0, 6).map((m) => `${hhmm(m.kickoff)} · ${m.home.name} – ${m.away.name}${m.sport === 'rugby' ? ' (rugby)' : ''}`);
  if (mine.length > 6) lines.push(`et ${mine.length - 6} autre${mine.length > 7 ? 's' : ''}`);
  return { title: mine.length === 1 ? "📅 Aujourd'hui" : `📅 Aujourd'hui · ${mine.length} matchs`, body: lines.join('\n') };
}
