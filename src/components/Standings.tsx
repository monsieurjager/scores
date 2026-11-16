import { useState } from 'preact/hooks';
import type { StandingsTable } from '../types';
import { Crest } from './ui';

/** Zones présentes dans le tableau, dans l'ordre du classement. */
const zones = (rows: StandingsTable['rows']) => {
  const seen = new Map<string, string>();
  for (const r of rows) if (r.zone && !seen.has(r.zone.label)) seen.set(r.zone.label, r.zone.color);
  return [...seen].map(([label, color]) => ({ label, color }));
};

export function Standings({ table, highlight = [], full = false }: { table: StandingsTable; highlight?: string[]; full?: boolean }) {
  const [all, setAll] = useState(false);
  const rows = table.rows;
  const idx = rows.map((r, i) => (highlight.includes(r.team.id) ? i : -1)).filter((i) => i >= 0);
  // Équipes introuvables dans le tableau : on montre le haut du classement plutôt qu'un tableau vide.
  const compact = !full && rows.length > 12 && !all;
  const window = idx.length > 0 ? (i: number) => idx.some((h) => Math.abs(h - i) <= 2) : (i: number) => i < 8;
  const shown = compact ? rows.filter((_, i) => window(i)) : rows;
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
              <td>
                <span class="st-rank">
                  <span class="st-zone" style={{ background: r.zone?.color ?? 'transparent' }} title={r.zone?.label} />
                  {r.rank}
                </span>
              </td>
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
      {(full || all || rows.length <= 12) && zones(rows).length > 0 && (
        <div class="st-legend">
          {zones(rows).map((z) => (
            <span key={z.label}>
              <i style={{ background: z.color }} />
              {z.label}
            </span>
          ))}
        </div>
      )}
      {!full && rows.length > 12 && (
        <button class="link-btn" onClick={() => setAll(!all)}>
          {all ? 'Réduire' : 'Voir le classement complet'}
        </button>
      )}
    </div>
  );
}

