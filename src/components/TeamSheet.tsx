import type { FormResult, Match, SportId, Team } from '../types';
import { provider } from '../providers';
import { publishMatches } from '../lib/matchStore';
import { favKey, toFav, useFavorites } from '../lib/favorites';
import { isStale } from '../lib/matchStats';
import { useAsync } from '../hooks/useAsync';
import { Sheet } from './Sheet';
import { CompactCard, Crest, LiveCard, Section } from './ui';
import { FormPills } from './MatchDetail';
import { IconStar } from './icons';

/** Résultat d'un match terminé, du point de vue de l'équipe. */
function resultFor(m: Match, teamId: string): FormResult | null {
  if (m.status !== 'finished' || m.homeScore == null || m.awayScore == null) return null;
  const home = m.home.id === teamId;
  const us = home ? m.homeScore : m.awayScore;
  const them = home ? m.awayScore : m.homeScore;
  return { result: us > them ? 'W' : us < them ? 'L' : 'D', score: `${us}-${them}`, opponent: (home ? m.away : m.home).name, date: m.kickoff };
}

/** Fiche d'une équipe : forme, match en cours, prochains matchs, derniers résultats. */
export function TeamSheet({ sport, team, national, canGoBack, onBack }: { sport: SportId; team: Team; national: boolean; canGoBack: boolean; onBack: () => void }) {
  const { keys, toggle } = useFavorites();
  const fav = keys.has(favKey(sport, team.id));
  const matches = useAsync(
    (signal) =>
      provider.getTeamMatches(sport, team.id, national, signal).then((ms) => {
        publishMatches(ms);
        return ms;
      }),
    [sport, team.id, national],
  );

  const live = (matches ?? []).filter((m) => m.status === 'live');
  const next = (matches ?? []).filter((m) => m.status === 'scheduled' && !isStale(m)).slice(0, 5);
  const past = (matches ?? []).filter((m) => m.status === 'finished').reverse();
  const form = past.slice(0, 5).map((m) => resultFor(m, team.id)).filter((r): r is FormResult => r !== null);

  return (
    <Sheet title={sport === 'rugby' ? 'Rugby' : 'Football'} label={team.name} canGoBack={canGoBack} onBack={onBack}>
      <div class="team-hero">
        <Crest team={team} size={72} />
        <h3>{team.name}</h3>
        <button class={`btn fav-toggle${fav ? ' on' : ''}`} aria-pressed={fav} onClick={() => toggle(toFav(sport, team))}>
          <IconStar filled={fav} /> {fav ? 'Dans mes favoris' : 'Ajouter aux favoris'}
        </button>
        {form.length > 0 && <FormPills results={form} />}
      </div>

      {matches === undefined && (
        <Section title="Matchs">
          <li class="card" style={{ padding: 16, listStyle: 'none' }} aria-busy="true">
            <div class="skeleton skeleton-line" />
            <div class="skeleton skeleton-line short" />
          </li>
        </Section>
      )}
      {matches === null && <p class="note">Impossible de charger le calendrier de cette équipe.</p>}
      {matches && matches.length === 0 && <p class="note">Aucun match trouvé dans les compétitions suivies.</p>}

      {live.length > 0 && (
        <Section title="En direct" live>
          {live.map((m) => (
            <LiveCard key={m.id} m={m} />
          ))}
        </Section>
      )}
      {next.length > 0 && (
        <Section title="Prochains matchs">
          {next.map((m) => (
            <CompactCard key={m.id} m={m} withDate />
          ))}
        </Section>
      )}
      {past.length > 0 && (
        <Section title="Derniers résultats">
          {past.slice(0, 8).map((m) => (
            <CompactCard key={m.id} m={m} withDate />
          ))}
        </Section>
      )}
    </Sheet>
  );
}
