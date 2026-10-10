import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { NowPlayingPopup } from './components/NowPlayingPopup';
import { musicPlayer } from './utils/musicPlayer';
import './styles/index.css';

// Browsers allow sound only after the player touches the page: the soundtrack starts on the first tap (and keeps
// trying on later taps until a song actually plays)
const unlockMusic = () => {
  musicPlayer.unlock();
  if (musicPlayer.hasStarted()) {
    window.removeEventListener('pointerdown', unlockMusic, true);
    window.removeEventListener('keydown', unlockMusic, true);
  }
};
window.addEventListener('pointerdown', unlockMusic, true);
window.addEventListener('keydown', unlockMusic, true);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <NowPlayingPopup />
  </React.StrictMode>
);
