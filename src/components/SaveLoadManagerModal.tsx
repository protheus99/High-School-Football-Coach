import React, { useEffect, useState } from 'react';
import { useGameStore, userDistrictTeams } from '../store/gameStore';
import { exportDistrictToJSON, importCustomDistrictJSON } from '../utils/leagueImporter';
import { persistSaveGame, loadSaveGame } from '../services/db';
import { generateSeasonSchedule } from '../sim/scheduleEngine';
import { buildCustomLeague, leagueRegionTeams, LeagueStructure } from '../sim/league';
import { generateFeederPool } from '../sim/feederEngine';
import { Team } from '../types/game';

export const SaveLoadManagerModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { districtTeams, league, leagueTeams, seasonSchedule, playoffBracket, sanctionLevel, dilemmaLog, currentWeek, currentYear, userTeamId, coachingAP, practiceIntensity, activeDilemma, scoutingPool } = useGameStore();
  const [importText, setImportText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [leagueIndex, setLeagueIndex] = useState<LeagueIndexEntry[]>([]);
  const [selectedState, setSelectedState] = useState('');
  const [selectedDistrictFile, setSelectedDistrictFile] = useState('');

  // Real state districts built from the design spec's school databases (public/leagues)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}leagues/index.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((index: LeagueIndexEntry[]) => setLeagueIndex(index))
      .catch(() => setLeagueIndex([]));
  }, []);
  const stateDistricts = leagueIndex.find((s) => s.state === selectedState)?.districts ?? [];

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
      history: [],
      currentYear,
      league: league ?? undefined,
      leagueTeams,
      seasonSchedule,
      dilemmaLog,
      playoffBracket,
      sanctionLevel
    });
    setFeedback('Game successfully saved to IndexedDB!');
  };

  const handleLoadFromBrowser = async () => {
    const save = await loadSaveGame('current_save');
    if (save) {
      // League saves restore the whole world; older saves get a world built around their district
      const year = save.currentYear ?? 2026;
      let world: { league: LeagueStructure; teams: Team[] };
      if (save.league && save.leagueTeams) world = { league: save.league, teams: save.leagueTeams };
      else world = buildCustomLeague(save.districtTeams, 'Saved District');
      useGameStore.setState({
        currentYear: year,
        league: world.league,
        leagueTeams: world.teams,
        districtTeams: userDistrictTeams(world.league, world.teams, save.userTeamId),
        seasonSchedule: save.league && save.seasonSchedule ? save.seasonSchedule : generateSeasonSchedule(leagueRegionTeams(world.league, world.teams), year),
        playoffBracket: save.league ? save.playoffBracket ?? null : null,
        sanctionLevel: save.sanctionLevel ?? 0,
        dilemmaLog: save.dilemmaLog ?? [],
        currentWeek: save.league ? save.currentWeek : Math.min(save.currentWeek, 14),
        userTeamId: save.userTeamId,
        coachingAP: save.coachingAP,
        practiceIntensity: save.practiceIntensity,
        activeDilemma: save.activeDilemma,
        // Pre-pipeline saves stored simple prospects; give those a fresh feeder pool
        scoutingPool: save.scoutingPool.every((p) => 'source' in p)
          ? save.scoutingPool
          : generateFeederPool(world.teams.find((t) => t.id === save.userTeamId) ?? world.teams[0])
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

  // Imported districts start a fresh season with a new schedule
  const applyImport = (json: string, label: string) => {
    const res = importCustomDistrictJSON(json);
    if (res.success && res.teams) {
      const world = buildCustomLeague(res.teams, label);
      useGameStore.setState({
        league: world.league,
        leagueTeams: world.teams,
        districtTeams: res.teams,
        userTeamId: res.teams[0].id,
        currentWeek: 1,
        playoffBracket: null,
        activeDilemma: null,
        dilemmaLog: [],
        sanctionLevel: 0,
        seasonSchedule: generateSeasonSchedule(leagueRegionTeams(world.league, world.teams), currentYear)
      });
      setFeedback(`${label} loaded. You now coach ${res.teams[0].name}; a new season begins.`);
    } else {
      setFeedback(`Import error: ${res.error}`);
    }
  };

  const handleImportJSON = () => applyImport(importText, 'Custom district');

  const handleLoadStateDistrict = async () => {
    const district = stateDistricts.find((d) => d.file === selectedDistrictFile);
    if (!district) return;
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}leagues/${district.file}`);
      applyImport(await response.text(), district.name);
    } catch {
      setFeedback('Could not load that district.');
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

        {/* Real State Districts */}
        {leagueIndex.length > 0 && (
          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '12px', marginBottom: '12px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '6px' }}>
              Coach a Real State District:
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <select
                value={selectedState}
                onChange={(e) => { setSelectedState(e.target.value); setSelectedDistrictFile(''); }}
                style={selectStyle}
              >
                <option value="">State…</option>
                {leagueIndex.map((s) => <option key={s.state} value={s.state}>{s.state}</option>)}
              </select>
              <select value={selectedDistrictFile} onChange={(e) => setSelectedDistrictFile(e.target.value)} disabled={!selectedState} style={{ ...selectStyle, flex: 1, minWidth: '200px' }}>
                <option value="">District…</option>
                {stateDistricts.map((d) => <option key={d.file} value={d.file}>{d.name} ({d.schools} schools)</option>)}
              </select>
              <button onClick={handleLoadStateDistrict} disabled={!selectedDistrictFile} style={{ ...actionBtn, background: '#0F766E', color: '#fff' }}>
                🏟️ Load District
              </button>
            </div>
          </div>
        )}

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

interface LeagueIndexEntry {
  state: string;
  districts: { name: string; file: string; schools: number }[];
}

const selectStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: '4px',
  border: '1px solid #CBD5E1',
  fontSize: '13px'
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
