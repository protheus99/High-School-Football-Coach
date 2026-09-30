import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { exportDistrictToJSON, importCustomDistrictJSON } from '../utils/leagueImporter';
import { persistSaveGame, loadSaveGame } from '../services/db';

export const SaveLoadManagerModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { districtTeams, currentWeek, userTeamId, coachingAP, practiceIntensity, activeDilemma, scoutingPool } = useGameStore();
  const [importText, setImportText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSaveToBrowser = async () => {
    await persistSaveGame({
      id: 'current_save',
      saveName: `Week ${currentWeek} - ${districtTeams.find((t) => t.id === userTeamId)?.name}`,
      timestamp: Date.now(),
      currentWeek,
      userTeamId,
      coachingAP,
      practiceIntensity,
      districtTeams,
      activeDilemma,
      scoutingPool,
      history: []
    });
    setFeedback('Game successfully saved to IndexedDB!');
  };

  const handleLoadFromBrowser = async () => {
    const save = await loadSaveGame('current_save');
    if (save) {
      useGameStore.setState({
        currentWeek: save.currentWeek,
        userTeamId: save.userTeamId,
        coachingAP: save.coachingAP,
        practiceIntensity: save.practiceIntensity,
        districtTeams: save.districtTeams,
        activeDilemma: save.activeDilemma,
        scoutingPool: save.scoutingPool
      });
      setFeedback('Save game restored!');
    } else {
      setFeedback('No saved game found.');
    }
  };

  const handleExportJSON = () => {
    const json = exportDistrictToJSON(districtTeams);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HSFHC_District_${Date.now()}.json`;
    a.click();
    setFeedback('District configuration exported to JSON file!');
  };

  const handleImportJSON = () => {
    const res = importCustomDistrictJSON(importText);
    if (res.success && res.teams) {
      useGameStore.setState({ districtTeams: res.teams, userTeamId: res.teams[0].id });
      setFeedback('Custom district successfully imported!');
    } else {
      setFeedback(`Import error: ${res.error}`);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0 }}>Save / Load & League Modding</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>✕</button>
        </div>

        {feedback && (
          <div style={{ background: '#EEF2FF', color: '#4338CA', padding: '8px 12px', borderRadius: '4px', marginBottom: '12px', fontSize: '13px' }}>
            {feedback}
          </div>
        )}

        {/* Local Storage Controls */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button onClick={handleSaveToBrowser} style={actionBtn}>💾 Save to Browser</button>
          <button onClick={handleLoadFromBrowser} style={actionBtn}>📂 Load Save</button>
          <button onClick={handleExportJSON} style={actionBtn}>📤 Export JSON</button>
        </div>

        {/* Custom JSON Importer */}
        <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '6px' }}>
            Import Custom District (JSON):
          </label>
          <textarea
            rows={4}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='Paste custom district JSON schema here...'
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px', fontFamily: 'monospace', fontSize: '12px', borderRadius: '4px', border: '1px solid #CBD5E1' }}
          />
          <button onClick={handleImportJSON} style={{ ...actionBtn, marginTop: '8px', background: '#4F46E5', color: '#fff' }}>
            📥 Load Custom District
          </button>
        </div>
      </div>
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(15, 23, 42, 0.65)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1200
};

const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '8px',
  padding: '20px',
  width: '90%',
  maxWidth: '520px'
};

const actionBtn: React.CSSProperties = {
  flex: 1,
  padding: '8px',
  background: '#F1F5F9',
  border: '1px solid #CBD5E1',
  borderRadius: '4px',
  fontSize: '12px',
  fontWeight: 'bold',
  cursor: 'pointer'
};
