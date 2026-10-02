import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { DIFFICULTY_PRESTIGE, Difficulty } from '../sim/league';
import { deleteSaveGame, listSaveSummaries, loadSaveGame, SaveSummary } from '../services/db';

const DIFFICULTIES: { id: Difficulty; label: string; blurb: string; color: string }[] = [
  { id: 'EASY', label: 'Easy', blurb: 'Take over a powerhouse: deep talent, rich boosters, title expectations.', color: '#16A34A' },
  { id: 'MEDIUM', label: 'Medium', blurb: 'A solid contender. Good players, but you have to win the big games.', color: '#2563EB' },
  { id: 'HARD', label: 'Hard', blurb: 'An underdog program. Build it from the ground up.', color: '#DC2626' }
];

const prestigeRange = (d: Difficulty) => {
  const { min, max } = DIFFICULTY_PRESTIGE[d];
  return max >= 100 ? `${min}+` : `${min}–${max}`;
};

/** Title screen: start a new game at a difficulty, continue, or load a saved game. */
export const SplashScreen: React.FC<{ onEnterGame: () => void; canContinue: boolean }> = ({ onEnterGame, canContinue }) => {
  const { newGame, loadGame } = useGameStore();
  const [view, setView] = useState<'MENU' | 'NEW' | 'LOAD'>('MENU');
  const [saves, setSaves] = useState<SaveSummary[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (view !== 'LOAD') return;
    listSaveSummaries()
      .then(setSaves)
      .catch(() => setSaves([]));
  }, [view]);

  const startNew = (difficulty: Difficulty) => {
    setBusy(true);
    // Let the button state paint before building the 254-team world
    setTimeout(() => {
      newGame(difficulty);
      setBusy(false);
      onEnterGame();
    }, 20);
  };

  const load = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const save = await loadSaveGame(id);
      if (!save) throw new Error('missing');
      loadGame(save);
      onEnterGame();
    } catch {
      setError('That save could not be loaded.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await deleteSaveGame(id);
    setConfirmDelete(null);
    setSaves((list) => list?.filter((s) => s.id !== id) ?? null);
  };

  return (
    <div style={pageStyle}>
      <div style={{ width: '100%', maxWidth: '760px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '48px' }}>🏈</div>
          <h1 style={{ margin: '4px 0', fontSize: 'clamp(26px, 6vw, 40px)', letterSpacing: '1px', color: '#F8FAFC' }}>HIGH SCHOOL FOOTBALL HEAD COACH</h1>
          <p style={{ margin: 0, color: '#94A3B8', fontSize: '15px' }}>Friday nights in Texas. Your program, your call.</p>
        </div>

        {view === 'MENU' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '360px', margin: '0 auto' }}>
            {canContinue && (
              <button onClick={onEnterGame} style={menuBtn('#F59E0B', '#0F172A')}>
                ▶️ Continue
              </button>
            )}
            <button onClick={() => setView('NEW')} style={menuBtn('#16A34A', '#fff')}>
              🆕 New Game
            </button>
            <button onClick={() => setView('LOAD')} style={menuBtn('#334155', '#fff')}>
              📂 Load Game
            </button>
          </div>
        )}

        {view === 'NEW' && (
          <div>
            <h2 style={sectionTitle}>Choose a Difficulty</h2>
            <p style={{ textAlign: 'center', color: '#94A3B8', fontSize: '13px', margin: '0 0 16px 0' }}>
              You&apos;ll be hired at a random Texas 6A school in the matching prestige range.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              {DIFFICULTIES.map((d) => (
                <button key={d.id} onClick={() => startNew(d.id)} disabled={busy} style={cardBtn(d.color, busy)}>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: d.color }}>{d.label}</div>
                  <div style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 8px 0' }}>School prestige {prestigeRange(d.id)}</div>
                  <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.4 }}>{d.blurb}</div>
                </button>
              ))}
            </div>
            {busy && <p style={{ textAlign: 'center', color: '#CBD5E1', marginTop: '16px' }}>Building the league…</p>}
            <BackButton onClick={() => setView('MENU')} />
          </div>
        )}

        {view === 'LOAD' && (
          <div>
            <h2 style={sectionTitle}>Load Game</h2>
            {error && <p style={{ textAlign: 'center', color: '#FCA5A5' }}>{error}</p>}
            {saves === null && <p style={{ textAlign: 'center', color: '#CBD5E1' }}>Loading saves…</p>}
            {saves?.length === 0 && (
              <p style={{ textAlign: 'center', color: '#CBD5E1' }}>No saved games yet. Games autosave every week, and you can save anytime from ⚙️ Save / Load.</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {saves?.map((save) => (
                <div key={save.id} style={saveRow}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ fontWeight: 'bold', color: '#0F172A' }}>
                      {save.teamName}
                      {save.isAutosave && <span style={badge('#FEF3C7', '#92400E')}>Autosave</span>}
                      {save.difficulty && <span style={badge('#EEF2FF', '#3730A3')}>{save.difficulty.charAt(0) + save.difficulty.slice(1).toLowerCase()}</span>}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B' }}>
                      {save.currentYear} season · Week {save.currentWeek} · {save.wins}-{save.losses} · {new Date(save.timestamp).toLocaleString()}
                    </div>
                    {!save.isAutosave && <div style={{ fontSize: '12px', color: '#475569' }}>{save.saveName}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {confirmDelete === save.id ? (
                      <>
                        <button onClick={() => remove(save.id)} style={smallBtn('#DC2626', '#fff')}>
                          Delete
                        </button>
                        <button onClick={() => setConfirmDelete(null)} style={smallBtn('#E2E8F0', '#334155')}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => load(save.id)} disabled={busy} style={smallBtn('#2563EB', '#fff')}>
                          Load
                        </button>
                        <button onClick={() => setConfirmDelete(save.id)} disabled={busy} style={smallBtn('#E2E8F0', '#B91C1C')} aria-label={`Delete save for ${save.teamName}`}>
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <BackButton onClick={() => setView('MENU')} />
          </div>
        )}
      </div>
    </div>
  );
};

const BackButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <div style={{ textAlign: 'center', marginTop: '20px' }}>
    <button onClick={onClick} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '14px' }}>
      ← Back
    </button>
  </div>
);

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  boxSizing: 'border-box',
  background: 'radial-gradient(circle at top, #1E3A5F 0%, #0F172A 60%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '32px 16px',
  fontFamily: 'sans-serif'
};

const sectionTitle: React.CSSProperties = { textAlign: 'center', color: '#F8FAFC', margin: '0 0 8px 0', fontSize: '20px' };

const menuBtn = (background: string, color: string): React.CSSProperties => ({
  padding: '14px',
  background,
  color,
  border: 'none',
  borderRadius: '8px',
  fontWeight: 'bold',
  fontSize: '16px',
  cursor: 'pointer'
});

const cardBtn = (accent: string, disabled: boolean): React.CSSProperties => ({
  textAlign: 'left',
  background: '#fff',
  border: 'none',
  borderTop: `5px solid ${accent}`,
  borderRadius: '8px',
  padding: '16px',
  cursor: disabled ? 'wait' : 'pointer',
  opacity: disabled ? 0.7 : 1
});

const saveRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  flexWrap: 'wrap',
  background: '#fff',
  borderRadius: '8px',
  padding: '12px 14px'
};

const badge = (background: string, color: string): React.CSSProperties => ({
  background,
  color,
  fontSize: '12px',
  fontWeight: 'bold',
  padding: '2px 6px',
  borderRadius: '4px',
  marginLeft: '8px'
});

const smallBtn = (background: string, color: string): React.CSSProperties => ({
  minHeight: '40px', // comfortable tap target
  padding: '8px 12px',
  background,
  color,
  border: 'none',
  borderRadius: '6px',
  fontWeight: 'bold',
  fontSize: '13px',
  cursor: 'pointer'
});
