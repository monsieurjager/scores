import { useState } from 'preact/hooks';
import type { Leader } from '../types';
import { competitionById } from '../config/competitions';
import { provider } from '../providers';
import { publishMatches, pushSheet } from '../lib/matchStore';
import { useAsync } from '../hooks/useAsync';
import { Sheet } from './Sheet';
import { CompLogo, Crest, HeroLive, MatchRow, Section } from './ui';
import { Standings } from './Standings';
import { BracketView } from './BracketView';

type Tab = 'table' | 'day' | 'leaders' | 'bracket';

function LeaderList({ list, unit }: { list: Leader[]; unit: string }) {
  return (
    <div class="glass-panel leaders">
      {list.slice(0, 15).map((l, i) => (
        <button class="leader" key={l.id} onClick={() => pushSheet({ type: 'player', sport: 'football', id: l.id, name: l.name, team: l.team })} aria-label={`${l.name}, ${l.team.name}, ${l.value} ${unit}`}>
          <span class="leader-rank tnum">{i + 1}</span>
          <Crest team={l.team} size={24} />
          <span class="leader-who">
            <span class="leader-name">{l.name}</span>
            <span class="leader-team">
              {l.team.name}
              {l.matches ? ` · ${l.matches} matchs` : ''}
            </span>
          </span>
          <span class="leader-v tnum">{l.value}</span>
        </button>
      ))}
    </div>
  );
}

/** Fiche d'une compétition : classement (avec zones), journée en cours, meilleurs buteurs et passeurs. */
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
  const leaders = useAsync((signal) => (comp ? provider.getLeaders(comp, signal).catch(() => null) : Promise.resolve(null)), [id]);
  const bracket = useAsync(
    (signal) =>
      comp
        ? provider.getBracket(comp, signal).then(
            (b) => {
              if (b) publishMatches(b.rounds.flatMap((r) => r.ties.flatMap((t) => t.legs)));
              return b;
            },
            () => null,
          )
        : Promise.resolve(null),
    [id],
  );
  const [tab, setTab] = useState<Tab>('table');
  const [kind, setKind] = useState<'goals' | 'assists'>('goals');
  if (!comp) return null;
  const matchday = [...(data?.matchday ?? [])].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const live = matchday.filter((m) => m.status === 'live');
  const hasTable = !!data && data.tables.length > 0;
  const tabs: { id: Tab; label: string }[] = [
    ...(hasTable ? [{ id: 'table' as Tab, label: 'Classement' }] : []),
    ...(matchday.length ? [{ id: 'day' as Tab, label: 'Journée' }] : []),
    ...(leaders ? [{ id: 'leaders' as Tab, label: 'Buteurs' }] : []),
    ...(bracket ? [{ id: 'bracket' as Tab, label: 'Phase finale' }] : []),
  ];
  const current = tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id;

  return (
    <Sheet title={comp.sport === 'rugby' ? 'Rugby' : 'Football'} label={comp.name} canGoBack={canGoBack} onBack={onBack}>
      <div class="comp-hero">
        <CompLogo id={comp.id} size={64} />
        <div>
          <h1>{comp.name}</h1>
          <p>{comp.sport === 'rugby' ? 'Rugby' : 'Football'}{comp.onlyTeamIds ? ' · clubs français' : comp.onlyTeams ? ' · sélections suivies' : ''}</p>
        </div>
      </div>

      {tabs.length > 1 && (
        <div class="mtabs" role="tablist" aria-label="Sections de la compétition">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={current === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {data === undefined && (
        <Section title="Chargement">
          <li class="card" style={{ padding: 16, listStyle: 'none' }} aria-busy="true">
            <div class="skeleton skeleton-line" />
            <div class="skeleton skeleton-line short" />
          </li>
        </Section>
      )}
      {data === null && <p class="note">Impossible de charger cette compétition.</p>}

      {live.length > 0 && current !== 'leaders' && (
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

      {current === 'table' &&
        data?.tables.map((t) => (
          <Section key={t.title} title={data.tables.length > 1 ? t.title : 'Classement'}>
            <li style={{ listStyle: 'none' }}>
              <Standings compId={comp.id} sport={comp.sport} table={t} full />
            </li>
          </Section>
        ))}

      {current === 'day' && (
        <section class="cgroup">
          <div class="cgroup-head static">
            <CompLogo id={comp.id} />
            <span class="cgroup-name">Journée en cours</span>
          </div>
          <ul class="cgroup-list">
            {matchday.map((m) => (
              <MatchRow key={m.id} m={m} />
            ))}
          </ul>
        </section>
      )}

      {current === 'leaders' && leaders && (
        <Section title={kind === 'goals' ? 'Meilleurs buteurs' : 'Meilleurs passeurs'}>
          <li style={{ listStyle: 'none' }}>
            <div class="seg-mini" role="tablist" aria-label="Classement des joueurs">
              <button role="tab" aria-selected={kind === 'goals'} onClick={() => setKind('goals')}>
                Buts
              </button>
              <button role="tab" aria-selected={kind === 'assists'} onClick={() => setKind('assists')}>
                Passes décisives
              </button>
            </div>
            <LeaderList list={kind === 'goals' ? leaders.goals : leaders.assists} unit={kind === 'goals' ? 'buts' : 'passes décisives'} />
          </li>
        </Section>
      )}

      {current === 'bracket' && bracket && (
        <Section title="Phase finale">
          <li style={{ listStyle: 'none' }}>
            <BracketView b={bracket} />
          </li>
        </Section>
      )}

      {data && tabs.length === 0 && <p class="note">Pas de classement pour cette compétition.</p>}
    </Sheet>
  );
}
