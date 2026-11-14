import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Match, MatchEvent, StandingsTable } from '../types';
import { competitionById } from '../config/competitions';
import { formatShortDate, formatTime } from '../lib/date';
import { halfTimeScore } from '../lib/matchStats';
import { useMatch } from '../lib/matchStore';
import { useStandings } from '../hooks/useStandings';
import { Crest, Section } from './ui';
import { IconBall } from './icons';

const RUGBY_LABEL: Record<string, string> = { try: 'Essai', conversion: 'Transformation', penaltygoal: 'Pénalité', dropgoal: 'Drop', penaltytry: 'Essai de pénalité' };
const CARD_LABEL = { yellow: 'Carton jaune', red: 'Carton rouge' } as const;

function eventNote(e: MatchEvent): string {
  switch (e.kind) {
    case 'penalty': return 'But sur penalty';
    case 'owngoal': return 'But contre son camp';
    case 'goal': return 'But';
    case 'yellow': case 'red': return CARD_LABEL[e.kind];
    default: return RUGBY_LABEL[e.kind] ?? '';
  }
}

function EventIcon({ e }: { e: MatchEvent }) {
  if (e.kind === 'yellow' || e.kind === 'red') return <span class={`tl-ico ${e.kind}`} aria-hidden="true" />;
  if (e.points > 0 && (e.kind === 'try' || e.kind === 'conversion' || e.kind === 'penaltygoal' || e.kind === 'dropgoal' || e.kind === 'penaltytry')) return <span class="tl-ico" aria-hidden="true">+{e.points}</span>;
  return (
    <span class="tl-ico" aria-hidden="true">
      <IconBall />
    </span>
  );
}

function Timeline({ m }: { m: Match }) {
  const events = m.events ?? [];
  return (
    <div class="glass-panel">
      {events.map((e) => {
        const home = e.teamId === m.home.id;
        const side = (
          <div class={`tl-side ${home ? 'home' : 'away'}`}>
            <span class="tl-player">{e.player ?? '—'}</span>
            <span class="tl-note">{eventNote(e)}</span>
          </div>
        );
        return (
          <div class="tl-row" key={e.id}>
            {home ? side : <div />}
            <div class="tl-mid">
              <EventIcon e={e} />
              <span class="tnum">{e.clock}</span>
            </div>
            {home ? <div /> : side}
          </div>
        );
      })}
    </div>
  );
}

function Standings({ table, highlight }: { table: StandingsTable; highlight: string[] }) {
  const [all, setAll] = useState(false);
  const rows = table.rows;
  const idx = rows.map((r, i) => (highlight.includes(r.team.id) ? i : -1)).filter((i) => i >= 0);
  const compact = rows.length > 12 && !all;
  const shown = compact ? rows.filter((_, i) => idx.some((h) => Math.abs(h - i) <= 2)) : rows;
  const dash = (n: number | null) => (n == null ? '–' : n);
  return (
    <div class="glass-panel">
      <table class="st">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Équipe</th>
            <th scope="col" title="Joués">J</th>
            <th scope="col" title="Victoires">G</th>
            <th scope="col" title="Nuls">N</th>
            <th scope="col" title="Défaites">P</th>
            <th scope="col" title="Différence">Diff</th>
            <th scope="col" title="Points">Pts</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.team.id} class={highlight.includes(r.team.id) ? 'hl' : ''}>
              <td>{r.rank}</td>
              <td>
                <span class="st-team">
                  <Crest team={r.team} size={20} />
                  <span>{r.team.name}</span>
                </span>
              </td>
              <td>{dash(r.played)}</td>
              <td>{dash(r.won)}</td>
              <td>{dash(r.drawn)}</td>
              <td>{dash(r.lost)}</td>
              <td>{r.diff || '–'}</td>
              <td class="pts">{dash(r.points)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 12 && (
        <button class="link-btn" onClick={() => setAll(!all)}>
          {all ? 'Réduire' : 'Voir le classement complet'}
        </button>
      )}
    </div>
  );
}

/** Feuille de détail d'un match : score, mi-temps, buts et cartons, classement. */
export function MatchDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const m = useMatch(id);
  const comp = m ? competitionById(m.competitionId) : undefined;
  const ids = useMemo(() => (m ? [m.home.id, m.away.id] : []), [m?.home.id, m?.away.id]);
  const standings = useStandings(comp, ids);

  // Fermeture à Échap ; on fige le défilement de la page derrière la feuille.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.documentElement.style.overflow = prev;
    };
  }, []);

  if (!m || !comp) return null;
  const live = m.status === 'live';
  const done = m.status === 'finished';
  const hasScore = m.homeScore != null && m.awayScore != null;
  const ht = halfTimeScore(m, comp.sport);
  const hasEvents = (m.events?.length ?? 0) > 0;

  return (
    <div class="sheet" role="dialog" aria-modal="true" aria-label={`${m.home.name} contre ${m.away.name}`}>
      <div class="sheet-head">
        <h2 class="muted" style={{ fontSize: '15px', fontWeight: 700 }}>
          {comp.name}
        </h2>
        <button class="pill-btn glass" onClick={onClose}>
          Fermer
        </button>
      </div>
      <div class="sheet-body">
        <div class="detail-hero">
          <div class="detail-teams">
            <div class="detail-team">
              <Crest team={m.home} size={64} />
              <span>{m.home.name}</span>
            </div>
            <div class="detail-mid">
              {hasScore ? (
                <div class="detail-score tnum">
                  {m.homeScore} – {m.awayScore}
                </div>
              ) : (
                <div class="detail-time tnum">{formatTime(m.kickoff)}</div>
              )}
              <div class={`detail-status${live ? ' is-live' : ''}`}>
                {live && <span class="live-dot" />}
                {live ? m.clock : done ? 'Terminé' : m.status === 'postponed' ? 'Reporté' : formatShortDate(m.kickoff)}
              </div>
              {ht && (
                <div class="ht-line tnum">
                  Mi-temps {ht.home} – {ht.away}
                </div>
              )}
            </div>
            <div class="detail-team">
              <Crest team={m.away} size={64} />
              <span>{m.away.name}</span>
            </div>
          </div>
        </div>

        <Section title={comp.sport === 'rugby' ? 'Essais, points et cartons' : 'Buts et cartons'}>
          {/* Section attend des <li> : on utilise un <li> unique */}
          <li style={{ listStyle: 'none' }}>
            {hasEvents ? <Timeline m={m} /> : <div class="glass-panel note">{m.status === 'scheduled' ? "Le match n'a pas encore commencé." : m.status === 'postponed' ? 'Match reporté.' : 'Aucun fait de match enregistré pour le moment.'}</div>}
          </li>
        </Section>

        {standings === undefined && (
          <Section title="Classement">
            <li class="card" style={{ padding: 16, listStyle: 'none' }} aria-busy="true">
              <div class="skeleton skeleton-line" />
              <div class="skeleton skeleton-line short" />
            </li>
          </Section>
        )}
        {standings && (
          <Section title={`Classement · ${standings.title}`}>
            <li style={{ listStyle: 'none' }}>
              <Standings table={standings} highlight={ids} />
            </li>
          </Section>
        )}
      </div>
    </div>
  );
}
