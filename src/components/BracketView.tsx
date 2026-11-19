import type { Bracket, BracketTie } from '../types';
import { openMatch } from '../lib/matchStore';
import { Crest } from './ui';

function Tie({ t }: { t: BracketTie }) {
  const legs = t.legs.filter((m) => m.homeScore != null && m.awayScore != null);
  const target = t.legs[t.legs.length - 1];
  const side = (s: 'home' | 'away') => {
    const team = t[s];
    const agg = s === 'home' ? t.homeAgg : t.awayAgg;
    const cls = t.winner ? (t.winner === s ? ' win' : ' out') : '';
    return (
      <span class={`tie-team${cls}`}>
        <Crest team={team} size={20} />
        <span class="tie-name">{team.name}</span>
        <span class="tie-agg tnum">{agg ?? ''}</span>
      </span>
    );
  };
  return (
    <button class="tie" onClick={() => target && openMatch(target.id)} aria-label={`${t.home.name} contre ${t.away.name}`}>
      {side('home')}
      {side('away')}
      {(legs.length > 1 || t.note || t.legs.some((m) => m.status === 'live')) && (
        <span class="tie-legs">
          {t.legs.some((m) => m.status === 'live') && <span class="tie-live">En direct · </span>}
          {legs.length > 1 && legs.map((m, i) => `${i === 0 ? 'Aller' : 'Retour'} ${m.home.id === t.home.id ? `${m.homeScore}–${m.awayScore}` : `${m.awayScore}–${m.homeScore}`}`).join(' · ')}
          {t.note ? `${legs.length > 1 ? ' · ' : ''}${t.note}` : ''}
        </span>
      )}
      {legs.length === 0 && target && <span class="tie-legs">{new Date(target.kickoff).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short' })}</span>}
    </button>
  );
}

/** Tableau de la phase finale : un tour par colonne, qui défile horizontalement. */
export function BracketView({ b }: { b: Bracket }) {
  return (
    <div>
      <p class="bracket-season">
        {/^\d{4}$/.test(b.season) ? `Édition ${b.season}` : `Saison ${b.season}`}
        {!b.current && !/^\d{4}$/.test(b.season) && ' · la phase finale de la saison en cours commence en février'}
      </p>
      <div class="bracket" role="list">
        {b.rounds.map((r) => (
          <section class="bracket-col" key={r.slug} role="listitem" aria-label={r.name}>
            <h3>{r.name}</h3>
            <div class="bracket-ties">
              {r.ties.map((t) => (
                <Tie key={`${t.home.id}-${t.away.id}`} t={t} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
