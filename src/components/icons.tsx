const p = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': true } as const;

export const IconScores = () => (
  <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5l3.6 2.6-1.4 4.2H9.8L8.4 10.1z" /><path d="M12 3v4.5M20.4 9.2l-4.8.9M17.2 19l-3-4.7M6.8 19l3-4.7M3.6 9.2l4.8.9" /></svg>
);
export const IconStar = ({ filled = false }: { filled?: boolean }) => (
  <svg {...p} fill={filled ? 'currentColor' : 'none'}><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" /></svg>
);
export const IconGear = () => (
  <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 13.5a7.7 7.7 0 000-3l2-1.5-2-3.4-2.3 1a7.6 7.6 0 00-2.6-1.5L14 2.5h-4l-.5 2.6A7.6 7.6 0 006.9 6.6l-2.3-1-2 3.4 2 1.5a7.7 7.7 0 000 3l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 002.6 1.5l.5 2.6h4l.5-2.6a7.6 7.6 0 002.6-1.5l2.3 1 2-3.4z" /></svg>
);
export const IconChevron = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
  </svg>
);
export const IconCalendar = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="15" rx="3.5" /><path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);
export const IconBall = () => (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 7.5l3.6 2.6-1.4 4.2H9.8L8.4 10.1z" />
  </svg>
);
export const IconWarn = () => (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 3.5l9.5 16.5h-19z" /><path d="M12 10v4.5M12 17.2v.1" />
  </svg>
);
