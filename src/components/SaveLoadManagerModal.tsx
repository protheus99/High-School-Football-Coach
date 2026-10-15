import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { Sheet } from './ui/Sheet';
import { MusicSettingsPanel } from './MusicSettingsPanel';
import { AccountCard, CookiesCard, SignInSheet } from './AccountPanels';

export const SaveLoadManagerModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { saveGame } = useGameStore();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const handleSaveToBrowser = async () => {
    await saveGame();
    setFeedback('Game saved! Find it on the Load Game screen.');
  };

  return (
    <Sheet title="Settings" subtitle="Account, music and saves" onClose={onClose}>
      {signingIn && <SignInSheet onClose={() => setSigningIn(false)} />}
      <AccountCard onSignIn={() => setSigningIn(true)} />
      <CookiesCard />
      <MusicSettingsPanel />

      {feedback && (
        <div role="status" style={{ background: '#EEF2FF', color: '#4338CA', padding: '10px 12px', borderRadius: '8px', marginBottom: '12px', fontSize: '14px' }}>
          {feedback}
        </div>
      )}

      <div className="ui-label" style={{ borderTop: '1px solid #E2E8F0', paddingTop: '14px', marginBottom: '8px' }}>
        Saves
      </div>
      <button className="ui-btn ui-btn-primary" style={{ width: '100%' }} onClick={handleSaveToBrowser}>
        💾 Save game
      </button>
    </Sheet>
  );
};
