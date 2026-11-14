import { render } from 'preact';
import { useState } from 'preact/hooks';
import './styles.css';
import { Today } from './screens/Today';
import { Favorites } from './screens/Favorites';
import { Placeholder } from './screens/Placeholder';
import { IconScores, IconSliders, IconStar } from './components/icons';
import { MatchDetail } from './components/MatchDetail';
import { openMatch, useOpenMatchId } from './lib/matchStore';

type Tab = 'today' | 'favoris' | 'reglages';
const TABS: { id: Tab; label: string; icon: (p: { filled?: boolean }) => preact.JSX.Element }[] = [
  { id: 'today', label: 'Scores', icon: IconScores },
  { id: 'favoris', label: 'Favoris', icon: IconStar },
  { id: 'reglages', label: 'Réglages', icon: IconSliders },
];

function App() {
  const [tab, setTab] = useState<Tab>('today');
  const openId = useOpenMatchId();
  return (
    <>
      {tab === 'today' && <Today />}
      {tab === 'favoris' && <Favorites />}
      {tab === 'reglages' && <Placeholder kind="reglages" />}
      {openId && <MatchDetail id={openId} onClose={() => openMatch(null)} />}
      <nav class="tabbar glass" aria-label="Navigation principale">
        {TABS.map((t) => (
          <button key={t.id} class="tab" aria-label={t.label} aria-current={tab === t.id ? 'page' : undefined} onClick={() => { setTab(t.id); window.scrollTo(0, 0); }}>
            <t.icon />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}

render(<App />, document.getElementById('app')!);
