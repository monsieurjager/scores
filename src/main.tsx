import { render } from 'preact';
import { useState } from 'preact/hooks';
import './styles.css';
import { Today } from './screens/Today';
import { Favorites } from './screens/Favorites';
import { IconScores, IconSliders, IconStar } from './components/icons';
import { MatchDetail } from './components/MatchDetail';
import { closeSheets, popSheet, useSheets } from './lib/matchStore';
import { TeamSheet } from './components/TeamSheet';
import { CompetitionSheet } from './components/CompetitionSheet';
import { Settings } from './screens/Settings';
import { applyTheme } from './lib/settings';
import { registerServiceWorker, startUpdateChecks } from './lib/update';

type Tab = 'today' | 'favoris' | 'reglages';
const TABS: { id: Tab; label: string; icon: (p: { filled?: boolean }) => preact.JSX.Element }[] = [
  { id: 'today', label: 'Scores', icon: IconScores },
  { id: 'favoris', label: 'Favoris', icon: IconStar },
  { id: 'reglages', label: 'Réglages', icon: IconSliders },
];

function App() {
  const [tab, setTab] = useState<Tab>('today');
  // Incrémenté pour revenir à l'accueil de Scores (aujourd'hui, filtre « Tout »).
  const [home, setHome] = useState(0);
  const onTab = (id: Tab) => {
    closeSheets();
    if (id === 'today') {
      // Bouton Scores : toujours retour à l'accueil (aujourd'hui, tous les sports)
      try {
        localStorage.setItem('filter.sport', JSON.stringify('all'));
        localStorage.setItem('filter.comp', JSON.stringify('all'));
      } catch {
        /* stockage indisponible */
      }
      setHome((n) => n + 1);
    }
    setTab(id);
    window.scrollTo({ top: 0, behavior: tab === id ? 'smooth' : 'auto' });
  };
  const sheets = useSheets();
  const top = sheets[sheets.length - 1];
  const back = sheets.length > 1;
  return (
    <>
      {tab === 'today' && <Today key={home} />}
      {tab === 'favoris' && <Favorites />}
      {tab === 'reglages' && <Settings />}
      {top?.type === 'match' && <MatchDetail key={`m${sheets.length}`} id={top.id} onClose={popSheet} canGoBack={back} />}
      {top?.type === 'team' && <TeamSheet key={`t${sheets.length}`} sport={top.sport} team={top.team} national={top.national} onBack={popSheet} canGoBack={back} />}
      {top?.type === 'comp' && <CompetitionSheet key={`c${sheets.length}`} id={top.id} onBack={popSheet} canGoBack={back} />}
      <nav class="tabbar glass" aria-label="Navigation principale">
        {TABS.map((t) => (
          <button key={t.id} class="tab" aria-label={t.label} aria-current={tab === t.id ? 'page' : undefined} onClick={() => onTab(t.id)}>
            <t.icon />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}

applyTheme();
registerServiceWorker();
startUpdateChecks();
render(<App />, document.getElementById('app')!);
