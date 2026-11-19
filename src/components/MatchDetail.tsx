import { useMemo, useState } from 'preact/hooks';
import type { FormResult, Lineup, Match, MatchEvent, MatchSummary, StandingsTable } from '../types';
import { averages, h2hRecord, rugbyBreakdown, streak } from '../lib/prematch';
import { competitionById } from '../config/competitions';
import { formatShortDate, formatTime } from '../lib/date';
import { halfTimeScore, isStale } from '../lib/matchStats';
import { lastUpdateAt, pushSheet, useMatch } from '../lib/matchStore';
import { useSummary } from '../hooks/useSummary';
import { useStandings } from '../hooks/useStandings';
import { Crest, progressOf, Section } from './ui';
import { Standings } from './Standings';
import { Pitch, PlayerFacts, RatingPill } from './Pitch';
import { Sheet } from './Sheet';
import { roleOf } from '../lib/ratings';

const RUGBY_LABEL: Record<string, string> = { try: 'Essai', conversion: 'Transformation', penaltygoal: 'Pénalité', dropgoal: 'Drop', penaltytry: 'Essai de pénalité' };
const CARD_LABEL = { yellow: 'Carton jaune', red: 'Carton rouge' } as const;
type Sport = 'football' | 'rugby';
type Tab = 'resume' | 'compos' | 'stats' | 'classement' | 'h2h';

const isScoring = (e: MatchEvent) => e.kind === 'goal' || e.kind === 'penalty' || e.kind === 'owngoal' || e.points > 0;
const minuteOf = (e: MatchEvent) => (e.seconds > 0 ? e.seconds / 60 : Number(/(\d+)/.exec(e.clock)?.[1] ?? 0));

function eventNote(e: MatchEvent, assist?: string): string {
  switch (e.kind) {
    case 'sub': return e.out ? `Remplace ${e.out}` : 'Remplacement';
    case 'penalty': return 'Penalty';
    case 'owngoal': return 'Contre son camp';
    case 'goal': return assist ? `Passe : ${assist}` : 'But';
    case 'yellow': case 'red': return CARD_LABEL[e.kind];
    default: return RUGBY_LABEL[e.kind] ?? '';
  }
}

const BallSvg = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10.5" fill="#fff" />
    <path d="M12 7.6l3.4 2.5-1.3 4H9.9l-1.3-4z" fill="#07080b" />
  </svg>
);

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
  if (e.kind === 'goal' || e.kind === 'penalty' || e.kind === 'owngoal')
    return (
      <span class={`tl-goal${e.kind === 'owngoal' ? ' og' : ''}`} aria-hidden="true">
        <BallSvg />
      </span>
    );
  return <span class="tl-ico pts" aria-hidden="true">+{e.points}</span>;
}

/** Score après chaque action qui rapporte des points. */
function scoresAfter(m: Match, events: MatchEvent[]): Map<string, string> {
  let h = 0;
  let a = 0;
  const out = new Map<string, string>();
  for (const e of events) {
    if (!isScoring(e)) continue;
    const pts = e.points || 1;
    if (e.teamId === m.home.id) h += pts;
    else a += pts;
    out.set(e.id, `${h}–${a}`);
  }
  return out;
}

/** Faits de match : buts (ou points) d'abord, le reste en dépliant. */
function Timeline({ m, events, sport, assists }: { m: Match; events: MatchEvent[]; sport: Sport; assists: Record<string, string> }) {
  const [all, setAll] = useState(false);
  const scoring = events.filter(isScoring);
  const shown = all ? events : scoring;
  const others = events.length - scoring.length;
  const after = scoresAfter(m, events);
  return (
    <div class="glass-panel">
      {shown.length === 0 && <div class="tl-empty">{sport === 'rugby' ? 'Aucun point marqué' : 'Aucun but'}</div>}
      {shown.map((e) => {
        const home = e.teamId === m.home.id;
        const goal = isScoring(e);
        const side = (
          <div class={`tl-side ${home ? 'home' : 'away'}`}>
            <span class="tl-player">{e.player ?? '—'}</span>
            <span class="tl-note">{eventNote(e, assists[`${e.teamId}|${e.clock}`])}</span>
          </div>
        );
        return (
          <div class={`tl-row${goal ? ' is-goal' : ''}`} key={e.id}>
            {home ? side : <div />}
            <div class="tl-mid">
              <EventIcon e={e} />
              <span class="tnum">
                {e.clock}
                {goal && after.get(e.id) ? ` · ${after.get(e.id)}` : ''}
              </span>
            </div>
            {home ? <div /> : side}
          </div>
        );
      })}
      {others > 0 && (
        <button class="tl-more" onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? (sport === 'rugby' ? 'Points seulement' : 'Buts seulement') : `Tous les faits de jeu (${others} de plus)`}
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style={{ transform: all ? 'rotate(180deg)' : undefined }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** Frise du match : buts et cartons placés à leur minute, au-dessus (domicile) ou en dessous (extérieur). */
function Flow({ m, events, sport }: { m: Match; events: MatchEvent[]; sport: Sport }) {
  const total = sport === 'rugby' ? 80 : 90;
  const marks = events.filter((e) => isScoring(e) || e.kind === 'yellow' || e.kind === 'red');
  const pos = (e: MatchEvent) => `${Math.max(1, Math.min(99, (minuteOf(e) / total) * 100))}%`;
  const done = progressOf(m, sport);
  return (
    <div class="glass-panel flow">
      <div class="flow-legend">
        <span>{m.home.short || m.home.name}</span>
        <span class="tnum">{m.status === 'live' ? `${m.clock} / ${total}'` : m.status === 'finished' ? 'Terminé' : ''}</span>
      </div>
      <div class="flow-track" role="img" aria-label="Frise des buts et des cartons">
        <div class="flow-line" />
        <div class="flow-done" style={{ width: `${done * 100}%` }} />
        <div class="flow-ht" />
        <span class="flow-ht-label">MT</span>
        {marks.map((e) => {
          const home = e.teamId === m.home.id;
          return (
            <span key={e.id} class={`flow-mark ${home ? 'up' : 'down'}`} style={{ left: pos(e) }}>
              {isScoring(e) ? sport === 'rugby' ? <b class="flow-pts">+{e.points}</b> : <BallSvg size={18} /> : <span class={`flow-card ${e.kind}`} />}
            </span>
          );
        })}
      </div>
      <div class="flow-legend">
        <span>{m.away.short || m.away.name}</span>
      </div>
    </div>
  );
}

function StatRows({ summary, stats, keys }: { summary?: MatchSummary; stats?: MatchSummary['stats']; keys?: string[] }) {
  const LOWER = new Set(['foulsCommitted', 'offsides', 'yellow', 'red']);
  const all = stats ?? summary?.stats ?? [];
  const list = keys ? all.filter((s) => keys.includes(s.key)) : all;
  return (
    <div class="glass-panel stat-rows">
      {list.map((st) => {
        const unit = st.unit ?? '';
        const better = (x: number, y: number) => (LOWER.has(st.key) ? x < y : x > y);
        return (
          <div class="srow" key={st.key}>
            <span class={`srow-v tnum${better(st.home, st.away) ? ' lead' : ''}`}>{st.home}{unit}</span>
            <span class="srow-l">{st.label}</span>
            <span class={`srow-v tnum${better(st.away, st.home) ? ' lead' : ''}`}>{st.away}{unit}</span>
          </div>
        );
      })}
    </div>
  );
}

function Possession({ summary }: { summary: MatchSummary }) {
  const p = summary.stats.find((s) => s.key === 'possessionPct');
  if (!p) return null;
  return (
    <div class="glass-panel poss">
      <div class="poss-top">
        <span class="poss-v home tnum">{p.home} %</span>
        <span class="poss-l">Possession</span>
        <span class="poss-v away tnum">{p.away} %</span>
      </div>
      <div class="poss-bar" aria-hidden="true">
        <span class="home" style={{ flex: p.home }} />
        <span class="away" style={{ flex: p.away }} />
      </div>
    </div>
  );
}

function BestPlayers({ m, lineups }: { m: Match; lineups: { home: Lineup; away: Lineup } }) {
  const all = (['home', 'away'] as const).flatMap((side) => [...lineups[side].starters, ...lineups[side].bench].filter((p) => p.rating != null).map((p) => ({ p, team: m[side] })));
  const top = all.sort((a, b) => b.p.rating! - a.p.rating!).slice(0, 3);
  if (top.length === 0) return null;
  const ROLE: Record<string, string> = { gk: 'Gardien', def: 'Défenseur', mid: 'Milieu', att: 'Attaquant' };
  const why = (p: (typeof top)[number]['p']) => [p.goals ? `${p.goals} but${p.goals > 1 ? 's' : ''}` : '', p.assists ? `${p.assists} passe${p.assists > 1 ? 's' : ''} déc.` : ''].filter(Boolean).join(' · ') || ROLE[roleOf(p.position)];
  return (
    <Section title="Meilleurs joueurs">
      <li style={{ listStyle: 'none' }}>
        <div class="best3">
          {top.map(({ p, team }, i) => (
            <div class="best" key={p.id}>
              <Crest team={team} size={26} />
              <span class="best-name">{p.name}</span>
              <RatingPill r={p.rating!} best={i === 0} />
              <span class="best-why">{why(p)}</span>
            </div>
          ))}
        </div>
      </li>
    </Section>
  );
}

function Bench({ m, lineups, best, sport }: { m: Match; lineups: { home: Lineup; away: Lineup }; best?: string; sport: Sport }) {
  return (
    <div class="bench2">
      {(['home', 'away'] as const).map((side) => {
        const rows = [...lineups[side].bench].sort((a, b) => Number(b.subbedIn) - Number(a.subbedIn));
        if (!rows.length) return null;
        return (
          <div class="glass-panel bench" key={side}>
            <div class="bench-head">
              <Crest team={m[side]} size={16} />
              Remplaçants
            </div>
            <ul>
              {rows.map((p) => (
                <li key={p.id} class={p.subbedIn ? '' : 'unused'} role="button" tabIndex={0} onClick={() => pushSheet({ type: 'player', sport, id: p.id, name: p.name, team: m[side], number: p.number, position: p.position })}>
                  <span class="bench-n tnum">{p.number}</span>
                  <span class="bench-name">
                    {p.name}
                    <PlayerFacts p={p} />
                  </span>
                  {p.rating != null && <RatingPill r={p.rating} best={p.id === best} />}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Lineups({ m, lineups, sport }: { m: Match; lineups: { home: Lineup; away: Lineup }; sport: Sport }) {
  const [side, setSide] = useState<'home' | 'away'>('home');
  const rated = [...lineups.home.starters, ...lineups.home.bench, ...lineups.away.starters, ...lineups.away.bench].filter((p) => p.rating != null);
  const best = rated.length ? rated.reduce((a, b) => (b.rating! > a.rating! ? b : a)).id : undefined;
  if (sport === 'rugby')
    return (
      <div>
        <div class="seg-mini" role="tablist" aria-label="Équipe">
          {(['home', 'away'] as const).map((s) => (
            <button key={s} role="tab" aria-selected={side === s} onClick={() => setSide(s)}>
              <Crest team={m[s]} size={18} />
              {m[s].name}
            </button>
          ))}
        </div>
        <Pitch m={m} sport={sport} lineups={lineups} side={side} best={best} />
      </div>
    );
  return (
    <div>
      <Pitch m={m} sport={sport} lineups={lineups} side={side} best={best} />
      <p class="pitch-legend">
        {rated.length > 0 && <span>Note sur 10 · ★ meilleur joueur</span>}
        <span>PD : passe décisive</span>
      </p>
      <Bench m={m} lineups={lineups} best={best} sport={sport} />
      {rated.length > 0 && <p class="pitch-legend">Notes estimées par Scores d'après les statistiques ESPN.</p>}
    </div>
  );
}

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

/** Rugby : essais de chaque joueur, relevés dans les faits de match (ESPN ne donne pas de stats individuelles). */
function withTries(l: { home: Lineup; away: Lineup }, events: MatchEvent[]) {
  const count = (name: string) => events.filter((e) => (e.kind === 'try' || e.kind === 'penaltytry') && e.player === name).length;
  const add = (x: Lineup): Lineup => ({ ...x, starters: x.starters.map((p) => ({ ...p, tries: count(p.name) || undefined })), bench: x.bench.map((p) => ({ ...p, tries: count(p.name) || undefined })) });
  return { home: add(l.home), away: add(l.away) };
}

/** Buteurs (ou marqueurs d'essais) sous le score : « O. Dembélé 23', 64' ». */
function scorers(events: MatchEvent[], teamId: string, sport: Sport): string[] {
  const keep = (e: MatchEvent) => e.teamId === teamId && (sport === 'rugby' ? e.kind === 'try' || e.kind === 'penaltytry' || e.kind === 'dropgoal' : e.kind === 'goal' || e.kind === 'penalty' || e.kind === 'owngoal');
  const by = new Map<string, string[]>();
  for (const e of events.filter(keep)) {
    const who = e.player ?? (e.kind === 'penaltytry' ? 'Essai de pénalité' : '—');
    const tag = e.kind === 'penalty' ? ' (pen.)' : e.kind === 'owngoal' ? ' (csc)' : e.kind === 'dropgoal' ? ' (drop)' : '';
    by.set(who, [...(by.get(who) ?? []), `${e.clock}${tag}`]);
  }
  return [...by].map(([who, mins]) => `${who} ${mins.join(', ')}`);
}

const tint = (c?: string) => (c && /^[0-9a-f]{6}$/i.test(c) ? `#${c}` : '#2a2f3a');

/** Feuille de détail d'un match : en-tête aux couleurs des équipes, puis onglets. */
export function MatchDetail({ id, onClose, canGoBack = false }: { id: string; onClose: () => void; canGoBack?: boolean }) {
  const m = useMatch(id);
  const comp = m ? competitionById(m.competitionId) : undefined;
  const ids = useMemo(() => (m ? [m.home.id, m.away.id] : []), [m?.home.id, m?.away.id]);
  const standings = useStandings(comp, ids);
  // Rafraîchi en direct, et dans les 90 min avant le coup d'envoi (les compositions tombent ~1 h avant).
  const soon = m?.status === 'scheduled' && new Date(m.kickoff).getTime() - Date.now() < 90 * 60_000 && new Date(m.kickoff).getTime() > Date.now() - 30 * 60_000;
  const summary = useSummary(comp, id, m?.status === 'live' || !!soon);
  const [tab, setTab] = useState<Tab>('resume');

  if (!m || !comp) return null;
  const sport = comp.sport;
  const live = m.status === 'live';
  const done = m.status === 'finished';
  const hasScore = m.homeScore != null && m.awayScore != null;
  const stale = isStale(m);
  const ht = halfTimeScore(m, sport);
  const events = [...(m.events ?? []), ...(summary?.subs ?? [])].sort((a, b) => a.seconds - b.seconds);
  const updatedAt = new Date(lastUpdateAt()).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const national = !!comp.onlyTeams;
  const openTeam = (side: 'home' | 'away') => pushSheet({ type: 'team', sport, team: m[side], national });
  const lineups = summary?.lineups && sport === 'rugby' ? withTries(summary.lineups, events) : summary?.lineups;
  const started = live || done;

  const rugbyStats = sport === 'rugby' && started ? rugbyBreakdown(m, events) : [];
  const tabs: { id: Tab; label: string }[] = [
    { id: 'resume', label: 'Résumé' },
    ...(lineups ? [{ id: 'compos' as Tab, label: 'Compos' }] : []),
    ...((summary && summary.stats.length > 0) || rugbyStats.length > 0 ? [{ id: 'stats' as Tab, label: 'Stats' }] : []),
    ...(standings ? [{ id: 'classement' as Tab, label: 'Classement' }] : []),
    ...(summary && (summary.form || summary.h2h.length > 0) ? [{ id: 'h2h' as Tab, label: 'Face-à-face' }] : []),
  ];
  const current = tabs.some((t) => t.id === tab) ? tab : 'resume';
  const hs = scorers(events, m.home.id, sport);
  const as = scorers(events, m.away.id, sport);

  return (
    <Sheet title={comp.name} onTitle={() => pushSheet({ type: 'comp', id: comp.id })} label={`${m.home.name} contre ${m.away.name}`} canGoBack={canGoBack} onBack={onClose}>
      <div class="mhero" style={{ '--c1': tint(m.home.color), '--c2': tint(m.away.color) }}>
        <div class="mhero-teams">
          <button class="mhero-team" onClick={() => openTeam('home')} aria-label={`Fiche de ${m.home.name}`}>
            <Crest team={m.home} size={66} />
            <span>{m.home.name}</span>
          </button>
          <div class="mhero-mid">
            {hasScore ? (
              <div class="mhero-score tnum">
                {m.homeScore}
                <span>–</span>
                {m.awayScore}
              </div>
            ) : (
              <div class="mhero-time tnum">{formatTime(m.kickoff)}</div>
            )}
            {live ? (
              <span class="mhero-live">
                <span class="live-dot" />
                {m.clock}
              </span>
            ) : (
              <span class="mhero-status">{done ? 'Terminé' : m.status === 'postponed' ? 'Reporté' : stale ? 'Score non communiqué' : formatShortDate(m.kickoff)}</span>
            )}
            {ht && (
              <span class="mhero-sub tnum">
                Mi-temps {ht.home}–{ht.away}
              </span>
            )}
          </div>
          <button class="mhero-team" onClick={() => openTeam('away')} aria-label={`Fiche de ${m.away.name}`}>
            <Crest team={m.away} size={66} />
            <span>{m.away.name}</span>
          </button>
        </div>
        {(hs.length > 0 || as.length > 0) && (
          <div class="mhero-scorers">
            <div class="home">
              {hs.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <div>
              {as.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          </div>
        )}
        {live && lastUpdateAt() > 0 && <div class="mhero-upd tnum">Actualisé à {updatedAt}</div>}
      </div>

      {tabs.length > 1 && (
        <div class="mtabs" role="tablist" aria-label="Sections du match">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={current === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {current === 'resume' && (
        <>
          {started && events.some((e) => isScoring(e) || e.kind === 'yellow' || e.kind === 'red') && (
            <Section title="Déroulé">
              <li style={{ listStyle: 'none' }}>
                <Flow m={m} events={events} sport={sport} />
              </li>
            </Section>
          )}
          {(m.status !== 'scheduled' || events.length > 0) && <Section title={sport === 'rugby' ? 'Points' : 'Buts'}>
            <li style={{ listStyle: 'none' }}>
              {events.length > 0 ? (
                <Timeline m={m} events={events} sport={sport} assists={summary?.assists ?? {}} />
              ) : (
                <div class="glass-panel note">{stale ? "La source n'a pas transmis le résultat de ce match." : m.status === 'scheduled' ? "Le match n'a pas encore commencé." : m.status === 'postponed' ? 'Match reporté.' : 'Aucun fait de match enregistré pour le moment.'}</div>
              )}
            </li>
          </Section>}
          {summary && summary.stats.length > 0 && (
            <Section title="En bref">
              <li style={{ listStyle: 'none' }}>
                <StatRows summary={summary} keys={['possessionPct', 'shotsOnTarget', 'wonCorners']} />
                <button class="tl-more solo" onClick={() => setTab('stats')}>
                  Toutes les statistiques
                </button>
              </li>
            </Section>
          )}
          {m.status === 'scheduled' && !lineups && summary !== undefined && <p class="note">Les compositions apparaîtront ici dès leur publication, en général une heure avant le coup d'envoi.</p>}
          {summary && m.status === 'scheduled' && (
            <Section title="Avant-match">
              <li style={{ listStyle: 'none' }}>
                <PreMatch m={m} summary={summary} table={standings ?? undefined} sport={sport} />
              </li>
            </Section>
          )}
          {summary?.form && m.status !== 'scheduled' && (
            <Section title="Forme récente">
              <li style={{ listStyle: 'none' }}>
                <FormBlock m={m} summary={summary} />
              </li>
            </Section>
          )}
          <Section title="Infos">
            <li style={{ listStyle: 'none' }}>
              <div class="glass-panel infos">
                {summary?.venue && (
                  <div class="info-row">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                      <path d="M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6" />
                    </svg>
                    <span>{summary.venue}</span>
                    {summary.attendance ? <span class="muted">{summary.attendance.toLocaleString('fr-FR')} spect.</span> : null}
                  </div>
                )}
                <div class="info-row">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                  <span>Coup d'envoi</span>
                  <span class="muted">
                    {formatShortDate(m.kickoff)} · {formatTime(m.kickoff)}
                  </span>
                </div>
              </div>
            </li>
          </Section>
        </>
      )}

      {current === 'compos' && lineups && (
        <Section title="Compositions">
          <li style={{ listStyle: 'none' }}>
            <Lineups m={m} lineups={lineups} sport={sport} />
          </li>
        </Section>
      )}

      {current === 'stats' && rugbyStats.length > 0 && (
        <Section title="Bilan des points">
          <li style={{ listStyle: 'none' }}>
            <StatRows stats={rugbyStats} />
            <p class="pitch-legend">Calculé d'après les faits de match (ESPN ne fournit pas de statistiques de rugby).</p>
          </li>
        </Section>
      )}
      {current === 'stats' && summary && summary.stats.length > 0 && (
        <>
          <Section title="Statistiques">
            <li style={{ listStyle: 'none' }}>
              <Possession summary={summary} />
              <StatRows summary={summary} keys={summary.stats.map((s) => s.key).filter((k) => k !== 'possessionPct')} />
            </li>
          </Section>
          {lineups && <BestPlayers m={m} lineups={lineups} />}
        </>
      )}

      {current === 'classement' && standings && (
        <Section title={`Classement · ${standings.title}`}>
          <li style={{ listStyle: 'none' }}>
            <Standings compId={comp.id} sport={sport} table={standings} highlight={ids} />
          </li>
        </Section>
      )}

      {current === 'h2h' && summary && (
        <>
          <Section title="Comparaison">
            <li style={{ listStyle: 'none' }}>
              <PreMatch m={m} summary={summary} table={standings ?? undefined} sport={sport} />
            </li>
          </Section>
          {summary.form && (
            <Section title="Forme récente">
              <li style={{ listStyle: 'none' }}>
                <FormBlock m={m} summary={summary} />
              </li>
            </Section>
          )}
          {summary.h2h.length > 0 && (
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
        </>
      )}
    </Sheet>
  );
}

function FormBlock({ m, summary }: { m: Match; summary: MatchSummary }) {
  return (
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
  );
}

/** Avant-match : classement, forme, série en cours, moyennes et bilan des confrontations, face à face. */
function PreMatch({ m, summary, table, sport }: { m: Match; summary: MatchSummary; table?: StandingsTable; sport: Sport }) {
  const unit = sport === 'rugby' ? 'Points' : 'Buts';
  const side = (s: 'home' | 'away') => {
    const form = summary.form?.[s] ?? [];
    const row = table?.rows.find((r) => r.team.id === m[s].id);
    return { form, row, streak: streak(form), avg: averages(form) };
  };
  const h = side('home');
  const a = side('away');
  const rec = h2hRecord(summary.h2h, m.home.name, m.away.name);
  const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  const rows: [string, preact.ComponentChildren, preact.ComponentChildren][] = [];
  if (h.row || a.row) rows.push(['Classement', h.row ? `${h.row.rank}${h.row.rank === 1 ? 'er' : 'e'} · ${h.row.points ?? '–'} pts` : '–', a.row ? `${a.row.rank}${a.row.rank === 1 ? 'er' : 'e'} · ${a.row.points ?? '–'} pts` : '–']);
  if (h.form.length || a.form.length) rows.push(['Forme', <FormPills results={h.form} />, <FormPills results={a.form} />]);
  if (h.avg || a.avg) rows.push([`${unit} marqués (moy.)`, h.avg ? fmt(h.avg.gf) : '–', a.avg ? fmt(a.avg.gf) : '–']);
  if (h.avg || a.avg) rows.push([`${unit} encaissés (moy.)`, h.avg ? fmt(h.avg.ga) : '–', a.avg ? fmt(a.avg.ga) : '–']);
  if (!rows.length && !rec && !h.streak && !a.streak) return <div class="glass-panel note">Pas encore de données d'avant-match.</div>;
  return (
    <div class="glass-panel pre">
      <div class="pre-head">
        <Crest team={m.home} size={28} />
        <span />
        <Crest team={m.away} size={28} />
      </div>
      {rows.map(([label, l, r]) => (
        <div class="pre-row" key={label}>
          <span class="pre-v">{l}</span>
          <span class="pre-l">{label}</span>
          <span class="pre-v right">{r}</span>
        </div>
      ))}
      {(h.streak || a.streak) && (
        <div class="pre-streaks">
          <span>{h.streak ?? ''}</span>
          <span class="right">{a.streak ?? ''}</span>
        </div>
      )}
      {rec && (
        <div class="pre-h2h">
          <span class="pre-l">Derniers face-à-face</span>
          <div class="pre-bar">
            <span class="home" style={{ flex: rec.home || 0.001 }}>{rec.home > 0 ? `${rec.home} V` : ''}</span>
            <span class="draw" style={{ flex: rec.draw || 0.001 }}>{rec.draw > 0 ? `${rec.draw} N` : ''}</span>
            <span class="away" style={{ flex: rec.away || 0.001 }}>{rec.away > 0 ? `${rec.away} V` : ''}</span>
          </div>
        </div>
      )}
    </div>
  );
}
