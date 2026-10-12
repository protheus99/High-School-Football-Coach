import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { NowPlayingPopup } from './components/NowPlayingPopup';
import { CookieBanner } from './components/CookieBanner';
import { initAccount } from './services/account';
import { musicPlayer } from './utils/musicPlayer';
import './styles/index.css';

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

// The optional account: who is signed in, how a sign-in just went, and cloud save uploads
initAccount();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <NowPlayingPopup />
    <CookieBanner />
  </React.StrictMode>
);
