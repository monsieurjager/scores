import { useMemo, useState } from 'preact/hooks';
import type { FormResult, Lineup, Match, MatchEvent, MatchSummary, Odds } from '../types';
import { competitionById } from '../config/competitions';
import { formatShortDate, formatTime } from '../lib/date';
import { halfTimeScore, isStale } from '../lib/matchStats';
import { lastUpdateAt, pushSheet, useMatch } from '../lib/matchStore';
import { useSummary } from '../hooks/useSummary';
import { useStandings } from '../hooks/useStandings';
import { Crest, Section, Segmented } from './ui';
import { Standings } from './Standings';
import { Pitch, PlayerFacts, RatingPill } from './Pitch';
import { Sheet } from './Sheet';
import { IconBall } from './icons';

const RUGBY_LABEL: Record<string, string> = { try: 'Essai', conversion: 'Transformation', penaltygoal: 'Pénalité', dropgoal: 'Drop', penaltytry: 'Essai de pénalité' };
const CARD_LABEL = { yellow: 'Carton jaune', red: 'Carton rouge' } as const;

function eventNote(e: MatchEvent): string {
  switch (e.kind) {
    case 'sub': return e.out ? `Remplace ${e.out}` : 'Remplacement';
    case 'penalty': return 'But sur penalty';
    case 'owngoal': return 'But contre son camp';
    case 'goal': return 'But';
    case 'yellow': case 'red': return CARD_LABEL[e.kind];
    default: return RUGBY_LABEL[e.kind] ?? '';
  }
}

function EventIcon({ e }: { e: MatchEvent }) {
  if (e.kind === 'sub')
    return (
      <span class="tl-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 4v14M3.5 14.5L7 18l3.5-3.5M17 20V6M13.5 9.5L17 6l3.5 3.5" />
        </svg>
      </span>
    );
  if (e.kind === 'yellow' || e.kind === 'red') return <span class={`tl-ico ${e.kind}`} aria-hidden="true" />;
  if (e.points > 0 && (e.kind === 'try' || e.kind === 'conversion' || e.kind === 'penaltygoal' || e.kind === 'dropgoal' || e.kind === 'penaltytry')) return <span class="tl-ico" aria-hidden="true">+{e.points}</span>;
  return (
    <span class="tl-ico goal" aria-hidden="true">
      <IconBall />
    </span>
  );
}

const isScoring = (e: MatchEvent) => e.kind === 'goal' || e.kind === 'penalty' || e.kind === 'owngoal' || e.points > 0;

function Timeline({ m, events, rugby }: { m: Match; events: MatchEvent[]; rugby: boolean }) {
  const [all, setAll] = useState(false);
  const scoring = events.filter(isScoring);
  const shown = all ? events : scoring;
  const others = events.length - scoring.length;
  return (
    <div class="glass-panel">
      {shown.length === 0 && <div class="tl-empty">{rugby ? 'Aucun point marqué' : 'Aucun but'}</div>}
      {shown.map((e) => {
        const home = e.teamId === m.home.id;
        const goal = isScoring(e);
        const side = (
          <div class={`tl-side ${home ? 'home' : 'away'}`}>
            <span class="tl-player">{e.player ?? '—'}</span>
            <span class="tl-note">{eventNote(e)}</span>
          </div>
        );
        return (
          <div class={`tl-row${goal ? ' is-goal' : ''}`} key={e.id}>
            {home ? side : <div />}
            <div class="tl-mid">
              <EventIcon e={e} />
              <span class="tnum">{e.clock}</span>
            </div>
            {home ? <div /> : side}
          </div>
        );
      })}
      {others > 0 && (
        <button class="tl-more" onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? (rugby ? 'Points seulement' : 'Buts seulement') : `Tous les faits de jeu (${others} de plus)`}
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style={{ transform: all ? 'rotate(180deg)' : undefined }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** Cotes 1 N 2 et probabilités correspondantes (marge du bookmaker retirée). */
function OddsPanel({ m, odds }: { m: Match; odds: Odds }) {
  const items = [
    { k: '1', team: m.home, v: odds.home, label: m.home.name },
    ...(odds.draw ? [{ k: 'N', team: undefined, v: odds.draw, label: 'Match nul' }] : []),
    { k: '2', team: m.away, v: odds.away, label: m.away.name },
  ];
  const inv = items.reduce((s, i) => s + 1 / i.v, 0);
  const best = Math.min(...items.map((i) => i.v));
  return (
    <div class="glass-panel">
      <div class="odds">
        {items.map((i) => (
          <div class={`odd${i.v === best ? ' fav' : ''}`} key={i.k} aria-label={`${i.label} : cote ${i.v.toLocaleString('fr-FR')}`}>
            <span class="odd-head">{i.team ? <Crest team={i.team} size={18} /> : null}{i.k}</span>
            <span class="odd-val tnum">{i.v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span class="odd-pct tnum">{Math.round((1 / i.v / inv) * 100)} %</span>
          </div>
        ))}
      </div>
      {odds.provider && <p class="odds-src">Cotes {odds.provider}, via ESPN</p>}
    </div>
  );
}

function Stats({ summary }: { summary: MatchSummary }) {
  return (
    <div class="glass-panel stats">
      {summary.stats.map((st) => {
        const total = st.home + st.away || 1;
        const hp = (st.home / total) * 100;
        const unit = st.unit ?? '';
        return (
          <div class="stat" key={st.key}>
            <div class="stat-line">
              <span class={`tnum${st.home > st.away ? ' lead' : ''}`}>{st.home}{unit}</span>
              <span class="stat-label">{st.label}</span>
              <span class={`tnum${st.away > st.home ? ' lead' : ''}`}>{st.away}{unit}</span>
            </div>
            <div class="stat-bar" aria-hidden="true">
              <span style={{ width: `${hp}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Lineups({ m, lineups, sport }: { m: Match; lineups: { home: Lineup; away: Lineup }; sport: 'football' | 'rugby' }) {
  const [side, setSide] = useState<'home' | 'away'>('home');
  const rated = [...lineups.home.starters, ...lineups.home.bench, ...lineups.away.starters, ...lineups.away.bench].filter((p) => p.rating != null);
  const best = rated.length ? rated.reduce((a, b) => (b.rating! > a.rating! ? b : a)).id : undefined;
  if (sport === 'rugby')
    return (
      <div>
        <Segmented<'home' | 'away'> label="Équipe" value={side} onChange={setSide} options={[{ id: 'home', label: m.home.name }, { id: 'away', label: m.away.name }]} />
        <Pitch m={m} sport={sport} lineups={lineups} side={side} best={best} />
      </div>
    );
  // Football : les titulaires sur le terrain, puis les remplaçants (entrés en jeu d'abord)
  const bench = [...lineups[side].bench].sort((a, b) => Number(b.subbedIn) - Number(a.subbedIn));
  return (
    <div>
      <Pitch m={m} sport={sport} lineups={lineups} side={side} best={best} />
      {rated.length > 0 && <p class="odds-src" style={{ margin: '-4px 0 12px' }}>Notes estimées par Scores à partir des statistiques ESPN.</p>}
      {(lineups.home.bench.length > 0 || lineups.away.bench.length > 0) && (
        <>
          <Segmented<'home' | 'away'> label="Remplaçants" value={side} onChange={setSide} options={[{ id: 'home', label: m.home.name }, { id: 'away', label: m.away.name }]} />
          <div class="glass-panel" style={{ marginTop: 12 }}>
            <div class="lu-head">
              <span>Remplaçants</span>
            </div>
            <ul class="lu-list">
              {bench.map((p) => (
                <li class={`lu-row${p.subbedIn ? '' : ' unused'}`} key={p.id}>
                  <span class="lu-num tnum">{p.number}</span>
                  <span class="lu-name">
                    {p.name}
                    <PlayerFacts p={p} />
                  </span>
                  <span class="lu-meta">
                    {p.subbedIn && <span class="lu-in">Entré</span>}
                    {p.rating != null && <RatingPill r={p.rating} best={p.id === best} />}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

/** Rugby : essais de chaque joueur, relevés dans les faits de match (ESPN ne donne pas de stats individuelles). */
function withTries(l: { home: Lineup; away: Lineup }, events: MatchEvent[]) {
  const count = (name: string) => events.filter((e) => (e.kind === 'try' || e.kind === 'penaltytry') && e.player === name).length;
  const add = (x: Lineup): Lineup => ({ ...x, starters: x.starters.map((p) => ({ ...p, tries: count(p.name) || undefined })), bench: x.bench.map((p) => ({ ...p, tries: count(p.name) || undefined })) });
  return { home: add(l.home), away: add(l.away) };
}

/** Feuille de détail d'un match : score, mi-temps, buts et cartons, classement. */
const RESULT_LABEL = { W: 'V', D: 'N', L: 'D' } as const;
const RESULT_TEXT = { W: 'Victoire', D: 'Nul', L: 'Défaite' } as const;

/** 5 derniers résultats, du plus ancien (à gauche) au plus récent (à droite). */
export function FormPills({ results }: { results: FormResult[] }) {
  const ordered = [...results].sort((a, b) => a.date.localeCompare(b.date)).slice(-5);
  return (
    <span class="form-pills">
      {ordered.map((r, i) => (
        <span key={i} class={`form-pill ${r.result}`} title={`${RESULT_TEXT[r.result]} ${r.score} contre ${r.opponent}`} aria-label={`${RESULT_TEXT[r.result]} ${r.score} contre ${r.opponent}`}>
          {RESULT_LABEL[r.result]}
        </span>
      ))}
    </span>
  );
}

/** Feuille de détail d'un match : score, mi-temps, faits de match, stats, compositions, forme, confrontations, classement. */
export function MatchDetail({ id, onClose, canGoBack = false }: { id: string; onClose: () => void; canGoBack?: boolean }) {
  const m = useMatch(id);
  const comp = m ? competitionById(m.competitionId) : undefined;
  const ids = useMemo(() => (m ? [m.home.id, m.away.id] : []), [m?.home.id, m?.away.id]);
  const standings = useStandings(comp, ids);
  // Rafraîchi en direct, et dans les 90 min avant le coup d'envoi (les compositions tombent ~1 h avant).
  const soon = m?.status === 'scheduled' && new Date(m.kickoff).getTime() - Date.now() < 90 * 60_000 && new Date(m.kickoff).getTime() > Date.now() - 30 * 60_000;
  const summary = useSummary(comp, id, m?.status === 'live' || !!soon);

  if (!m || !comp) return null;
  const live = m.status === 'live';
  const done = m.status === 'finished';
  const hasScore = m.homeScore != null && m.awayScore != null;
  const stale = isStale(m);
  const ht = halfTimeScore(m, comp.sport);
  const events = [...(m.events ?? []), ...(summary?.subs ?? [])].sort((a, b) => a.seconds - b.seconds);
  const hasEvents = events.length > 0;
  const updatedAt = new Date(lastUpdateAt()).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const national = !!comp.onlyTeams;
  const lineups = summary?.lineups && comp.sport === 'rugby' ? withTries(summary.lineups, events) : summary?.lineups;
  const openTeam = (side: 'home' | 'away') => pushSheet({ type: 'team', sport: comp.sport, team: m[side], national });

  return (
    <Sheet title={comp.name} onTitle={() => pushSheet({ type: 'comp', id: comp.id })} label={`${m.home.name} contre ${m.away.name}`} canGoBack={canGoBack} onBack={onClose}>
      <div class="detail-hero">
        <div class="detail-teams">
          <button class="detail-team" onClick={() => openTeam('home')} aria-label={`Fiche de ${m.home.name}`}>
            <Crest team={m.home} size={64} />
            <span>{m.home.name}</span>
          </button>
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
              {live ? m.clock : done ? 'Terminé' : m.status === 'postponed' ? 'Reporté' : stale ? 'Score non communiqué' : formatShortDate(m.kickoff)}
            </div>
            {ht && (
              <div class="ht-line tnum">
                Mi-temps {ht.home} – {ht.away}
              </div>
            )}
            {live && lastUpdateAt() > 0 && <div class="ht-line tnum">Actualisé à {updatedAt}</div>}
          </div>
          <button class="detail-team" onClick={() => openTeam('away')} aria-label={`Fiche de ${m.away.name}`}>
            <Crest team={m.away} size={64} />
            <span>{m.away.name}</span>
          </button>
        </div>
      </div>

      {summary?.venue && (
        <p class="venue">
          {summary.venue}
          {summary.attendance ? ` · ${summary.attendance.toLocaleString('fr-FR')} spectateurs` : ''}
        </p>
      )}

      {summary?.odds && m.status === 'scheduled' && (
        <Section title="Cotes">
          <li style={{ listStyle: 'none' }}>
            <OddsPanel m={m} odds={summary.odds} />
          </li>
        </Section>
      )}

      <Section title={comp.sport === 'rugby' ? 'Points' : 'Buts'}>
        <li style={{ listStyle: 'none' }}>
          {hasEvents ? <Timeline m={m} events={events} rugby={comp.sport === 'rugby'} /> : <div class="glass-panel note">{stale ? "La source n'a pas transmis le résultat de ce match." : m.status === 'scheduled' ? "Le match n'a pas encore commencé." : m.status === 'postponed' ? 'Match reporté.' : 'Aucun fait de match enregistré pour le moment.'}</div>}
        </li>
      </Section>

      {summary && summary.stats.length > 0 && (
        <Section title="Statistiques">
          <li style={{ listStyle: 'none' }}>
            <Stats summary={summary} />
          </li>
        </Section>
      )}

      {summary?.form && (
        <Section title="Forme récente">
          <li style={{ listStyle: 'none' }}>
            <div class="glass-panel">
              {(['home', 'away'] as const).map((side) => (
                <div class="form-row" key={side}>
                  <span class="form-team">
                    <Crest team={m[side]} size={22} />
                    <span>{m[side].name}</span>
                  </span>
                  <FormPills results={summary.form![side]} />
                </div>
              ))}
            </div>
          </li>
        </Section>
      )}

      {summary && summary.h2h.length > 0 && (
        <Section title="Confrontations directes">
          <li style={{ listStyle: 'none' }}>
            <div class="glass-panel">
              {summary.h2h.map((h, i) => (
                <div class="h2h-row" key={i}>
                  <span class="muted small tnum">{h.date ? formatShortDate(h.date) : ''}</span>
                  <span class="h2h-match">
                    <span class="h2h-team">{h.home}</span>
                    <span class="h2h-score tnum">
                      {h.homeScore}–{h.awayScore}
                    </span>
                    <span class="h2h-team away">{h.away}</span>
                  </span>
                </div>
              ))}
            </div>
          </li>
        </Section>
      )}

      {summary?.odds && m.status !== 'scheduled' && (
        <Section title="Cotes d'avant-match">
          <li style={{ listStyle: 'none' }}>
            <OddsPanel m={m} odds={summary.odds} />
          </li>
        </Section>
      )}

      {!summary?.lineups && m.status === 'scheduled' && summary !== undefined && (
        <p class="note">Les compositions apparaîtront ici dès leur publication, en général une heure avant le coup d'envoi.</p>
      )}
      {lineups && (
        <Section title="Compositions">
          <li style={{ listStyle: 'none' }}>
            <Lineups m={m} lineups={lineups} sport={comp.sport} />
          </li>
        </Section>
      )}

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
    </Sheet>
  );
}
