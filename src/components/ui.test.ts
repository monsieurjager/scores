import { describe, expect, it } from 'vitest';
import { sizedLogo } from './ui';

describe('logos allégés', () => {
  it('demande à ESPN une version réduite', () => {
    expect(sizedLogo('https://a.espncdn.com/i/teamlogos/soccer/500/160.png', 28)).toBe('https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/160.png&w=128&h=128');
    expect(sizedLogo('https://a.espncdn.com/i/teamlogos/countries/500/fra.png', 20)).toContain('&w=72&h=72');
  });
  it('laisse intactes les autres adresses', () => {
    expect(sizedLogo('https://exemple.com/logo.png', 28)).toBe('https://exemple.com/logo.png');
  });
});
