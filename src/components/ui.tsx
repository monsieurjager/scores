import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { Match, Team } from '../types';
import { competitionById } from '../config/competitions';
import { formatShortDate, formatTime } from '../lib/date';
import { IconBall, IconWarn } from './icons';

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  const i = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div class="segmented glass" role="tablist" aria-label={label} style={{ '--n': options.length, '--i': i }}>
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

function Crest({ team, size }: { team: Team; size: number }) {
  const [broken, setBroken] = useState(false);
  const style = { '--s': `${size}px` };
  if (!team.logo || broken) {
    return (
      <span class="crest crest-fallback" style={style}>
        {team.short.slice(0, 3)}
      </span>
    );
  }
  return <img class="crest" style={style} src={team.logo} width={size} height={size} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />;
}

const scoreOf = (m: Match) => (m.homeScore != null && m.awayScore != null ? ([m.homeScore, m.awayScore] as const) : null);

/** Carte « grande » pour un match en direct, avec une lueur à la couleur de l'équipe à domicile. */
export function LiveCard({ m }: { m: Match }) {
  const comp = competitionById(m.competitionId);
  const s = scoreOf(m);
  return (
    <li class="card card-live" style={{ '--glow': m.home.color ? `#${m.home.color}` : 'transparent' }}>
      <div class="card-head">
        <span class="clock tnum">
          <span class="live-dot" />
          {m.clock}
        </span>
        <span class="muted">{comp?.name}</span>
      </div>
      <div class="lines">
        <div class="team big">
          <Crest team={m.home} size={36} />
          <span class="team-name">{m.home.name}</span>
          <span class="score tnum">{s?.[0]}</span>
        </div>
        <div class="team big">
          <Crest team={m.away} size={36} />
          <span class="team-name">{m.away.name}</span>
          <span class="score tnum">{s?.[1]}</span>
        </div>
      </div>
    </li>
  );
}

/** Carte compacte : à venir (heure à droite) ou terminé (scores à droite). */
export function CompactCard({ m, withDate = false }: { m: Match; withDate?: boolean }) {
  const comp = competitionById(m.competitionId);
  const s = scoreOf(m);
  const done = m.status === 'finished';
  const homeWon = done && s != null && s[0] > s[1];
  const awayWon = done && s != null && s[1] > s[0];
  return (
    <li class="card card-compact">
      <div class="lines">
        <div class={`team${awayWon ? ' dim' : ''}`}>
          <Crest team={m.home} size={28} />
          <span class="team-name">{m.home.name}</span>
          {done && s && <span class={`score small tnum${awayWon ? ' dim' : ''}`}>{s[0]}</span>}
        </div>
        <div class={`team${homeWon ? ' dim' : ''}`}>
          <Crest team={m.away} size={28} />
          <span class="team-name">{m.away.name}</span>
          {done && s && <span class={`score small tnum${homeWon ? ' dim' : ''}`}>{s[1]}</span>}
        </div>
      </div>
      <div class="meta">
        {done ? (
          <span class="meta-main">Terminé</span>
        ) : m.status === 'postponed' ? (
          <span class="meta-main">Reporté</span>
        ) : withDate ? (
          <span class="meta-main date">{formatShortDate(m.kickoff)}</span>
        ) : (
          <span class="meta-main tnum">{formatTime(m.kickoff)}</span>
        )}
        <span class="muted">{withDate ? `${formatTime(m.kickoff)} · ${comp?.short ?? ''}` : comp?.name}</span>
      </div>
    </li>
  );
}

export function Section({ title, live = false, children }: { title: string; live?: boolean; children: ComponentChildren }) {
  return (
    <section class="section">
      <h2 class={`section-title${live ? ' is-live' : ''}`}>
        {live && <span class="live-dot" />}
        {title}
      </h2>
      <ul class="cards">{children}</ul>
    </section>
  );
}

export function Skeletons() {
  return (
    <div aria-busy="true" aria-label="Chargement">
      <section class="section">
        <div class="skeleton skeleton-title" />
        <ul class="cards">
          {[0, 1].map((i) => (
            <li class="card card-live" key={i}>
              <div class="skeleton skeleton-line tiny" />
              <div class="skeleton skeleton-line" />
              <div class="skeleton skeleton-line short" />
            </li>
          ))}
        </ul>
      </section>
      <section class="section">
        <div class="skeleton skeleton-title" />
        <ul class="cards">
          {[0, 1].map((i) => (
            <li class="card card-compact" key={i}>
              <div class="lines">
                <div class="skeleton skeleton-line" />
                <div class="skeleton skeleton-line short" />
              </div>
              <div class="skeleton skeleton-time" />
            </li>
          ))}
        </ul>
      </section>
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
