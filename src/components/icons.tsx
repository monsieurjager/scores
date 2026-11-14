const p = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': true } as const;

export const IconScores = () => (
  <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5l3.6 2.6-1.4 4.2H9.8L8.4 10.1z" /></svg>
);
export const IconStar = ({ filled = false }: { filled?: boolean }) => (
  <svg {...p} fill={filled ? 'currentColor' : 'none'}><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" /></svg>
);
export const IconSliders = () => (
  <svg {...p}><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>
);
export const IconChevron = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg {...p} width="18" height="18" stroke-width="2.4"><path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} /></svg>
);
export const IconCalendar = () => (
  <svg {...p} width="20" height="20"><rect x="3.5" y="5" width="17" height="15" rx="3.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
);
export const IconBall = () => (
  <svg {...p} width="44" height="44" stroke-width="1.4"><circle cx="12" cy="12" r="9" /><path d="M12 7.5l3.6 2.6-1.4 4.2H9.8L8.4 10.1z" /></svg>
);
export const IconWarn = () => (
  <svg {...p} width="44" height="44" stroke-width="1.4"><path d="M12 3.5l9.5 16.5h-19z" /><path d="M12 10v4.5M12 17.2v.1" /></svg>
);
export const IconSearch = () => (
  <svg {...p} width="18" height="18"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
);
export const IconPlus = () => (
  <svg {...p} width="18" height="18" stroke-width="2.4"><path d="M12 5v14M5 12h14" /></svg>
);
