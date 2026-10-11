import React from 'react';
import { useMusicWaitingForTap } from '../utils/musicPlayer';
import { useMusicSettings } from '../utils/musicSettings';

/**
 * The title screen's nudge when the browser blocked sound on load (iPhones always, most first visits): any tap
 * starts the intro, this one included, and the hint goes away.
 */
export const MusicTapHint: React.FC = () => {
  useMusicSettings(); // turning music off in Settings hides it
  const waiting = useMusicWaitingForTap();
  if (!waiting) return null;
  return (
    <div style={{ textAlign: 'center', marginTop: '6px' }}>
      <span className="music-tap-hint" role="status">
        🔊 Tap anywhere for music
      </span>
    </div>
  );
};
