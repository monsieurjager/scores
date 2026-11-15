import { competitionById } from '../config/competitions';
import { provider } from '../providers';
import { publishMatches } from '../lib/matchStore';
import { useAsync } from '../hooks/useAsync';
import { Sheet } from './Sheet';
import { CompactCard, LiveCard, Section } from './ui';
import { Standings } from './Standings';

/** Fiche d'une compétition : journée en cours et classement complet. */
export function CompetitionSheet({ id, canGoBack, onBack }: { id: string; canGoBack: boolean; onBack: () => void }) {
  const comp = competitionById(id);
  const data = useAsync(
    (signal) =>
      comp
        ? provider.getCompetition(comp, signal).then((v) => {
            publishMatches(v.matchday);
            return v;
          })
        : Promise.resolve(null),
    [id],
  );
  if (!comp) return null;
  const matchday = [...(data?.matchday ?? [])].sort((a, b) => a.kickoff.localeCompare(b.kickoff));

  return (
    <Sheet title={comp.sport === 'rugby' ? 'Rugby' : 'Football'} label={comp.name} canGoBack={canGoBack} onBack={onBack}>
      <div class="large-title" style={{ padding: '4px 4px 0' }}>
        <h1 style={{ fontSize: '32px' }}>{comp.name}</h1>
      </div>
      {data === undefined && (
        <Section title="Chargement">
          <li class="card" style={{ padding: 16, listStyle: 'none' }} aria-busy="true">
            <div class="skeleton skeleton-line" />
            <div class="skeleton skeleton-line short" />
          </li>
        </Section>
      )}
      {data === null && <p class="note">Impossible de charger cette compétition.</p>}
      {matchday.length > 0 && (
        <Section title="Journée en cours">
          {matchday.map((m) => (m.status === 'live' ? <LiveCard key={m.id} m={m} /> : <CompactCard key={m.id} m={m} withDate />))}
        </Section>
      )}
      {data?.tables.map((t) => (
        <Section key={t.title} title={`Classement · ${t.title}`}>
          <li style={{ listStyle: 'none' }}>
            <Standings table={t} full />
          </li>
        </Section>
      ))}
      {data && data.tables.length === 0 && <p class="note">Pas de classement pour cette compétition.</p>}
    </Sheet>
  );
}
