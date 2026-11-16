import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { Match, Team } from '../types';
import { competitionById } from '../config/competitions';
import { formatShortDate, formatTime } from '../lib/date';
import { isStale } from '../lib/matchStats';
import { IconBall, IconWarn } from './icons';
import { openMatch } from '../lib/matchStore';

const openProps = (id: string) => ({
  role: 'button' as const,
  tabIndex: 0,
  onClick: () => openMatch(id),
  onKeyDown: (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openMatch(id)),
});

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

/** Logo ESPN redimensionné côté ESPN (≈ 7 Ko au lieu de 60 Ko), à 3× la taille affichée pour les écrans Retina. */
export function sizedLogo(url: string, size: number): string {
  const m = /^https:\/\/a\.espncdn\.com(\/i\/.+\.png)$/.exec(url);
  if (!m) return url;
  const px = size <= 24 ? 72 : size <= 40 ? 128 : 220;
  return `https://a.espncdn.com/combiner/i?img=${m[1]}&w=${px}&h=${px}`;
}

export function Crest({ team, size }: { team: Team; size: number }) {
  // 0 : logo redimensionné · 1 : logo d'origine · 2 : initiales
  const [attempt, setAttempt] = useState(0);
  const style = { '--s': `${size}px` };
  if (!team.logo || attempt >= 2) {
    return (
      <span class="crest crest-fallback" style={style}>
        {team.short.slice(0, 3)}
      </span>
    );
  }
  const src = attempt === 0 ? sizedLogo(team.logo, size) : team.logo;
  return <img key={src} class="crest" style={style} src={src} width={size} height={size} alt="" loading="lazy" decoding="async" onError={() => setAttempt((n) => n + 1)} />;
}

const scoreOf = (m: Match) => (m.homeScore != null && m.awayScore != null ? ([m.homeScore, m.awayScore] as const) : null);

/** Carte « grande » pour un match en direct, avec une lueur à la couleur de l'équipe à domicile. */
export function LiveCard({ m }: { m: Match }) {
  const comp = competitionById(m.competitionId);
  const s = scoreOf(m);
  return (
    <li class="card card-live" style={{ '--glow': m.home.color ? `#${m.home.color}` : 'transparent' }} aria-label={`${m.home.name} contre ${m.away.name}, détail du match`} {...openProps(m.id)}>
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
    <li class="card card-compact" aria-label={`${m.home.name} contre ${m.away.name}, détail du match`} {...openProps(m.id)}>
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
        ) : isStale(m) ? (
          <span class="meta-main stale">Score n.c.</span>
        ) : withDate ? (
          <span class="meta-main date">{formatShortDate(m.kickoff)}</span>
        ) : (
          <span class="meta-main tnum">{formatTime(m.kickoff)}</span>
        )}
        <span class="muted">{withDate ? `${formatTime(m.kickoff)} · ${comp?.name ?? ''}` : comp?.name}</span>
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

// ---------------------------------------------------------------- Accueil (refonte)

/** Logo de compétition sur une pastille claire (lisible en mode sombre) ; ballon générique sinon. */
export function CompLogo({ id, size = 22 }: { id: string; size?: number }) {
  const comp = competitionById(id);
  const [failed, setFailed] = useState(false);
  return (
    <span class="comp-logo" style={{ '--s': `${size}px` }} aria-hidden="true">
      {comp?.logo && !failed ? <img src={sizedLogo(comp.logo, size)} alt="" onError={() => setFailed(true)} /> : <IconBall />}
    </span>
  );
}

/** Minute affichée → avancement du match (0 à 1). */
export function progressOf(m: Match, sport: 'football' | 'rugby'): number {
  if (m.status === 'finished') return 1;
  if (m.status !== 'live') return 0;
  const total = sport === 'rugby' ? 80 : 90;
  if (/MT|mi-temps|half/i.test(m.clock ?? '')) return 0.5;
  const n = Number(/(\d+)/.exec(m.clock ?? '')?.[1] ?? 0);
  return Math.max(0.02, Math.min(1, n / total));
}

const SCORE_LABEL: Record<string, string> = { goal: 'But', penalty: 'But (pen.)', owngoal: 'CSC', try: 'Essai', conversion: 'Transformation', penaltygoal: 'Pénalité', dropgoal: 'Drop', penaltytry: 'Essai de pénalité' };

/** Dernier fait marquant d'un match : « But · O. Dembélé 64' ». */
export function lastEvent(m: Match): string | null {
  const e = [...(m.events ?? [])].reverse().find((x) => x.points > 0 || x.kind === 'goal' || x.kind === 'penalty' || x.kind === 'owngoal');
  if (!e) return null;
  return `${SCORE_LABEL[e.kind] ?? 'Points'} · ${e.player ?? (e.teamId === m.home.id ? m.home.name : m.away.name)} ${e.clock}`;
}

const hex = (c: string | undefined, alpha = "d9") => (c && /^[0-9a-f]{6}$/i.test(c) ? `#${c}${alpha}` : `rgba(255,255,255,.08)`);

/** Grande carte d'un match en direct (carrousel de l'accueil), aux couleurs des deux équipes. */
export function HeroLive({ m }: { m: Match }) {
  const comp = competitionById(m.competitionId);
  const s = scoreOf(m);
  const p = progressOf(m, comp?.sport ?? 'football');
  const ev = lastEvent(m);
  return (
    <li class="hero-live" style={{ '--c1': hex(m.home.color), '--c2': hex(m.away.color, '99') }} aria-label={`${m.home.name} ${s?.[0] ?? ''} – ${s?.[1] ?? ''} ${m.away.name}, ${m.clock}, détail du match`} {...openProps(m.id)}>
      <div class="hero-head">
        <span class="hero-comp">
          <CompLogo id={m.competitionId} size={16} />
          {comp?.name}
        </span>
        <span class="clock tnum">
          <span class="live-dot" />
          {m.clock}
        </span>
      </div>
      <div class="hero-teams">
        <div class="hero-team">
          <Crest team={m.home} size={48} />
          <span>{m.home.name}</span>
        </div>
        <div class="hero-score tnum">
          {s?.[0]}
          <span>–</span>
          {s?.[1]}
        </div>
        <div class="hero-team">
          <Crest team={m.away} size={48} />
          <span>{m.away.name}</span>
        </div>
      </div>
      <div class="hero-bar" aria-hidden="true">
        <span style={{ width: `${p * 100}%` }} />
      </div>
      {ev && <div class="hero-ev">{ev}</div>}
    </li>
  );
}

/** Ligne de match dans un bloc de compétition : statut à gauche, équipes, scores à droite. */
export function MatchRow({ m }: { m: Match }) {
  const s = scoreOf(m);
  const live = m.status === 'live';
  const done = m.status === 'finished';
  const stale = isStale(m);
  const st = live ? m.clock : done ? 'Fin' : m.status === 'postponed' ? 'Rep.' : stale ? 'n.c.' : formatTime(m.kickoff).replace(' h 00', ' h');
  const hw = done && s && s[0] > s[1];
  const aw = done && s && s[1] > s[0];
  return (
    <li class="mrow" aria-label={`${m.home.name} contre ${m.away.name}, détail du match`} {...openProps(m.id)}>
      <span class={`mrow-st tnum${live ? ' live' : ''}`}>{st}</span>
      <span class="mrow-teams">
        <span class={`mrow-team${aw ? ' dim' : hw ? ' win' : ''}`}>
          <Crest team={m.home} size={20} />
          <span class="team-name">{m.home.name}</span>
        </span>
        <span class={`mrow-team${hw ? ' dim' : aw ? ' win' : ''}`}>
          <Crest team={m.away} size={20} />
          <span class="team-name">{m.away.name}</span>
        </span>
      </span>
      {s && (live || done) ? (
        <span class={`mrow-score tnum${live ? ' live' : ''}`}>
          <span class={aw ? 'dim' : ''}>{s[0]}</span>
          <span class={hw ? 'dim' : ''}>{s[1]}</span>
        </span>
      ) : (
        <span />
      )}
    </li>
  );
}

/** Bloc d'une compétition : en-tête (logo, nom, lien vers le classement) puis ses matchs. */
export function CompGroup({ id, matches, onOpen }: { id: string; matches: Match[]; onOpen: () => void }) {
  const comp = competitionById(id);
  return (
    <section class="cgroup">
      <button class="cgroup-head" onClick={onOpen}>
        <CompLogo id={id} />
        <span class="cgroup-name">{comp?.name ?? id}</span>
        <span class="cgroup-link">{id === 'amical' ? 'Matchs' : 'Classement'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <ul class="cgroup-list">
        {matches.map((m) => (
          <MatchRow key={m.id} m={m} />
        ))}
      </ul>
    </section>
  );
}
