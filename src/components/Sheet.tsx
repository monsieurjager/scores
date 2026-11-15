import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { IconChevron } from './icons';

/** Cadre commun des feuilles plein écran : titre, Retour/Fermer, défilement figé derrière. */
export function Sheet({ title, onTitle, label, canGoBack, onBack, children }: { title: string; onTitle?: () => void; label: string; canGoBack: boolean; onBack: () => void; children: ComponentChildren }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onBack();
    window.addEventListener('keydown', onKey);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.documentElement.style.overflow = prev;
    };
  }, [onBack]);
  return (
    <div class="sheet" role="dialog" aria-modal="true" aria-label={label}>
      <div class="sheet-head">
        {onTitle ? (
          <button class="sheet-title link" onClick={onTitle}>
            {title} <IconChevron dir="right" />
          </button>
        ) : (
          <h2 class="sheet-title">{title}</h2>
        )}
        <button class="pill-btn glass" onClick={onBack}>
          {canGoBack ? 'Retour' : 'Fermer'}
        </button>
      </div>
      <div class="sheet-body">{children}</div>
    </div>
  );
}
