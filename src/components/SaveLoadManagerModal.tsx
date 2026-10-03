import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { Sheet } from './ui/Sheet';
import { exportDistrictToJSON, importCustomDistrictJSON } from '../utils/leagueImporter';
import { AUTOSAVE_ID, loadSaveGame } from '../services/db';
import { buildCustomLeague, buildStateLeague, buildStateWorld, GameWorld, nearestDistrictIndexes, StateDistrictFile } from '../sim/league';
import { PLAYABLE_STATES } from '../sim/stateRules';

export const SaveLoadManagerModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { districtTeams, saveGame, loadGame } = useGameStore();
  const [importText, setImportText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [leagueIndex, setLeagueIndex] = useState<LeagueIndexEntry[]>([]);
  const [selectedState, setSelectedState] = useState('');
  const [selectedDistrictFile, setSelectedDistrictFile] = useState('');

  // Real state districts built from the design spec's school databases (public/leagues)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}leagues/index.json`)
      .then((r) => (r.ok ? r.json() : []))
      // Only playable states are offered (Texas for now); the other states' data waits for their rules
      .then((index: LeagueIndexEntry[]) => setLeagueIndex(index.filter((s) => PLAYABLE_STATES.includes(s.state))))
      .catch(() => setLeagueIndex([]));
  }, []);
  const stateDistricts = leagueIndex.find((s) => s.state === selectedState)?.districts ?? [];

  const handleSaveToBrowser = async () => {
    await saveGame();
    setFeedback('Game saved! Find it on the Load Game screen.');
  };

  const handleLoadFromBrowser = async () => {
    const save = await loadSaveGame(AUTOSAVE_ID);
    if (save) {
      loadGame(save);
      setFeedback('Autosave restored!');
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

  // Imported districts start a fresh season with a new schedule
  const applyImport = (json: string, label: string) => {
    const res = importCustomDistrictJSON(json);
    if (res.success && res.teams) {
      useGameStore.getState().startNewSeason({ ...buildCustomLeague(res.teams, label), userTeamId: res.teams[0].id });
      setFeedback(`${label} loaded. You now coach ${res.teams[0].name}; a new season begins.`);
    } else {
      setFeedback(`Import error: ${res.error}`);
    }
  };

  const handleImportJSON = () => applyImport(importText, 'Custom district');

  // A real state district: a playable state's whole top class, otherwise that state's nearest districts
  const handleLoadStateDistrict = async () => {
    const userIndex = stateDistricts.findIndex((d) => d.file === selectedDistrictFile);
    if (userIndex < 0) return;
    const fetchDistrict = async (file: string): Promise<StateDistrictFile> => {
      const response = await fetch(`${import.meta.env.BASE_URL}leagues/${file}`);
      if (!response.ok) throw new Error(file);
      return response.json();
    };
    try {
      setFeedback('Building the league…');
      const userDistrict = await fetchDistrict(stateDistricts[userIndex].file);
      if (!userDistrict.schools?.length) throw new Error('empty district');
      let world: GameWorld;
      if (PLAYABLE_STATES.includes(userDistrict.state)) {
        // Playable states have their whole top class bundled: coach this district's first school in it
        world = buildStateWorld(userDistrict.state, userDistrict.schools[0].name);
      } else {
        const neighbors = await Promise.all(nearestDistrictIndexes(stateDistricts.length, userIndex).map((i) => fetchDistrict(stateDistricts[i].file)));
        world = buildStateLeague(userDistrict, neighbors);
      }
      useGameStore.getState().startNewSeason(world);
      const userTeam = world.teams.find((t) => t.id === world.userTeamId)!;
      setFeedback(`${stateDistricts[userIndex].name} loaded. You now coach ${userTeam.name}; a new season begins.`);
    } catch {
      setFeedback('Could not load that district.');
    }
  };

  return (
    <Sheet title="Save / Load" subtitle="Save your game, or start in another district" onClose={onClose}>
      {feedback && (
        <div role="status" style={{ background: '#EEF2FF', color: '#4338CA', padding: '10px 12px', borderRadius: '8px', marginBottom: '12px', fontSize: '14px' }}>
          {feedback}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '18px' }}>
        <button className="ui-btn ui-btn-primary" onClick={handleSaveToBrowser}>
          💾 Save game
        </button>
        <button className="ui-btn" onClick={handleLoadFromBrowser}>
          📂 Load autosave
        </button>
        <button className="ui-btn" onClick={handleExportJSON}>
          📤 Export district
        </button>
      </div>

      {leagueIndex.length > 0 && (
        <div className="ui-stack" style={{ borderTop: '1px solid #E2E8F0', paddingTop: '14px', marginBottom: '18px' }}>
          <label className="ui-label" htmlFor="state-select">
            Coach a real state district
          </label>
          <select
            id="state-select"
            className="ui-input"
            value={selectedState}
            onChange={(e) => {
              setSelectedState(e.target.value);
              setSelectedDistrictFile('');
            }}
          >
            <option value="">Choose a state…</option>
            {leagueIndex.map((s) => (
              <option key={s.state} value={s.state}>
                {s.state}
              </option>
            ))}
          </select>
          <select className="ui-input" aria-label="District" value={selectedDistrictFile} onChange={(e) => setSelectedDistrictFile(e.target.value)} disabled={!selectedState}>
            <option value="">Choose a district…</option>
            {stateDistricts.map((d) => (
              <option key={d.file} value={d.file}>
                {d.name} ({d.schools} schools)
              </option>
            ))}
          </select>
          <button className="ui-btn" style={{ background: '#0F766E', borderColor: '#0F766E', color: '#fff' }} onClick={handleLoadStateDistrict} disabled={!selectedDistrictFile}>
            🏟️ Start in this district
          </button>
        </div>
      )}

      <div className="ui-stack" style={{ borderTop: '1px solid #E2E8F0', paddingTop: '14px' }}>
        <label className="ui-label" htmlFor="custom-json">
          Import a custom district (JSON)
        </label>
        <textarea
          id="custom-json"
          className="ui-input"
          rows={4}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="Paste custom district JSON here…"
          style={{ fontFamily: 'monospace', fontSize: '14px' }}
        />
        <button className="ui-btn" style={{ background: '#4F46E5', borderColor: '#4F46E5', color: '#fff' }} onClick={handleImportJSON}>
          📥 Load custom district
        </button>
      </div>
    </Sheet>
  );
};

interface LeagueIndexEntry {
  state: string;
  districts: { name: string; file: string; schools: number }[];
}
