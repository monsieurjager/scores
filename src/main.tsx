import { render } from 'preact';
import { useState } from 'preact/hooks';
import './styles.css';
import { Today } from './screens/Today';
import { Placeholder } from './screens/Placeholder';
import { IconGear, IconScores, IconStar } from './components/icons';

type Tab = 'today' | 'favoris' | 'reglages';
const TABS: { id: Tab; label: string; icon: (p: { filled?: boolean }) => preact.JSX.Element }[] = [
  { id: 'today', label: 'Scores', icon: IconScores },
  { id: 'favoris', label: 'Favoris', icon: IconStar },
  { id: 'reglages', label: 'Réglages', icon: IconGear },
];

function App() {
  const [tab, setTab] = useState<Tab>('today');
  return (
    <>
      {tab === 'today' && <Today />}
      {tab === 'favoris' && <Placeholder kind="favoris" />}
      {tab === 'reglages' && <Placeholder kind="reglages" />}
      <nav class="tabbar glass" aria-label="Navigation principale">
        {TABS.map((t) => (
          <button key={t.id} class="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => { setTab(t.id); window.scrollTo(0, 0); }}>
            <t.icon />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}

render(<App />, document.getElementById('app')!);
