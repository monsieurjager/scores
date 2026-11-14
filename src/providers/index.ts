import { espnProvider } from './espn';
import { mockProvider } from './mock';
import type { MatchProvider } from '../types';

// `?mock` : données de démonstration (développement du design). Sinon : ESPN.
export const provider: MatchProvider = new URLSearchParams(location.search).has('mock') ? mockProvider : espnProvider;
