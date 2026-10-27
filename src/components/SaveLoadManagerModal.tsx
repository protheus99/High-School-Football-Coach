import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { Sheet } from './ui/Sheet';
import { MusicSettingsPanel } from './MusicSettingsPanel';
import { AccountCard, CookiesCard, SignInSheet } from './AccountPanels';

export const SaveLoadManagerModal: React.FC<{ onClose: () => void; onMainMenu?: () => void }> = ({ onClose, onMainMenu }) => {
  const { saveGame, autosave } = useGameStore();
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
      {/* Back to the title screen, saved first: Continue picks up right here */}
      {onMainMenu && (
        <>
          <button
            className="ui-btn"
            style={{ width: '100%', marginTop: '8px', background: '#1E293B', borderColor: '#1E293B', color: '#fff' }}
            onClick={async () => {
              await autosave().catch(() => undefined);
              onMainMenu();
            }}
          >
            🏠 Main menu
          </button>
          <p className="ui-muted" style={{ margin: '6px 0 0', fontSize: '12px' }}>
            Your game is saved when you leave: Continue picks up right here.
          </p>
        </>
      )}
    </Sheet>
  );
};
