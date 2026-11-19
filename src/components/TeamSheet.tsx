import { useMemo, useState } from 'preact/hooks';
import type { Match, RosterPlayer, SportId, Team } from '../types';
import { competitionById } from '../config/competitions';
import { provider } from '../providers';
import { publishMatches, pushSheet } from '../lib/matchStore';
import { favKey, toFav, useFavorites } from '../lib/favorites';
import { isStale } from '../lib/matchStats';
import { formatShortDate, formatTime } from '../lib/date';
import { useAsync } from '../hooks/useAsync';
import { useStandings } from '../hooks/useStandings';
import { Sheet } from './Sheet';
import { CompLogo, Crest, HeroLive, MatchRow, Section } from './ui';
import { Standings } from './Standings';
import { IconStar } from './icons';

type Tab = 'apercu' | 'matchs' | 'classement' | 'effectif';
const EUROPE = new Set(['c1', 'c3', 'c4', 'rcc', 'rchc']);
const RESULT = { W: { l: 'V', c: 'win' }, D: { l: 'N', c: 'draw' }, L: { l: 'D', c: 'loss' } } as const;
const ROLE_TITLE: Record<RosterPlayer['role'], string> = { gk: 'Gardiens', def: 'Défenseurs', mid: 'Milieux', att: 'Attaquants' };

const tint = (c?: string) => (c && /^[0-9a-f]{6}$/i.test(c) ? `#${c}` : '#2a2f3a');

/** Compétition principale de l'équipe : son championnat (ou, pour une sélection, la compétition la plus jouée). */
function mainCompetition(matches: Match[]): string | undefined {
  const count = new Map<string, number>();
  for (const m of matches) if (m.competitionId !== 'amical') count.set(m.competitionId, (count.get(m.competitionId) ?? 0) + (EUROPE.has(m.competitionId) ? 0.5 : 1));
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function resultOf(m: Match, teamId: string) {
  if (m.status !== 'finished' || m.homeScore == null || m.awayScore == null) return null;
  const home = m.home.id === teamId;
  const us = home ? m.homeScore : m.awayScore;
  const them = home ? m.awayScore : m.homeScore;
  return { r: us > them ? 'W' : us < them ? 'L' : 'D', score: `${us}–${them}`, opp: home ? m.away : m.home } as const;
}

/** Fiche d'une équipe : prochain match, forme, classement, buteurs, calendrier, effectif. */
export function TeamSheet({ sport, team, national, canGoBack, onBack }: { sport: SportId; team: Team; national: boolean; canGoBack: boolean; onBack: () => void }) {
  const { keys, toggle } = useFavorites();
  const fav = keys.has(favKey(sport, team.id));
  const [tab, setTab] = useState<Tab>('apercu');
  const matches = useAsync(
    (signal) =>
      provider.getTeamMatches(sport, team.id, national, signal).then((ms) => {
        publishMatches(ms);
        return ms;
      }),
    [sport, team.id, national],
  );
  const mainId = useMemo(() => (matches ? mainCompetition(matches) : undefined), [matches]);
  const main = mainId ? competitionById(mainId) : undefined;
  const ids = useMemo(() => [team.id], [team.id]);
  const table = useStandings(main, ids);
  const leaders = useAsync((signal) => (main ? provider.getLeaders(main, signal).catch(() => null) : Promise.resolve(null)), [mainId]);
  const roster = useAsync((signal) => (main && tab === 'effectif' ? provider.getRoster(main, team.id, signal).catch(() => null) : Promise.resolve(undefined)), [mainId, tab === 'effectif']);

  const live = (matches ?? []).filter((m) => m.status === 'live');
  const next = (matches ?? []).filter((m) => m.status === 'scheduled' && !isStale(m));
  const past = (matches ?? []).filter((m) => m.status === 'finished').reverse();
  const form = past.slice(0, 5).reverse();
  const row = table?.rows.find((r) => r.team.id === team.id);
  const scorers = (leaders?.goals ?? []).filter((l) => l.team.id === team.id).slice(0, 5);
  const nm = next[0];

  const tabs: { id: Tab; label: string }[] = [
    { id: 'apercu', label: 'Aperçu' },
    { id: 'matchs', label: 'Matchs' },
    ...(table ? [{ id: 'classement' as Tab, label: 'Classement' }] : []),
    ...(sport === 'football' && main ? [{ id: 'effectif' as Tab, label: 'Effectif' }] : []),
  ];

  return (
    <Sheet title={sport === 'rugby' ? 'Rugby' : 'Football'} label={team.name} canGoBack={canGoBack} onBack={onBack}>
      <div class="team-hero2" style={{ '--c1': tint(team.color) }}>
        <Crest team={team} size={88} />
        <h1>{team.name}</h1>
        <p>
          {main?.name}
          {row ? ` · ${row.rank}${row.rank === 1 ? 'er' : 'e'} · ${row.points ?? '–'} pts` : ''}
        </p>
        <button class={`follow${fav ? ' on' : ''}`} aria-pressed={fav} onClick={() => toggle(toFav(sport, team))}>
          <IconStar filled={fav} /> {fav ? 'Suivie' : 'Suivre'}
        </button>
      </div>

      <div class="mtabs" role="tablist" aria-label="Sections de l'équipe">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {matches === undefined && (
        <Section title="Chargement">
          <li class="card" style={{ padding: 16, listStyle: 'none' }} aria-busy="true">
            <div class="skeleton skeleton-line" />
            <div class="skeleton skeleton-line short" />
          </li>
        </Section>
      )}
      {matches === null && <p class="note">Impossible de charger le calendrier de cette équipe.</p>}
      {matches && matches.length === 0 && <p class="note">Aucun match trouvé dans les compétitions suivies.</p>}

      {tab === 'apercu' && matches && (
        <>
          {live.length > 0 && (
            <section class="section">
              <h2 class="section-title is-live">
                <span class="live-dot" />
                En direct
              </h2>
              <ul class="hero-rail">
                {live.map((m) => (
                  <HeroLive key={m.id} m={m} />
                ))}
              </ul>
            </section>
          )}
          {nm && (
            <Section title="Prochain match">
              <li class="next-card" style={{ '--c1': tint(nm.home.color), '--c2': tint(nm.away.color) }} role="button" tabIndex={0} onClick={() => pushSheet({ type: 'match', id: nm.id })}>
                <div class="next-head">
                  <span>
                    <CompLogo id={nm.competitionId} size={16} />
                    {competitionById(nm.competitionId)?.name}
                  </span>
                  <span>{formatShortDate(nm.kickoff)}</span>
                </div>
                <div class="next-teams">
                  <span class="next-team">
                    <Crest team={nm.home} size={46} />
                    {nm.home.name}
                  </span>
                  <span class="next-time tnum">{formatTime(nm.kickoff)}</span>
                  <span class="next-team">
                    <Crest team={nm.away} size={46} />
                    {nm.away.name}
                  </span>
                </div>
              </li>
            </Section>
          )}
          {form.length > 0 && (
            <Section title="Forme">
              <li style={{ listStyle: 'none' }}>
                <div class="form5">
                  {form.map((m) => {
                    const r = resultOf(m, team.id)!;
                    return (
                      <button key={m.id} class="form-tile" onClick={() => pushSheet({ type: 'match', id: m.id })} aria-label={`${r.r === 'W' ? 'Victoire' : r.r === 'L' ? 'Défaite' : 'Nul'} ${r.score} contre ${r.opp.name}`}>
                        <Crest team={r.opp} size={26} />
                        <span class="tnum">{r.score}</span>
                        <b class={RESULT[r.r].c}>{RESULT[r.r].l}</b>
                      </button>
                    );
                  })}
                </div>
              </li>
            </Section>
          )}
          {table && (
            <Section title={`Classement · ${table.title}`}>
              <li style={{ listStyle: 'none' }}>
                <Standings compId={main?.id} sport={sport} table={table} highlight={ids} />
              </li>
            </Section>
          )}
          {scorers.length > 0 && (
            <Section title="Meilleurs buteurs du club">
              <li style={{ listStyle: 'none' }}>
                <div class="glass-panel leaders">
                  {scorers.map((l) => (
                    <div class="leader" key={l.id}>
                      <span class="leader-who">
                        <span class="leader-name">{l.name}</span>
                        <span class="leader-team">{l.matches ? `${l.matches} matchs` : main?.name}</span>
                      </span>
                      <span class="leader-v tnum">{l.value}</span>
                    </div>
                  ))}
                </div>
              </li>
            </Section>
          )}
        </>
      )}

      {tab === 'matchs' && matches && (
        <>
          {next.length > 0 && (
            <section class="cgroup">
              <div class="cgroup-head static">
                <span class="cgroup-name">À venir</span>
              </div>
              <ul class="cgroup-list">
                {next.slice(0, 10).map((m) => (
                  <DatedRow key={m.id} m={m} />
                ))}
              </ul>
            </section>
          )}
          {past.length > 0 && (
            <section class="cgroup">
              <div class="cgroup-head static">
                <span class="cgroup-name">Résultats</span>
              </div>
              <ul class="cgroup-list">
                {past.slice(0, 15).map((m) => (
                  <DatedRow key={m.id} m={m} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {tab === 'classement' && table && (
        <Section title={table.title}>
          <li style={{ listStyle: 'none' }}>
            <Standings compId={main?.id} sport={sport} table={table} highlight={ids} full />
            {main && (
              <button class="tl-more solo" onClick={() => pushSheet({ type: 'comp', id: main.id })}>
                Voir la compétition
              </button>
            )}
          </li>
        </Section>
      )}

      {tab === 'effectif' && (
        <>
          {roster === undefined && <p class="note">Chargement de l'effectif…</p>}
          {roster === null && <p class="note">Effectif non disponible pour cette équipe.</p>}
          {roster &&
            (['gk', 'def', 'mid', 'att'] as const).map((role) => {
              const list = roster.filter((p) => p.role === role).sort((a, b) => Number(a.number ?? 99) - Number(b.number ?? 99));
              if (!list.length) return null;
              return (
                <Section key={role} title={ROLE_TITLE[role]}>
                  <li style={{ listStyle: 'none' }}>
                    <div class="glass-panel squad">
                      {list.map((p) => (
                        <div class="squad-row" key={p.id} role="button" tabIndex={0} onClick={() => pushSheet({ type: 'player', sport, id: p.id, name: p.name, team, number: p.number, position: p.role === 'gk' ? 'G' : p.role === 'def' ? 'D' : p.role === 'mid' ? 'M' : 'F' })}>
                          <span class="squad-n tnum" style={{ background: tint(team.color) }}>
                            {p.number ?? '–'}
                          </span>
                          <span>{p.name}</span>
                        </div>
                      ))}
                    </div>
                  </li>
                </Section>
              );
            })}
        </>
      )}
    </Sheet>
  );
}

/** Ligne de match avec la date (calendrier d'une équipe). */
function DatedRow({ m }: { m: Match }) {
  return (
    <div class="dated">
      <span class="dated-d">
        {formatShortDate(m.kickoff)}
        <CompLogo id={m.competitionId} size={14} />
      </span>
      <MatchRow m={m} />
    </div>
  );
}
