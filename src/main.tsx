import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { NowPlayingPopup } from './components/NowPlayingPopup';
import { CookieBanner } from './components/CookieBanner';
import { initAccount } from './services/account';
import { initDucats } from './services/ducats';
import { musicPlayer } from './utils/musicPlayer';
import './styles/index.css';
import { ReplayTestApp } from './replayTest/ReplayTestApp';
import { ReplayClips } from './replayTest/ReplayClips';
import { ReplayDemo } from './replayTest/ReplayDemo';
import { ReplayPenalties } from './replayTest/ReplayPenalties';
import { ReplayInjuries } from './replayTest/ReplayInjuries';

// The intro tries to start as the game loads; where the browser allows sound only after the player touches the page,
// it starts on the first tap instead (and keeps trying on later taps until a song actually plays)
const unlockMusic = () => {
  musicPlayer.unlock();
  if (musicPlayer.hasStarted()) {
    window.removeEventListener('pointerdown', unlockMusic, true);
    window.removeEventListener('keydown', unlockMusic, true);
  }
};
window.addEventListener('pointerdown', unlockMusic, true);
window.addEventListener('keydown', unlockMusic, true);

// The optional account: who is signed in, how a sign-in just went, and cloud save uploads; then its ducats
initAccount();
initDucats();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* PLAYTEST: /?replaytest goes straight to a live match with the real-play replay */}
    {/* The web-review build (VITE_REPLAYTEST=1) opens the playtest with no query string */}
    {import.meta.env.VITE_REPLAYINJURY || window.location.search.includes('replayinjury') ? <ReplayInjuries /> : import.meta.env.VITE_REPLAYPENALTY || window.location.search.includes('replaypenalty') ? <ReplayPenalties /> : import.meta.env.VITE_REPLAYDEMO || window.location.search.includes('replaydemo') ? <ReplayDemo /> : window.location.search.includes('replayclip') ? <ReplayClips /> : import.meta.env.VITE_REPLAYTEST || window.location.search.includes('replaytest') ? <ReplayTestApp /> : <App />}
    <NowPlayingPopup />
    {!import.meta.env.VITE_REPLAYTEST && !import.meta.env.VITE_REPLAYDEMO && !import.meta.env.VITE_REPLAYPENALTY && !import.meta.env.VITE_REPLAYINJURY && <CookieBanner />}
  </React.StrictMode>
);
