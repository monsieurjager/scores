import type { ComponentChildren } from 'preact';
import type { Match, Team } from '../types';
import { competitionById } from '../config/competitions';
import { formatTime } from '../lib/date';
import { IconBall, IconWarn } from './icons';

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  const i = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div class="segmented" role="tablist" aria-label={label} style={{ '--n': options.length, '--i': i }}>
      <span class="segmented-thumb" />
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={o.id === value} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div class="chips" role="tablist">
      {options.map((o) => (
        <button key={o.id} class="chip" role="tab" aria-selected={o.id === value} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Crest({ team }: { team: Team }) {
  return team.logo ? <img class="crest" src={team.logo} alt="" loading="lazy" /> : <span class="crest crest-fallback">{team.short.slice(0, 3)}</span>;
}

export function MatchRow({ m }: { m: Match }) {
  const comp = competitionById(m.competitionId);
  const live = m.status === 'live';
  const done = m.status === 'finished';
  const hasScore = m.homeScore != null && m.awayScore != null;
  const homeWon = done && hasScore && m.homeScore! > m.awayScore!;
  const awayWon = done && hasScore && m.awayScore! > m.homeScore!;
  return (
    <li class="row">
      <div class={`row-when${live ? ' is-live' : ''}`}>
        {live ? (
          <>
            <span class="live-dot" />
            <span class="tnum">{m.clock ?? 'LIVE'}</span>
          </>
        ) : done ? (
          <span>Terminé</span>
        ) : m.status === 'postponed' ? (
          <span>Reporté</span>
        ) : (
          <span class="tnum">{formatTime(m.kickoff)}</span>
        )}
      </div>
      <div class="row-teams">
        <div class={`team${awayWon ? ' dim' : ''}`}>
          <Crest team={m.home} />
          <span class="team-name">{m.home.name}</span>
        </div>
        <div class={`team${homeWon ? ' dim' : ''}`}>
          <Crest team={m.away} />
          <span class="team-name">{m.away.name}</span>
        </div>
        {comp && <div class="row-comp">{comp.name}</div>}
      </div>
      <div class="row-score tnum">
        {hasScore && (
          <>
            <span class={awayWon ? 'dim' : ''}>{m.homeScore}</span>
            <span class={homeWon ? 'dim' : ''}>{m.awayScore}</span>
          </>
        )}
      </div>
    </li>
  );
}

export function Section({ title, live = false, children }: { title: string; live?: boolean; children: ComponentChildren }) {
  return (
    <section class="section">
      <h2 class="section-title">
        {live && <span class="live-dot" />}
        {title}
      </h2>
      <ul class="card">{children}</ul>
    </section>
  );
}

export function Skeletons() {
  return (
    <div aria-busy="true" aria-label="Chargement">
      {[3, 2].map((n, s) => (
        <section class="section" key={s}>
          <div class="skeleton skeleton-title" />
          <ul class="card">
            {Array.from({ length: n }).map((_, i) => (
              <li class="row" key={i}>
                <div class="skeleton skeleton-when" />
                <div class="row-teams">
                  <div class="skeleton skeleton-line" />
                  <div class="skeleton skeleton-line short" />
                </div>
                <div class="skeleton skeleton-score" />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function Empty({ title, text, action, onAction, error = false }: { title: string; text: string; action?: string; onAction?: () => void; error?: boolean }) {
  return (
    <div class="empty">
      <div class="empty-icon">{error ? <IconWarn /> : <IconBall />}</div>
      <h2>{title}</h2>
      <p>{text}</p>
      {action && (
        <button class="btn" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}
