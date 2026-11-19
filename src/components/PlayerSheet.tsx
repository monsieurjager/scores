import type { SportId, Team } from '../types';
import { provider } from '../providers';
import { publishMatches, pushSheet } from '../lib/matchStore';
import { playerKey, usePlayers } from '../lib/players';
import { isNationalTeam } from '../lib/teams';
import { roleOf } from '../lib/ratings';
import { isStale } from '../lib/matchStats';
import { getSettings } from '../lib/settings';
import { useAsync } from '../hooks/useAsync';
import { Sheet } from './Sheet';
import { CompactCard, Crest, Section } from './ui';
import { IconStar } from './icons';

const ROLE = { gk: 'Gardien', def: 'Défenseur', mid: 'Milieu', att: 'Attaquant' } as const;
const tint = (c?: string) => (c && /^[0-9a-f]{6}$/i.test(c) ? `#${c}` : '#2a2f3a');

/** Fiche d'un joueur : le suivre (ses buts / essais en alerte), son équipe, le prochain match. */
export function PlayerSheet({ sport, id, name, team, number, position, canGoBack, onBack }: { sport: SportId; id: string; name: string; team: Team; number?: string; position?: string; canGoBack: boolean; onBack: () => void }) {
  const { keys, toggle } = usePlayers();
  const key = playerKey(sport, id);
  const on = keys.has(key);
  const national = isNationalTeam(sport, team.id);
  const matches = useAsync(
    (signal) =>
      provider.getTeamMatches(sport, team.id, national, signal).then((ms) => {
        publishMatches(ms);
        return ms;
      }),
    [sport, team.id],
  );
  const next = (matches ?? []).filter((m) => m.status === 'live' || (m.status === 'scheduled' && !isStale(m))).slice(0, 3);
  const alerts = getSettings().alerts.enabled;
  return (
    <Sheet title={sport === 'rugby' ? 'Rugby' : 'Football'} label={name} canGoBack={canGoBack} onBack={onBack}>
      <div class="team-hero2" style={{ '--c1': tint(team.color) }}>
        <span class="player-badge" style={{ background: tint(team.color) }}>
          {number ?? '–'}
        </span>
        <h1>{name}</h1>
        <p>
          {[sport === 'football' && position ? ROLE[roleOf(position)] : '', team.name].filter(Boolean).join(' · ')}
        </p>
        <button class={`follow${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggle({ key, id, sport, name, team })}>
          <IconStar filled={on} /> {on ? 'Suivi' : 'Suivre ce joueur'}
        </button>
        <p class="player-note">
          {on
            ? alerts
              ? `Tu seras alerté à chaque ${sport === 'rugby' ? 'essai' : 'but'} de ${name}, et ses matchs remontent en premier.`
              : `Ses matchs remontent en premier. Active les alertes dans Réglages pour être prévenu de ses ${sport === 'rugby' ? 'essais' : 'buts'}.`
            : `Suis-le pour être alerté de ses ${sport === 'rugby' ? 'essais' : 'buts'}.`}
        </p>
      </div>
      <Section title="Équipe">
        <li class="card team-row" role="button" tabIndex={0} onClick={() => pushSheet({ type: 'team', sport, team, national })}>
          <Crest team={team} size={32} />
          <div class="team-row-text">
            <span class="team-name">{team.name}</span>
            <span class="muted small">Voir la fiche de l'équipe</span>
          </div>
        </li>
      </Section>
      {next.length > 0 && (
        <Section title="Prochains matchs">
          {next.map((m) => (
            <CompactCard key={m.id} m={m} withDate />
          ))}
        </Section>
      )}
    </Sheet>
  );
}
